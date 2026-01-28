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
        var session = FeedbackSession()

        // Start audio recording
        if let audioPath = audioRecorder.startRecording() {
            session.audioPath = audioPath
        }

        currentSession = session
        state = .recording
        recordingDuration = 0

        timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor [weak self] in
                self?.recordingDuration += 0.1
            }
        }

        // Capture start context
        Task {
            let context = await captureContext()
            await MainActor.run {
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

        Task {
            let endContext = await captureContext()
            await MainActor.run {
                self.currentSession?.endContext = endContext
                self.currentSession?.endTime = Date()
            }
            await processSession()
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

    private func processSession() async {
        guard let session = currentSession else {
            await MainActor.run { state = .error("No session to process") }
            return
        }

        do {
            let builder = ReportBuilder(session: session)
            let zipURL = try builder.build()

            // Move to Desktop for easy access
            let desktop = FileManager.default.urls(for: .desktopDirectory, in: .userDomainMask)[0]
            let finalPath = desktop.appendingPathComponent("Feedback_\(session.id.uuidString.prefix(8)).zip")

            if FileManager.default.fileExists(atPath: finalPath.path) {
                try FileManager.default.removeItem(at: finalPath)
            }
            try FileManager.default.moveItem(at: zipURL, to: finalPath)

            await MainActor.run {
                state = .complete(finalPath)
            }
        } catch {
            await MainActor.run {
                state = .error("Failed to create report: \(error.localizedDescription)")
            }
        }
    }
}
