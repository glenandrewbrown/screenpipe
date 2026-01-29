import Foundation

public enum FeedbackState {
    case ready
    case recording
    case processing
    case complete(URL)
    case error(String)
}

@MainActor
public class FeedbackViewModel: ObservableObject {
    @Published public var state: FeedbackState = .ready
    @Published public var recordingDuration: TimeInterval = 0
    @Published public var isScreenpipeHealthy = false

    private var timer: Timer?
    private var healthCheckTask: Task<Void, Never>?
    private var currentSession: FeedbackSession?
    private let audioRecorder = AudioRecorder()

    public init() {
        startHealthCheck()
    }

    public func cleanup() {
        healthCheckTask?.cancel()
        healthCheckTask = nil
        timer?.invalidate()
        timer = nil
    }

    private func startHealthCheck() {
        healthCheckTask = Task {
            while !Task.isCancelled {
                let healthy = await ScreenpipeClient.shared.checkHealth()
                await MainActor.run {
                    self.isScreenpipeHealthy = healthy
                }
                try? await Task.sleep(nanoseconds: 5_000_000_000) // 5 seconds
            }
        }
    }

    public func startRecording() {
        // Create session with audio path atomically
        let audioPath = audioRecorder.startRecording()
        var session = FeedbackSession()
        session.audioPath = audioPath
        currentSession = session

        state = .recording
        recordingDuration = 0

        timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor [weak self] in
                self?.recordingDuration += 0.1
            }
        }

        // Capture start context - store session ID to verify consistency
        let sessionId = session.id
        Task {
            let context = await captureContext()
            await MainActor.run { [weak self] in
                guard let self, self.currentSession?.id == sessionId else { return }
                self.currentSession?.startContext = context
            }
        }
    }

    public func stopRecording() {
        // Stop audio recording
        _ = audioRecorder.stopRecording()

        timer?.invalidate()
        timer = nil
        state = .processing

        // Capture session snapshot for processing
        guard var sessionSnapshot = currentSession else {
            state = .error("No session to process")
            NotificationManager.shared.showError(message: "No session to process")
            return
        }

        Task {
            let endContext = await captureContext()
            sessionSnapshot.endContext = endContext
            sessionSnapshot.endTime = Date()

            // Update the main session with end context
            await MainActor.run { [weak self] in
                guard let self, self.currentSession?.id == sessionSnapshot.id else { return }
                self.currentSession?.endContext = endContext
                self.currentSession?.endTime = sessionSnapshot.endTime
            }

            await processSession(session: sessionSnapshot)
        }
    }

    public func reset() {
        state = .ready
        recordingDuration = 0
        currentSession = nil
    }

    private func captureContext() async -> CapturedContext {
        do {
            let ocrResponse = try await ScreenpipeClient.shared.search(contentType: "ocr", limit: 5)
            let audioResponse = try await ScreenpipeClient.shared.search(contentType: "audio", limit: 5)

            let ocrCaptures = ocrResponse.data.compactMap { result -> OCRCapture? in
                guard let frameId = result.content.frameId,
                      let text = result.content.text,
                      let appName = result.content.appName,
                      let windowName = result.content.windowName,
                      let filePath = result.content.filePath else { return nil }
                return OCRCapture(frameId: frameId, text: text, appName: appName, windowName: windowName, filePath: filePath)
            }

            let audioCaptures = audioResponse.data.compactMap { result -> AudioCapture? in
                guard let text = result.content.text,
                      let filePath = result.content.filePath else { return nil }
                return AudioCapture(transcription: text, deviceName: result.content.appName ?? "Unknown", filePath: filePath)
            }

            return CapturedContext(
                timestamp: Date(),
                ocrResults: ocrCaptures,
                audioResults: audioCaptures,
                activeApp: ocrCaptures.first?.appName,
                activeWindow: ocrCaptures.first?.windowName
            )
        } catch {
            return CapturedContext(timestamp: Date(), ocrResults: [], audioResults: [], activeApp: nil, activeWindow: nil)
        }
    }

    private func processSession(session: FeedbackSession) async {
        var processingSession = session

        do {
            // Step 1: Transcribe audio using Whisper (via screenpipe)
            if let audioPath = processingSession.audioPath {
                let transcription = try await ScreenpipeClient.shared.transcribeAudio(filePath: audioPath.path)
                processingSession.transcription = transcription
                await MainActor.run { [weak self] in
                    guard let self, self.currentSession?.id == processingSession.id else { return }
                    self.currentSession?.transcription = transcription
                }
            }

            // Step 2: Generate summary with Ollama (if available)
            if await OllamaClient.shared.checkHealth(), let transcription = processingSession.transcription {
                // Summarization is optional - don't fail if it doesn't work
                let summary = try? await OllamaClient.shared.summarize(
                    transcription: transcription,
                    context: processingSession.startContext
                )
                // Summary could be stored in session for report enhancement
                // Currently logged for debugging purposes
                if let summary = summary {
                    print("[FeedbackTool] AI Summary generated: \(summary.prefix(100))...")
                }
            }

            // Step 3: Build the feedback package
            let builder = ReportBuilder(session: processingSession)
            let zipURL = try builder.build()

            // Move to Desktop for easy access
            let desktop = FileManager.default.urls(for: .desktopDirectory, in: .userDomainMask)[0]
            let finalPath = desktop.appendingPathComponent("Feedback_\(processingSession.id.uuidString.prefix(8)).zip")

            if FileManager.default.fileExists(atPath: finalPath.path) {
                try FileManager.default.removeItem(at: finalPath)
            }
            try FileManager.default.moveItem(at: zipURL, to: finalPath)

            await MainActor.run {
                state = .complete(finalPath)
                NotificationManager.shared.showSuccess(path: finalPath)
            }
        } catch {
            await MainActor.run {
                state = .error("Processing failed: \(error.localizedDescription)")
                NotificationManager.shared.showError(message: error.localizedDescription)
            }
        }
    }
}
