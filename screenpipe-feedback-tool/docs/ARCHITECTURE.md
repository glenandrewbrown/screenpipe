# Voice Feedback Tool -- Architecture & Developer Guide

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Module Dependency Graph](#module-dependency-graph)
3. [Component Reference](#component-reference)
4. [State Management](#state-management)
5. [Concurrency Model](#concurrency-model)
6. [API Integration](#api-integration)
7. [Security Model](#security-model)
8. [Build System](#build-system)
9. [Extension Points](#extension-points)

---

## System Architecture

### High-Level Overview

```
+-------------------------------------------------------------------+
|                       macOS Menu Bar                               |
|  +-------------------------------------------------------------+  |
|  |  NSStatusItem (mic.circle icon)                              |  |
|  |    Left Click --> NSPopover (FeedbackView)                   |  |
|  |    Right Click --> NSMenu (Open / Launch at Login / Quit)    |  |
|  +-------------------------------------------------------------+  |
+-------------------------------------------------------------------+
         |                    |                    |
         v                    v                    v
+----------------+  +------------------+  +------------------+
| AppDelegate    |  | HotkeyManager    |  | LaunchAtLogin    |
| Menu bar setup |  | Carbon hotkey    |  | SMAppService     |
| Click routing  |  | Cmd+Shift+R      |  | macOS 13+ API    |
+----------------+  +------------------+  +------------------+
         |
         v
+-------------------------------------------------------------------+
|  FeedbackView (SwiftUI)                                           |
|  +-------------------------------------------------------------+  |
|  |  @StateObject FeedbackViewModel                              |  |
|  |                                                              |  |
|  |  States: ready | recording | processing | complete | error   |  |
|  +-------------------------------------------------------------+  |
+-------------------------------------------------------------------+
         |
         v
+-------------------------------------------------------------------+
|  FeedbackViewModel (@MainActor)                                   |
|  +-------------------------------------------------------------+  |
|  |  AudioRecorder        | AVFoundation 16kHz mono M4A          |  |
|  |  ScreenpipeClient     | REST: health, search, transcribe     |  |
|  |  OllamaClient         | REST: summarize (optional)           |  |
|  |  ReportBuilder        | ZIP package creation                 |  |
|  |  NotificationManager  | UNUserNotificationCenter             |  |
|  +-------------------------------------------------------------+  |
+-------------------------------------------------------------------+
         |                    |
         v                    v
+------------------+  +------------------+
| screenpipe       |  | Ollama           |
| localhost:3030   |  | localhost:11434  |
| (required)       |  | (optional)       |
+------------------+  +------------------+
```

### Workspace + SPM Package Architecture

```
VoiceFeedback.xcworkspace
  |
  +-- VoiceFeedback.xcodeproj (App Shell)
  |     |
  |     +-- VoiceFeedbackApp.swift (@main)
  |     +-- Assets.xcassets
  |     +-- Entitlements
  |
  +-- VoiceFeedbackPackage (SPM Package)
        |
        +-- VoiceFeedbackFeature (library target)
              |
              +-- 11 Swift source files
              +-- 0 external dependencies
```

**Why this structure?**
- App shell is minimal (1 file) -- reduces xcodeproj merge conflicts
- Feature code in SPM package -- faster incremental builds, better isolation
- Xcode 16 buildable folders -- no manual file management in project

---

## Module Dependency Graph

```
                    FeedbackView
                        |
                        v
                 FeedbackViewModel
                   /    |    \
                  /     |     \
                 v      v      v
        AudioRecorder  |  ReportBuilder
                       |       |
                       v       v
              ScreenpipeClient  (uses FeedbackSession)
                       |
                       v
                 OllamaClient (optional)

  Standalone:
    HotkeyManager ---- AppDelegate ---- LaunchAtLogin
                                |
                         NotificationManager
```

### Dependency Rules

1. **No circular dependencies** -- data flows top-down
2. **Models are leaf nodes** -- FeedbackSession, CapturedContext have no dependencies
3. **Clients are singletons** -- ScreenpipeClient, OllamaClient, NotificationManager
4. **View layer depends on ViewModel only** -- FeedbackView -> FeedbackViewModel

---

## Component Reference

### AppDelegate.swift

**Role:** Menu bar lifecycle and event routing

```
+-------------------------------------------------------+
|  AppDelegate                                          |
|-------------------------------------------------------|
|  statusItem: NSStatusItem      Menu bar icon          |
|  popover: NSPopover            FeedbackView container |
|  contextMenu: NSMenu           Right-click menu       |
|-------------------------------------------------------|
|  setupMenuBar()                Create icon + popover  |
|  setupContextMenu()            Build right-click menu |
|  setupHotkey()                 Register Cmd+Shift+R   |
|  handleStatusItemClick()       Route left/right click |
|  togglePopover()               Show/hide popover      |
|  toggleLaunchAtLogin()         Toggle SMAppService     |
+-------------------------------------------------------+
```

**Click routing logic:**
```
NSStatusItem.button receives click
    |
    +-- rightMouseUp? --> Show contextMenu
    |                     (statusItem.menu trick for one-shot menu)
    |
    +-- leftMouseUp? ---> togglePopover()
```

### FeedbackView.swift

**Role:** SwiftUI popover interface

Layout: 280x200 points, vertically stacked

```
+----------------------------+
|   statusIcon               |  48pt system symbol
|   statusText               |  Headline font
|   actionButton             |  Contextual button
+----------------------------+
```

Each section is a `@ViewBuilder` that switches on `viewModel.state`.

### FeedbackState.swift

**Role:** Core state machine and processing orchestration

```
FeedbackViewModel (@MainActor, ObservableObject)
  |
  +-- @Published state: FeedbackState
  +-- @Published recordingDuration: TimeInterval
  +-- @Published isScreenpipeHealthy: Bool
  |
  +-- currentSession: FeedbackSession? (mutable struct)
  +-- audioRecorder: AudioRecorder
  +-- timer: Timer? (0.1s interval for duration display)
  +-- healthCheckTask: Task (5s polling interval)
  |
  Methods:
  +-- startRecording()    --> .ready -> .recording
  +-- stopRecording()     --> .recording -> .processing
  +-- reset()             --> any -> .ready
  +-- captureContext()    --> screenpipe OCR + audio search
  +-- processSession()   --> transcribe -> summarize -> build -> complete
  +-- cleanup()           --> cancel tasks, invalidate timer
```

**Race condition prevention:**
- Session ID guards ensure async callbacks only modify the current session
- `processSession(session:)` takes a snapshot to avoid mutation during async work

### FeedbackSession.swift

**Role:** Data models

```
FeedbackSession (struct)
  +-- id: UUID
  +-- startTime: Date
  +-- endTime: Date?
  +-- startContext: CapturedContext?
  +-- endContext: CapturedContext?
  +-- audioPath: URL?
  +-- transcription: String?

CapturedContext (struct, Sendable)
  +-- timestamp: Date
  +-- ocrResults: [OCRCapture]
  +-- audioResults: [AudioCapture]
  +-- activeApp: String?
  +-- activeWindow: String?

OCRCapture (struct, Sendable)
  +-- frameId: Int
  +-- text: String
  +-- appName: String
  +-- windowName: String
  +-- filePath: String

AudioCapture (struct, Sendable)
  +-- transcription: String
  +-- deviceName: String
  +-- filePath: String
```

### AudioRecorder.swift

**Role:** AVFoundation microphone recording

```
AudioRecorder (@MainActor, NSObject, ObservableObject)
  |
  Recording format:
  +-- Format: MPEG4 AAC (kAudioFormatMPEG4AAC)
  +-- Sample rate: 16,000 Hz
  +-- Channels: 1 (mono)
  +-- Quality: AVAudioQuality.high
  |
  Output: ~/Documents/feedback_{UUID}.m4a
  |
  Permission flow:
  +-- .authorized --> ready
  +-- .notDetermined --> requestAccess() --> callback
  +-- .denied/.restricted --> error
```

### ScreenpipeClient.swift

**Role:** REST client for screenpipe server

```
ScreenpipeClient (Sendable, singleton)
  Base URL: http://localhost:3030
  |
  +-- checkHealth() -> Bool
  |     GET /health
  |     Returns: statusCode == 200
  |
  +-- search(query, contentType, limit, startTime) -> SearchResponse
  |     GET /search?q=&content_type=&limit=&start_time=
  |     Returns: { data: [SearchResult], pagination: Pagination }
  |
  +-- transcribeAudio(filePath) -> String
        POST /experimental/transcribe
        Body: { "file_path": "/path/to/audio.m4a" }
        Returns: { "text": "transcribed text" }
```

### OllamaClient.swift

**Role:** REST client for local Ollama AI

```
OllamaClient (Sendable, singleton)
  Base URL: http://localhost:11434
  |
  +-- checkHealth() -> Bool
  |     GET /api/tags
  |     Returns: statusCode == 200
  |
  +-- summarize(transcription, context) -> String
        POST /api/generate
        Body: { model: "llama3.2", prompt: "...", stream: false }
        Prompt includes: transcription + activeApp + activeWindow + screenText
        Returns: { "response": "structured summary" }
```

### ReportBuilder.swift

**Role:** ZIP package assembly

```
ReportBuilder
  Input: FeedbackSession
  Output: URL to .zip file
  |
  Process:
  1. Create temp directory: /tmp/feedback_{UUID}/
  2. Copy recording.m4a
  3. Copy screenshot_N.png from OCR context
  4. Generate metadata.json (FeedbackReport, pretty-printed)
  5. Create ZIP via /usr/bin/zip -r
  6. Validate exit code (terminationStatus == 0)
  7. Clean up temp directory
  8. Return ZIP URL
```

### HotkeyManager.swift

**Role:** Global keyboard shortcut

```
HotkeyManager (@MainActor, singleton)
  |
  Hotkey: Cmd+Shift+R
  Key code: 15 (R key)
  Modifiers: cmdKey | shiftKey
  Signature: "VFBK" (FourCharCode)
  |
  Uses Carbon API:
  +-- RegisterEventHotKey()
  +-- InstallEventHandler()
  +-- UnregisterEventHotKey()
```

### NotificationManager.swift

**Role:** macOS system notifications

```
NotificationManager (@MainActor, singleton)
  |
  +-- requestPermission()  Asks for .alert + .sound
  +-- showSuccess(path)    "Feedback Ready" notification
  +-- showError(message)   "Feedback Failed" notification
```

### LaunchAtLogin.swift

**Role:** Start-at-login toggle

```
LaunchAtLogin (static utility)
  |
  Uses: SMAppService.mainApp (macOS 13+)
  +-- isEnabled: Bool (get/set)
  +-- get: .status == .enabled
  +-- set true: .register()
  +-- set false: .unregister()
```

---

## State Management

### FeedbackState Enum

```swift
public enum FeedbackState {
    case ready                 // Initial state, can start recording
    case recording             // Audio capture active
    case processing            // Building report package
    case complete(URL)         // Report ZIP URL on Desktop
    case error(String)         // Error message to display
}
```

### State Transitions

```
               startRecording()
    ready ──────────────────────> recording
      ^                              |
      |                              | stopRecording()
      | reset()                      v
      |                          processing
      |                           /      \
      |                    success        failure
      |                     /                \
      +---- complete(URL) <                   > error(String) ──> reset() ──> ready
```

### Session Lifecycle

```
startRecording():
  1. Create FeedbackSession(id: UUID, startTime: Date)
  2. AudioRecorder.startRecording() -> audioPath
  3. Set session.audioPath
  4. Set state = .recording
  5. Start 0.1s timer for duration display
  6. Async: captureContext() -> session.startContext (guarded by session ID)

stopRecording():
  1. AudioRecorder.stopRecording()
  2. Invalidate timer
  3. Set state = .processing
  4. Take session snapshot
  5. Async: captureContext() -> endContext
  6. Async: processSession(snapshot)

processSession(session):
  1. Transcribe audio via screenpipe -> session.transcription
  2. If Ollama healthy: summarize(transcription, context)
  3. ReportBuilder.build() -> ZIP URL
  4. Move ZIP to ~/Desktop/Feedback_{id_prefix}.zip
  5. Set state = .complete(finalPath)
  6. Show success notification
```

---

## Concurrency Model

### Thread Safety

| Component | Isolation | Strategy |
|-----------|-----------|----------|
| FeedbackViewModel | @MainActor | UI state on main thread |
| AudioRecorder | @MainActor | AVFoundation requires main |
| ScreenpipeClient | Sendable | Immutable singleton, URLSession is thread-safe |
| OllamaClient | Sendable | Immutable singleton, URLSession is thread-safe |
| HotkeyManager | @MainActor | Carbon APIs require main |
| NotificationManager | @MainActor | UNNotificationCenter on main |
| FeedbackSession | Value type | Struct copied across boundaries |
| CapturedContext | Sendable | Immutable after creation |

### Async Patterns

**Session ID guards:**
```swift
let sessionId = session.id
Task {
    let context = await captureContext()
    await MainActor.run { [weak self] in
        // Only update if session hasn't changed
        guard let self, self.currentSession?.id == sessionId else { return }
        self.currentSession?.startContext = context
    }
}
```

**Snapshot-based processing:**
```swift
// Take snapshot before async boundary
guard var sessionSnapshot = currentSession else { return }

Task {
    let endContext = await captureContext()
    sessionSnapshot.endContext = endContext
    // Process the snapshot, not the mutable original
    await processSession(session: sessionSnapshot)
}
```

---

## API Integration

### screenpipe REST API

**Health Check:**
```
GET http://localhost:3030/health
Response: HTTP 200 (healthy) or connection refused
Polling: Every 5 seconds via background Task
```

**Search:**
```
GET http://localhost:3030/search
  ?q=           (query string, default "")
  &content_type= (ocr | audio | all)
  &limit=       (results count, default 50)
  &start_time=  (ISO8601 date, optional)

Response:
{
  "data": [
    {
      "type": "ocr",
      "content": {
        "frame_id": 123,
        "text": "visible text",
        "timestamp": "2026-01-28T20:30:00Z",
        "app_name": "Safari",
        "window_name": "Dashboard",
        "file_path": "/path/to/screenshot.png"
      }
    }
  ],
  "pagination": { "limit": 50, "offset": 0, "total": 100 }
}
```

**Transcribe:**
```
POST http://localhost:3030/experimental/transcribe
Content-Type: application/json

{ "file_path": "/absolute/path/to/audio.m4a" }

Response:
{ "text": "transcribed speech content" }
```

### Ollama REST API

**Health Check:**
```
GET http://localhost:11434/api/tags
Response: HTTP 200 with model list
```

**Generate:**
```
POST http://localhost:11434/api/generate
Content-Type: application/json

{
  "model": "llama3.2",
  "prompt": "Summarize this feedback...",
  "stream": false
}

Response:
{ "response": "Issue: ...\nSteps: ...\nExpected: ...\nActual: ..." }
```

---

## Security Model

### Entitlements

```xml
<!-- Sandbox DISABLED for localhost access -->
<key>com.apple.security.app-sandbox</key>
<false/>

<!-- Microphone recording -->
<key>com.apple.security.device.audio-input</key>
<true/>

<!-- File read/write for reports -->
<key>com.apple.security.files.user-selected.read-write</key>
<true/>

<!-- HTTP client for screenpipe + Ollama -->
<key>com.apple.security.network.client</key>
<true/>
```

### Data Privacy

- All data stays local (localhost only)
- No cloud services, no analytics, no telemetry
- Audio files stored in user Documents directory
- Final reports delivered to user Desktop
- Temp files cleaned up after ZIP creation

### Network Access

Only two localhost connections:
- `localhost:3030` (screenpipe)
- `localhost:11434` (Ollama, optional)

No outbound internet connections.

---

## Build System

### XCConfig Hierarchy

```
Config/Shared.xcconfig        # Bundle ID, version, deployment target
  |
  +-- Config/Debug.xcconfig   # Debug flags, no optimization
  +-- Config/Release.xcconfig # Optimization, stripping
  +-- Config/Tests.xcconfig   # Test host, coverage
```

### Key Build Settings

| Setting | Value |
|---------|-------|
| MACOSX_DEPLOYMENT_TARGET | 14.0 |
| SWIFT_VERSION | 6 |
| PRODUCT_BUNDLE_IDENTIFIER | com.screenpipe.voicefeedback |
| CODE_SIGN_STYLE | Automatic |
| SWIFT_STRICT_CONCURRENCY | complete |

---

## Extension Points

### Adding New Output Formats

Modify `ReportBuilder.build()` to add formats:

```swift
// Example: Add Markdown report
let markdown = """
# Feedback Report \(session.id.uuidString.prefix(8))
**Date:** \(session.startTime)
**App:** \(session.startContext?.activeApp ?? "Unknown")
## Transcription
\(session.transcription ?? "No transcription")
"""
try markdown.write(to: outputDir.appendingPathComponent("report.md"),
                   atomically: true, encoding: .utf8)
```

### Swapping AI Backend

Replace `OllamaClient` with any local or remote LLM:

```swift
protocol FeedbackSummarizer: Sendable {
    func checkHealth() async -> Bool
    func summarize(transcription: String, context: CapturedContext?) async throws -> String
}
```

### Adding Upload Support

After `ReportBuilder.build()` returns the ZIP:

```swift
// Upload to issue tracker
let uploadURL = URL(string: "https://api.github.com/repos/org/repo/issues")!
var request = URLRequest(url: uploadURL)
request.httpMethod = "POST"
// Attach ZIP as multipart form data
```

### Custom Hotkeys

Modify `HotkeyManager.register()`:

```swift
// Change to Cmd+Shift+F
let keyCode: UInt32 = 3  // 'F' key
```

Key codes: https://developer.apple.com/documentation/carbon/kVK_ANSI_A
