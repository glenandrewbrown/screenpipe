import SwiftUI
import AppKit

public struct FeedbackView: View {
    @StateObject private var viewModel = FeedbackViewModel()

    public var body: some View {
        VStack(spacing: 16) {
            statusIcon
            statusText
            actionButton
        }
        .padding(20)
        .frame(width: 280, height: 200)
    }

    @ViewBuilder
    private var statusIcon: some View {
        switch viewModel.state {
        case .ready:
            Image(systemName: "mic.circle.fill")
                .font(.system(size: 48))
                .foregroundColor(.green)
        case .recording:
            Image(systemName: "stop.circle.fill")
                .font(.system(size: 48))
                .foregroundColor(.red)
        case .processing:
            ProgressView()
                .scaleEffect(2)
        case .complete:
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 48))
                .foregroundColor(.green)
        case .error:
            Image(systemName: "exclamationmark.circle.fill")
                .font(.system(size: 48))
                .foregroundColor(.orange)
        }
    }

    @ViewBuilder
    private var statusText: some View {
        switch viewModel.state {
        case .ready:
            Text("Ready to Record")
                .font(.headline)
        case .recording:
            Text(String(format: "Recording: %.1fs", viewModel.recordingDuration))
                .font(.headline)
                .foregroundColor(.red)
        case .processing:
            Text("Processing...")
                .font(.headline)
        case .complete:
            Text("Report Ready!")
                .font(.headline)
        case .error(let message):
            Text(message)
                .font(.caption)
                .foregroundColor(.secondary)
        }
    }

    @ViewBuilder
    private var actionButton: some View {
        switch viewModel.state {
        case .ready:
            Button("Start Feedback") {
                viewModel.startRecording()
            }
            .buttonStyle(.borderedProminent)
        case .recording:
            Button("Stop & Save") {
                viewModel.stopRecording()
            }
            .buttonStyle(.borderedProminent)
            .tint(.red)
        case .processing:
            EmptyView()
        case .complete(let url):
            Button("Show in Finder") {
                NSWorkspace.shared.selectFile(url.path, inFileViewerRootedAtPath: url.deletingLastPathComponent().path)
            }
            .buttonStyle(.borderedProminent)
        case .error:
            Button("Try Again") {
                viewModel.reset()
            }
            .buttonStyle(.bordered)
        }
    }

    public init() {}
}

#Preview {
    FeedbackView()
}
