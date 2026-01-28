import SwiftUI

/// Placeholder view for the feedback popover.
/// This will be fully implemented in Task 1.2.
public struct FeedbackView: View {
    public var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "mic.circle.fill")
                .font(.system(size: 48))
                .foregroundColor(.accentColor)

            Text("Voice Feedback")
                .font(.headline)

            Text("Placeholder - UI coming in Task 1.2")
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .frame(width: 280, height: 200)
        .padding()
    }

    public init() {}
}

#Preview {
    FeedbackView()
}
