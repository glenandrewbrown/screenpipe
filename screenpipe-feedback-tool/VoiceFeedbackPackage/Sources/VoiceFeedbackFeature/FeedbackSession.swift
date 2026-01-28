import Foundation

public struct FeedbackSession {
    public let id: UUID
    public let startTime: Date
    public var endTime: Date?
    public var startContext: CapturedContext?
    public var endContext: CapturedContext?
    public var audioPath: URL?
    public var transcription: String?

    public init(id: UUID = UUID(), startTime: Date = Date()) {
        self.id = id
        self.startTime = startTime
    }
}

public struct CapturedContext {
    public let timestamp: Date
    public let ocrResults: [OCRCapture]
    public let audioResults: [AudioCapture]
    public let activeApp: String?
    public let activeWindow: String?

    public init(timestamp: Date, ocrResults: [OCRCapture], audioResults: [AudioCapture], activeApp: String?, activeWindow: String?) {
        self.timestamp = timestamp
        self.ocrResults = ocrResults
        self.audioResults = audioResults
        self.activeApp = activeApp
        self.activeWindow = activeWindow
    }
}

public struct OCRCapture {
    public let frameId: Int
    public let text: String
    public let appName: String
    public let windowName: String
    public let filePath: String

    public init(frameId: Int, text: String, appName: String, windowName: String, filePath: String) {
        self.frameId = frameId
        self.text = text
        self.appName = appName
        self.windowName = windowName
        self.filePath = filePath
    }
}

public struct AudioCapture {
    public let transcription: String
    public let deviceName: String
    public let filePath: String

    public init(transcription: String, deviceName: String, filePath: String) {
        self.transcription = transcription
        self.deviceName = deviceName
        self.filePath = filePath
    }
}
