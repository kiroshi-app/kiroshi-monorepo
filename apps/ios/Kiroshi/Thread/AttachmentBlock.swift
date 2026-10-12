import Foundation

enum AttachmentBlock {
    struct Split: Equatable {
        let text: String
        let names: [String]
    }

    static func prompt(text: String, paths: [String], sentAt: Date) -> String {
        guard !paths.isEmpty else { return text }
        let count = paths.count
        let header =
            "Attached to this message, sent \(sentAt.formatted(sentAtStyle)), \(count) \(count == 1 ? "file" : "files"):"
        let lines = paths.enumerated().map { "\($0.offset + 1)/\(count) \($0.element)" }
        return ([text.trimmingCharacters(in: .whitespacesAndNewlines), header] + lines)
            .filter { !$0.isEmpty }
            .joined(separator: "\n")
    }

    static func split(_ content: String) -> Split {
        let lines = content.split(separator: "\n", omittingEmptySubsequences: false).map(
            String.init)
        guard let headerIndex = lines.lastIndex(where: { $0.wholeMatch(of: header) != nil }),
            let count = lines[headerIndex].wholeMatch(of: header).flatMap({ Int($0.output.count) })
        else { return Split(text: content, names: []) }
        let entries = lines[(headerIndex + 1)...].filter { !$0.isEmpty }
        let paths = entries.enumerated().compactMap { index, line -> String? in
            guard let match = line.wholeMatch(of: entry), Int(match.output.position) == index + 1,
                Int(match.output.total) == count
            else { return nil }
            return String(match.output.path)
        }
        guard paths.count == count, entries.count == count else {
            return Split(text: content, names: [])
        }
        let text = lines[..<headerIndex].joined(separator: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return Split(
            text: text, names: paths.map { $0.split(separator: "/").last.map(String.init) ?? $0 })
    }

    private static let sentAtStyle = Date.ISO8601FormatStyle(includingFractionalSeconds: true)

    private static var header: Regex<(Substring, count: Substring)> {
        /Attached to this message, sent \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z, (?<count>\d+) files?:/
    }

    private static var entry:
        Regex<(Substring, position: Substring, total: Substring, path: Substring)>
    {
        /(?<position>\d+)\/(?<total>\d+) (?<path>.+)/
    }
}
