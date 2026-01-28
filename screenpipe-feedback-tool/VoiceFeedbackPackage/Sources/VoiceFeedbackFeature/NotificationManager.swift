import UserNotifications

@MainActor
public class NotificationManager {
    public static let shared = NotificationManager()

    private init() {
        requestPermission()
    }

    public func requestPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
    }

    public func showSuccess(path: URL) {
        let content = UNMutableNotificationContent()
        content.title = "Feedback Ready"
        content.body = "Your feedback report is on the Desktop"
        content.sound = .default

        let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request)
    }

    public func showError(message: String) {
        let content = UNMutableNotificationContent()
        content.title = "Feedback Failed"
        content.body = message
        content.sound = .default

        let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request)
    }
}
