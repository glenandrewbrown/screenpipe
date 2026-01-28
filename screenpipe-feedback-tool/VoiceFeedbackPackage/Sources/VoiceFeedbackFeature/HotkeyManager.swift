import Cocoa
import Carbon

@MainActor
public class HotkeyManager {
    public static let shared = HotkeyManager()

    private var hotKeyRef: EventHotKeyRef?
    private var callback: (() -> Void)?

    private init() {}

    public func register(callback: @escaping () -> Void) {
        self.callback = callback

        var hotKeyID = EventHotKeyID()
        hotKeyID.signature = OSType("VFBK".fourCharCode)
        hotKeyID.id = 1

        // Cmd+Shift+R
        let modifiers: UInt32 = UInt32(cmdKey | shiftKey)
        let keyCode: UInt32 = 15 // 'R' key

        var eventType = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))

        InstallEventHandler(GetApplicationEventTarget(), { (_, event, _) -> OSStatus in
            HotkeyManager.shared.callback?()
            return noErr
        }, 1, &eventType, nil, nil)

        RegisterEventHotKey(keyCode, modifiers, hotKeyID, GetApplicationEventTarget(), 0, &hotKeyRef)
    }

    public func unregister() {
        if let ref = hotKeyRef {
            UnregisterEventHotKey(ref)
            hotKeyRef = nil
        }
    }
}

private extension String {
    var fourCharCode: FourCharCode {
        var result: FourCharCode = 0
        for char in utf8.prefix(4) {
            result = result << 8 + FourCharCode(char)
        }
        return result
    }
}
