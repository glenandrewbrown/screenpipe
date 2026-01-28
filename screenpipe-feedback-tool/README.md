# VoiceFeedback - macOS App

A modern macOS application using a **workspace + SPM package** architecture for clean separation between app shell and feature code.

## Project Architecture

```
VoiceFeedback/
├── VoiceFeedback.xcworkspace/              # Open this file in Xcode
├── VoiceFeedback.xcodeproj/                # App shell project
├── VoiceFeedback/                          # App target (minimal)
│   ├── Assets.xcassets/                # App-level assets (icons, colors)
│   ├── VoiceFeedbackApp.swift              # App entry point
│   ├── VoiceFeedback.entitlements          # App sandbox settings
│   └── VoiceFeedback.xctestplan            # Test configuration
├── VoiceFeedbackPackage/                   # 🚀 Primary development area
│   ├── Package.swift                   # Package configuration
│   ├── Sources/VoiceFeedbackFeature/       # Your feature code
│   └── Tests/VoiceFeedbackFeatureTests/    # Unit tests
└── VoiceFeedbackUITests/                   # UI automation tests
```

## Key Architecture Points

### Workspace + SPM Structure
- **App Shell**: `VoiceFeedback/` contains minimal app lifecycle code
- **Feature Code**: `VoiceFeedbackPackage/Sources/VoiceFeedbackFeature/` is where most development happens
- **Separation**: Business logic lives in the SPM package, app target just imports and displays it

### Buildable Folders (Xcode 16)
- Files added to the filesystem automatically appear in Xcode
- No need to manually add files to project targets
- Reduces project file conflicts in teams

### App Sandbox
The app is sandboxed by default with basic file access permissions. Modify `VoiceFeedback.entitlements` to add capabilities as needed.

## Development Notes

### Code Organization
Most development happens in `VoiceFeedbackPackage/Sources/VoiceFeedbackFeature/` - organize your code as you prefer.

### Public API Requirements
Types exposed to the app target need `public` access:
```swift
public struct SettingsView: View {
    public init() {}
    
    public var body: some View {
        // Your view code
    }
}
```

### Adding Dependencies
Edit `VoiceFeedbackPackage/Package.swift` to add SPM dependencies:
```swift
dependencies: [
    .package(url: "https://github.com/example/SomePackage", from: "1.0.0")
],
targets: [
    .target(
        name: "VoiceFeedbackFeature",
        dependencies: ["SomePackage"]
    ),
]
```

### Test Structure
- **Unit Tests**: `VoiceFeedbackPackage/Tests/VoiceFeedbackFeatureTests/` (Swift Testing framework)
- **UI Tests**: `VoiceFeedbackUITests/` (XCUITest framework)
- **Test Plan**: `VoiceFeedback.xctestplan` coordinates all tests

## Configuration

### XCConfig Build Settings
Build settings are managed through **XCConfig files** in `Config/`:
- `Config/Shared.xcconfig` - Common settings (bundle ID, versions, deployment target)
- `Config/Debug.xcconfig` - Debug-specific settings  
- `Config/Release.xcconfig` - Release-specific settings
- `Config/Tests.xcconfig` - Test-specific settings

### App Sandbox & Entitlements
The app is sandboxed by default with basic file access. Edit `VoiceFeedback/VoiceFeedback.entitlements` to add capabilities:
```xml
<key>com.apple.security.files.user-selected.read-write</key>
<true/>
<key>com.apple.security.network.client</key>
<true/>
<!-- Add other entitlements as needed -->
```

## macOS-Specific Features

### Window Management
Add multiple windows and settings panels:
```swift
@main
struct VoiceFeedbackApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        
        Settings {
            SettingsView()
        }
    }
}
```

### Asset Management
- **App-Level Assets**: `VoiceFeedback/Assets.xcassets/` (app icon with multiple sizes, accent color)
- **Feature Assets**: Add `Resources/` folder to SPM package if needed

### SPM Package Resources
To include assets in your feature package:
```swift
.target(
    name: "VoiceFeedbackFeature",
    dependencies: [],
    resources: [.process("Resources")]
)
```

## Notes

### Generated with XcodeBuildMCP
This project was scaffolded using [XcodeBuildMCP](https://github.com/cameroncooke/XcodeBuildMCP), which provides tools for AI-assisted macOS development workflows.