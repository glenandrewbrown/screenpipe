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
        state = .recording
        recordingDuration = 0
        timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor [weak self] in
                self?.recordingDuration += 0.1
            }
        }
    }

    public func stopRecording() {
        timer?.invalidate()
        timer = nil
        state = .processing
        // Processing will be implemented in later tasks
    }

    public func reset() {
        state = .ready
        recordingDuration = 0
    }
}
