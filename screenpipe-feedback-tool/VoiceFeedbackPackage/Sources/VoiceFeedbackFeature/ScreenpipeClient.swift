import Foundation

public final class ScreenpipeClient: Sendable {
    public static let shared = ScreenpipeClient()

    private let baseURL = URL(string: "http://localhost:3030")!

    private init() {}

    public func checkHealth() async -> Bool {
        let url = baseURL.appendingPathComponent("health")
        do {
            let (_, response) = try await URLSession.shared.data(from: url)
            return (response as? HTTPURLResponse)?.statusCode == 200
        } catch {
            return false
        }
    }

    public func search(query: String = "", contentType: String = "all", limit: Int = 50, startTime: Date? = nil) async throws -> SearchResponse {
        var components = URLComponents(url: baseURL.appendingPathComponent("search"), resolvingAgainstBaseURL: false)!
        var queryItems = [
            URLQueryItem(name: "q", value: query),
            URLQueryItem(name: "content_type", value: contentType),
            URLQueryItem(name: "limit", value: String(limit))
        ]
        if let start = startTime {
            queryItems.append(URLQueryItem(name: "start_time", value: ISO8601DateFormatter().string(from: start)))
        }
        components.queryItems = queryItems

        let (data, _) = try await URLSession.shared.data(from: components.url!)
        return try JSONDecoder().decode(SearchResponse.self, from: data)
    }
}

public struct SearchResponse: Codable {
    public let data: [SearchResult]
    public let pagination: Pagination
}

public struct SearchResult: Codable {
    public let type: String
    public let content: ContentData
}

public struct ContentData: Codable {
    public let frameId: Int?
    public let text: String?
    public let timestamp: String
    public let appName: String?
    public let windowName: String?
    public let filePath: String?

    enum CodingKeys: String, CodingKey {
        case frameId = "frame_id"
        case text
        case timestamp
        case appName = "app_name"
        case windowName = "window_name"
        case filePath = "file_path"
    }
}

public struct Pagination: Codable {
    public let limit: Int
    public let offset: Int
    public let total: Int
}
