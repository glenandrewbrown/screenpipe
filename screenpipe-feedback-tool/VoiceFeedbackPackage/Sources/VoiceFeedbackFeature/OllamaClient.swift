import Foundation

public final class OllamaClient: Sendable {
    public static let shared = OllamaClient()
    private let baseURL = URL(string: "http://localhost:11434")!

    private init() {}

    public func summarize(transcription: String, context: CapturedContext?) async throws -> String {
        let url = baseURL.appendingPathComponent("api/generate")

        let activeApp = context?.activeApp ?? "Unknown"
        let activeWindow = context?.activeWindow ?? "Unknown"
        let screenText = context?.ocrResults.prefix(3).map { $0.text }.joined(separator: " | ") ?? "None"

        let prompt = """
        Summarize this user feedback into a concise bug report format:

        USER SAID: \(transcription)

        CONTEXT:
        - App: \(activeApp)
        - Window: \(activeWindow)
        - Screen text: \(screenText)

        Output a structured summary with: Issue, Steps, Expected, Actual
        """

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = [
            "model": "llama3.2",
            "prompt": prompt,
            "stream": false
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, _) = try await URLSession.shared.data(for: request)

        struct OllamaResponse: Codable {
            let response: String
        }

        let result = try JSONDecoder().decode(OllamaResponse.self, from: data)
        return result.response
    }

    public func checkHealth() async -> Bool {
        let url = baseURL.appendingPathComponent("api/tags")
        do {
            let (_, response) = try await URLSession.shared.data(from: url)
            return (response as? HTTPURLResponse)?.statusCode == 200
        } catch {
            return false
        }
    }
}
