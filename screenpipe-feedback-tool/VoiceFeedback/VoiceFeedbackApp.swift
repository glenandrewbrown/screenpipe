import SwiftUI
import VoiceFeedbackFeature

@main
struct VoiceFeedbackApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        Settings {
            EmptyView()
        }
    }
}
