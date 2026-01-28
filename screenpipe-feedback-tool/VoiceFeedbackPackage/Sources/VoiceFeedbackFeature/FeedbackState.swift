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

    private var timer: Timer?

    public init() {}

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
