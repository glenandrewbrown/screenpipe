# Voice Feedback Tool -- User Guide

## Table of Contents

1. [Introduction](#introduction)
2. [System Requirements](#system-requirements)
3. [Installation](#installation)
4. [Getting Started](#getting-started)
5. [Recording Feedback](#recording-feedback)
6. [Understanding the Output](#understanding-the-output)
7. [Menu Bar Controls](#menu-bar-controls)
8. [Keyboard Shortcuts](#keyboard-shortcuts)
9. [Status Indicators](#status-indicators)
10. [AI-Powered Summaries](#ai-powered-summaries)
11. [Sharing Feedback Reports](#sharing-feedback-reports)
12. [Troubleshooting](#troubleshooting)
13. [FAQ](#faq)

---

## Introduction

The Voice Feedback Tool transforms how you report issues. Instead of writing detailed bug reports, simply talk about what went wrong. The tool captures your voice, the current screen context, and packages everything into a professional report that developers can immediately act on.

### What It Does

```
 YOU                           TOOL                         DEVELOPER
 +-+                          +---+                         +---+
  |   "The search bar broke"   |   Records your voice        |
  | =========================> |   Captures screen context    |
  |                            |   Transcribes via Whisper    |
  |                            |   Generates AI summary       |
  |                            |   Packages into .zip         |
  |                            | =========================>   |
  |                            |   Feedback_A1B2C3D4.zip     |
  |                            |                              |
  |                            |   Contains:                  |
  |                            |   - recording.m4a            |
  |                            |   - metadata.json            |
  |                            |   - screenshot_0.png         |
 +-+                          +---+                         +---+
```

### No Configuration Required

The tool works out of the box as long as screenpipe is running. No accounts, no cloud services, no setup wizards.

---

## System Requirements

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| macOS | 14.0 (Sonoma) | 15.0+ (Sequoia) |
| screenpipe | Running on localhost:3030 | Latest version |
| Microphone | Built-in or external | Any USB/Bluetooth mic |
| Disk Space | 50 MB per report | SSD recommended |
| Ollama (optional) | Any version | Latest with llama3.2 |

---

## Installation

### From Source (Developer Build)

1. Open `VoiceFeedback.xcworkspace` in Xcode 16+
2. Select the `VoiceFeedback` scheme
3. Press `Cmd+R` to build and run
4. The app appears in your menu bar

### First Launch Permissions

On first launch, macOS asks for:

```
+------------------------------------------+
|  "Voice Feedback" would like to access   |
|  the microphone.                          |
|                                          |
|  [ Don't Allow ]    [ OK ]              |
+------------------------------------------+
```

Click **OK** -- the app needs microphone access to record your feedback.

---

## Getting Started

### Step 1: Verify screenpipe is Running

Look for the screenpipe icon in your menu bar, or check in Terminal:

```bash
curl http://localhost:3030/health
# Should return: {"status":"ok"}
```

### Step 2: Launch Voice Feedback

The app shows a microphone icon in the menu bar:

```
  [Wi-Fi] [Battery] [🎙] [Clock]
                      ^
                      Voice Feedback icon
```

### Step 3: Record Your First Feedback

Click the microphone icon to see:

```
+----------------------------+
|       🎙 (green)           |
|                            |
|     Ready to Record        |
|                            |
|    [ Start Feedback ]      |
+----------------------------+
```

---

## Recording Feedback

### Starting a Recording

Click **Start Feedback** or press `Cmd+Shift+R`:

```
+----------------------------+
|       ⏹ (red)              |
|                            |
|   Recording: 3.2s          |
|                            |
|     [ Stop & Save ]        |
+----------------------------+
```

### Tips for Good Recordings

- **Be specific**: "The search results page shows 0 results when I search for 'meetings'"
- **Describe what you expected**: "I expected to see yesterday's meetings"
- **Mention what you see**: "The screen shows an empty list with a loading spinner"
- **Keep it under 2 minutes**: Shorter recordings produce better transcriptions

### Stopping and Processing

Click **Stop & Save**. The tool:

1. Stops recording audio
2. Captures current screen context from screenpipe
3. Sends audio to screenpipe's Whisper transcription
4. (Optional) Generates AI summary via Ollama
5. Packages everything into a ZIP file

```
+----------------------------+
|          ⟳                 |
|                            |
|      Processing...         |
|                            |
+----------------------------+
```

### When Complete

```
+----------------------------+
|       ✅ (green)            |
|                            |
|     Report Ready!          |
|                            |
|   [ Show in Finder ]       |
+----------------------------+
```

A system notification also appears:

```
+------------------------------------------+
|  🔔 Feedback Ready                       |
|  Your feedback report is on the Desktop  |
+------------------------------------------+
```

---

## Understanding the Output

### Feedback Package Location

Reports are saved to your Desktop:

```
~/Desktop/
  Feedback_A1B2C3D4.zip
  Feedback_E5F6G7H8.zip   (previous reports)
```

### Package Contents

Unzip to see:

```
Feedback_A1B2C3D4/
+-- recording.m4a          # Your voice (16kHz mono AAC)
+-- metadata.json          # Structured report data
+-- screenshot_0.png       # Screen capture at feedback time
+-- screenshot_1.png       # Additional context captures
```

### Reading metadata.json

```json
{
  "id": "A1B2C3D4-...",
  "timestamp": "2026-01-28T20:30:00Z",
  "duration": 15.3,
  "transcription": "The search bar doesn't return results...",
  "activeApp": "Safari",
  "activeWindow": "screenpipe Dashboard",
  "screenContext": [
    "Search results: 0 found",
    "Filter: All types"
  ]
}
```

| Field | Description |
|-------|-------------|
| `id` | Unique report identifier |
| `timestamp` | When the feedback was recorded |
| `duration` | Recording length in seconds |
| `transcription` | Your speech converted to text |
| `activeApp` | The app you were using |
| `activeWindow` | The specific window title |
| `screenContext` | Text visible on screen (via OCR) |

---

## Menu Bar Controls

### Left Click

Opens the feedback popover for recording.

### Right Click

Shows the context menu:

```
+-------------------+
| Open          ⌘O  |
|-------------------|
| ✓ Launch at Login |
|-------------------|
| Quit          ⌘Q  |
+-------------------+
```

| Menu Item | Action |
|-----------|--------|
| Open | Show the feedback popover |
| Launch at Login | Toggle auto-start on macOS login |
| Quit | Exit the app |

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+Shift+R` | Toggle feedback popover (global, works from any app) |
| `Cmd+Q` | Quit the app |

---

## Status Indicators

### Health Check Dot

The app continuously checks if screenpipe is running:

| Indicator | Meaning |
|-----------|---------|
| Green icon | screenpipe connected |
| Dimmed icon | screenpipe not detected |

### Recording States

| State | Icon | Description |
|-------|------|-------------|
| Ready | 🎙 Green | Waiting for you to start |
| Recording | ⏹ Red | Actively capturing audio |
| Processing | ⟳ Spinner | Building the report |
| Complete | ✅ Green | Report saved to Desktop |
| Error | ⚠ Orange | Something went wrong |

---

## AI-Powered Summaries

### What Is It?

When Ollama is running locally with the `llama3.2` model, the tool generates structured summaries from your feedback.

### Setting Up Ollama (Optional)

```bash
# Install Ollama
brew install ollama

# Pull the model
ollama pull llama3.2

# Start Ollama (runs in background)
ollama serve
```

### What the AI Adds

The AI transforms your natural speech into a structured format:

```
Your words:
  "So I was looking at the dashboard and the graph shows
   yesterday's data but the date says today, and when I
   click refresh nothing happens"

AI Summary:
  Issue: Dashboard date mismatch with stale data
  Steps: 1. Open dashboard  2. Observe date vs graph data
  Expected: Current date matches displayed data
  Actual: Date shows today, graph shows yesterday
```

### Without Ollama

The tool works perfectly without Ollama. You still get the voice recording, transcription, and screen context. The AI summary is a bonus, not a requirement.

---

## Sharing Feedback Reports

### With Developers

1. Locate the `.zip` on your Desktop
2. Attach it to a GitHub issue, Slack message, or email
3. The developer gets your voice, transcription, screenshots, and context

### With Issue Trackers

The `.zip` can be attached to:
- GitHub Issues
- Jira tickets
- Linear issues
- Email threads
- Slack messages

---

## Troubleshooting

### "screenpipe not detected"

**Check if screenpipe is running:**
```bash
curl http://localhost:3030/health
```

If no response, start screenpipe from its menu bar icon or CLI.

### "Microphone permission not granted"

Go to **System Settings > Privacy & Security > Microphone** and enable Voice Feedback.

### No Audio in Recording

- Check that your microphone is selected in System Settings > Sound > Input
- Test the mic in another app (QuickTime, Voice Memos)
- Try unplugging and reconnecting external microphones

### Report ZIP is Empty or Missing Files

- Ensure screenpipe has been running long enough to capture context
- Check that the temporary directory has write permissions
- Look in Console.app for `[FeedbackTool]` log entries

### Hotkey Not Working

- Another app may have claimed `Cmd+Shift+R`
- Check System Settings > Keyboard > Keyboard Shortcuts
- Try clicking the menu bar icon instead

### Processing Stuck

If the spinner doesn't resolve:
1. Close the popover (click outside)
2. Right-click the menu bar icon and select Quit
3. Relaunch the app

---

## FAQ

**Q: Does my voice recording leave my computer?**
A: No. All processing happens locally. Audio goes to screenpipe's local Whisper instance. Ollama runs locally too. Nothing is sent to the cloud.

**Q: How large are feedback reports?**
A: Typically 200KB-2MB depending on recording length and number of screenshots.

**Q: Can I record longer than 2 minutes?**
A: Yes, but transcription quality may decrease for very long recordings. Keep feedback focused.

**Q: Does it work without screenpipe?**
A: The app requires screenpipe for transcription and screen context. Without it, recording works but transcription and context capture will fail.

**Q: Can I change the hotkey?**
A: Not through the UI currently. Requires code change in `HotkeyManager.swift`.

**Q: Where are recordings stored temporarily?**
A: In `~/Documents/` as `.m4a` files. The final package goes to `~/Desktop/`.

**Q: Can I use a different AI model?**
A: The tool defaults to `llama3.2` via Ollama. To use a different model, modify `OllamaClient.swift`.
