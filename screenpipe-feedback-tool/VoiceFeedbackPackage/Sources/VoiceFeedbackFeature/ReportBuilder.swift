import Foundation
import AppKit

public struct FeedbackReport: Codable {
    public let id: String
    public let timestamp: String
    public let duration: TimeInterval
    public let transcription: String?
    public let summary: String?
    public let activeApp: String?
    public let activeWindow: String?
    public let screenContext: [String]

    public init(
        id: String,
        timestamp: String,
        duration: TimeInterval,
        transcription: String?,
        summary: String?,
        activeApp: String?,
        activeWindow: String?,
        screenContext: [String]
    ) {
        self.id = id
        self.timestamp = timestamp
        self.duration = duration
        self.transcription = transcription
        self.summary = summary
        self.activeApp = activeApp
        self.activeWindow = activeWindow
        self.screenContext = screenContext
    }
}

public class ReportBuilder {
    private let session: FeedbackSession
    private let outputDir: URL

    public init(session: FeedbackSession) {
        self.session = session
        let tempDir = FileManager.default.temporaryDirectory
        self.outputDir = tempDir.appendingPathComponent("feedback_\(session.id.uuidString)")
    }

    public func build() throws -> URL {
        // Create output directory
        try FileManager.default.createDirectory(at: outputDir, withIntermediateDirectories: true)

        // Copy audio file
        if let audioPath = session.audioPath {
            let destAudio = outputDir.appendingPathComponent("recording.m4a")
            try FileManager.default.copyItem(at: audioPath, to: destAudio)
        }

        // Copy screenshots from context
        var screenshotPaths: [String] = []
        for (index, ocr) in (session.startContext?.ocrResults ?? []).enumerated() {
            if let sourceURL = URL(string: ocr.filePath) {
                let destPath = "screenshot_\(index).png"
                let destURL = outputDir.appendingPathComponent(destPath)
                try? FileManager.default.copyItem(at: sourceURL, to: destURL)
                screenshotPaths.append(destPath)
            }
        }

        // Create metadata JSON
        let report = FeedbackReport(
            id: session.id.uuidString,
            timestamp: ISO8601DateFormatter().string(from: session.startTime),
            duration: session.endTime?.timeIntervalSince(session.startTime) ?? 0,
            transcription: session.transcription,
            summary: nil,
            activeApp: session.startContext?.activeApp,
            activeWindow: session.startContext?.activeWindow,
            screenContext: session.startContext?.ocrResults.map { $0.text } ?? []
        )

        let encoder = JSONEncoder()
        encoder.outputFormatting = .prettyPrinted
        let jsonData = try encoder.encode(report)
        try jsonData.write(to: outputDir.appendingPathComponent("metadata.json"))

        // Create ZIP
        return try createZip()
    }

    private func createZip() throws -> URL {
        let zipPath = FileManager.default.temporaryDirectory
            .appendingPathComponent("feedback_\(session.id.uuidString).zip")

        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/usr/bin/zip")
        task.arguments = ["-r", zipPath.path, "."]
        task.currentDirectoryURL = outputDir

        try task.run()
        task.waitUntilExit()

        return zipPath
    }
}
