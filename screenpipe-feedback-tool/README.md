# Voice Feedback Tool for screenpipe

A zero-configuration macOS menu bar app that lets non-technical users generate professional bug reports using voice. Record what's wrong, and the tool packages your voice, screen context, and AI-generated summary into a ready-to-share `.zip` file.

## Architecture Overview

```
                            +---------------------+
                            |  macOS Menu Bar App  |
                            |   (Swift/SwiftUI)    |
                            +----------+----------+
                                       |
                   +-------------------+-------------------+
                   |                   |                   |
           +-------v-------+  +-------v-------+  +-------v-------+
           | Audio Capture  |  | Screen Context|  | AI Processing |
           | AVFoundation   |  | screenpipe    |  | Ollama (opt)  |
           | 16kHz M4A      |  | OCR + Audio   |  | llama3.2      |
           +-------+-------+  +-------+-------+  +-------+-------+
                   |                   |                   |
                   +-------------------+-------------------+
                                       |
                            +----------v----------+
                            |   Report Builder    |
                            |   ZIP Package       |
                            +----------+----------+
                                       |
                            +----------v----------+
                            |  ~/Desktop/          |
                            |  Feedback_XXXX.zip   |
                            +---------------------+
```

## Quick Start

### Prerequisites

- macOS 14.0 (Sonoma) or later
- [screenpipe](https://github.com/mediar-ai/screenpipe) running on `localhost:3030`
- Xcode 16+ (for building from source)
- Optional: [Ollama](https://ollama.ai) with `llama3.2` model for AI summaries

### Build & Run

```bash
# Open in Xcode
open screenpipe-feedback-tool/VoiceFeedback.xcworkspace

# Or build from command line
cd screenpipe-feedback-tool
xcodebuild -workspace VoiceFeedback.xcworkspace \
  -scheme VoiceFeedbackFeature \
  -destination 'platform=macOS' build
```

### Usage

1. Launch the app -- a microphone icon appears in the menu bar
2. Click the icon (or press `Cmd+Shift+R`) to open the feedback popover
3. Click **Start Feedback** to begin recording your voice
4. Describe the issue naturally: what happened, what you expected, what you see
5. Click **Stop & Save** when done
6. The tool processes the recording and outputs a `.zip` to your Desktop
7. Share the `.zip` with your development team

## What's in the Feedback Package?

Each `.zip` contains:

| File | Description |
|------|-------------|
| `recording.m4a` | Raw voice recording (16kHz mono AAC) |
| `metadata.json` | Structured report: timestamp, duration, transcription, app context |
| `screenshot_N.png` | Screen captures from OCR context (when available) |

### Sample `metadata.json`

```json
{
  "id": "A1B2C3D4",
  "timestamp": "2026-01-28T20:30:00Z",
  "duration": 15.3,
  "transcription": "The search bar doesn't return results when I type more than 3 words...",
  "activeApp": "Safari",
  "activeWindow": "screenpipe Dashboard",
  "screenContext": ["Search results: 0 found", "Query: test search query"]
}
```

## Project Structure

```
screenpipe-feedback-tool/
+-- VoiceFeedback.xcworkspace/          # Open this in Xcode
+-- VoiceFeedback.xcodeproj/            # App shell project
+-- VoiceFeedback/                      # App target (minimal)
|   +-- VoiceFeedbackApp.swift          # @main entry point
|   +-- Assets.xcassets/                # App icon, colors
+-- VoiceFeedbackPackage/               # Feature code (SPM)
|   +-- Package.swift
|   +-- Sources/VoiceFeedbackFeature/
|       +-- AppDelegate.swift           # Menu bar setup, hotkey binding
|       +-- FeedbackView.swift          # SwiftUI popover UI
|       +-- FeedbackState.swift         # State machine + processing pipeline
|       +-- FeedbackSession.swift       # Data models (Session, Context, Captures)
|       +-- AudioRecorder.swift         # AVFoundation recording
|       +-- ScreenpipeClient.swift      # REST client for screenpipe API
|       +-- OllamaClient.swift          # REST client for Ollama AI
|       +-- ReportBuilder.swift         # ZIP package generation
|       +-- HotkeyManager.swift         # Global Cmd+Shift+R hotkey
|       +-- NotificationManager.swift   # System notifications
|       +-- LaunchAtLogin.swift         # SMAppService integration
+-- Config/                             # Build configuration
|   +-- Shared.xcconfig
|   +-- Debug.xcconfig
|   +-- Release.xcconfig
|   +-- VoiceFeedback.entitlements
+-- VoiceFeedbackUITests/              # UI automation tests
```

## Component Architecture

### State Machine

```
  +-------+     startRecording()     +-----------+
  | READY |------------------------->| RECORDING |
  +-------+                          +-----+-----+
      ^                                    |
      |  reset()                           | stopRecording()
      |                                    v
  +---+---+                          +-----+------+
  | ERROR |<-------------------------| PROCESSING |
  +-------+    processing failed     +-----+------+
                                           |
                                           | success
                                           v
                                     +-----+------+
                                     |  COMPLETE  |
                                     +------------+
```

### Data Flow

```
User clicks Start
    |
    v
AudioRecorder.startRecording() --> M4A file in Documents/
    |
    +--async--> ScreenpipeClient.search(ocr) --> CapturedContext.ocrResults
    +--async--> ScreenpipeClient.search(audio) --> CapturedContext.audioResults
    |
User clicks Stop
    |
    v
AudioRecorder.stopRecording()
    |
    +--async--> captureContext() --> endContext
    |
    v
processSession()
    |
    +--1--> ScreenpipeClient.transcribeAudio() --> transcription text
    +--2--> OllamaClient.summarize() --> AI summary (optional)
    +--3--> ReportBuilder.build() --> ZIP file
    |
    v
Move ZIP to ~/Desktop/Feedback_XXXXXXXX.zip
    |
    v
NotificationManager.showSuccess()
```

### Integration Points

| Component | Protocol | Endpoint |
|-----------|----------|----------|
| screenpipe | HTTP REST | `localhost:3030/health` |
| screenpipe | HTTP REST | `localhost:3030/search?content_type=ocr` |
| screenpipe | HTTP REST | `localhost:3030/search?content_type=audio` |
| screenpipe | HTTP REST | `localhost:3030/experimental/transcribe` |
| Ollama | HTTP REST | `localhost:11434/api/generate` |
| Ollama | HTTP REST | `localhost:11434/api/tags` (health) |

## Configuration

### Entitlements

The app requires these entitlements (sandbox disabled for screenpipe integration):

| Entitlement | Purpose |
|-------------|---------|
| `com.apple.security.app-sandbox = false` | Required for screenpipe localhost access |
| `com.apple.security.device.audio-input` | Microphone recording |
| `com.apple.security.files.user-selected.read-write` | File system access |
| `com.apple.security.network.client` | HTTP client for screenpipe + Ollama |

### Build Settings (xcconfig)

Key settings in `Config/Shared.xcconfig`:
- Deployment target: macOS 14.0
- Swift language version: 6
- Bundle ID: `com.screenpipe.voicefeedback`

### Hotkey

Default: `Cmd+Shift+R` (registered via Carbon `RegisterEventHotKey`)

## Concurrency Design

The app uses Swift 6 strict concurrency:

- `FeedbackViewModel`: `@MainActor` for UI-bound state
- `ScreenpipeClient`: `Sendable` singleton for thread-safe API calls
- `OllamaClient`: `Sendable` singleton for thread-safe API calls
- `CapturedContext`, `OCRCapture`, `AudioCapture`: `Sendable` value types
- Session processing uses snapshot-based approach to avoid race conditions across async boundaries
- Health checks run in background `Task` with cancellation support

## Troubleshooting

| Issue | Solution |
|-------|----------|
| No microphone access | Grant permission in System Settings > Privacy > Microphone |
| screenpipe not detected | Ensure screenpipe is running (`curl localhost:3030/health`) |
| No AI summaries | Install Ollama and run `ollama pull llama3.2` |
| Hotkey not working | Check System Settings > Keyboard > Shortcuts for conflicts |
| ZIP on Desktop is empty | Check Console.app for `[FeedbackTool]` log entries |

## Development

### Adding Features

All feature code goes in `VoiceFeedbackPackage/Sources/VoiceFeedbackFeature/`. Types exposed to the app target need `public` access modifiers.

### Dependencies

Edit `VoiceFeedbackPackage/Package.swift` to add SPM dependencies.

### Testing

```bash
# Unit tests
xcodebuild test -workspace VoiceFeedback.xcworkspace \
  -scheme VoiceFeedbackFeature \
  -destination 'platform=macOS'

# UI tests
xcodebuild test -workspace VoiceFeedback.xcworkspace \
  -scheme VoiceFeedbackUITests \
  -destination 'platform=macOS'
```

## License

Part of the [screenpipe](https://github.com/mediar-ai/screenpipe) project.
