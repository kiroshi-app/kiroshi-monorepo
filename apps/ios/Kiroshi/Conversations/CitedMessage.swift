import Foundation

nonisolated struct CitedAttachment: Hashable, Sendable {
    enum Kind: Hashable, Sendable {
        case image
        case file
    }

    static let imageExtensions: Set<String> = [
        "avif", "bmp", "gif", "ico", "jpeg", "jpg", "png", "webp",
    ]

    let path: String
    let name: String
    let kind: Kind

    var conversationId: String {
        let segments = CitedMessage.segments(of: path)
        return segments[segments.count - 2]
    }

    var file: String {
        CitedMessage.segments(of: path).last ?? path
    }

    var spokenName: String {
        guard name == file else { return name }
        let fileExtension = (file as NSString).pathExtension.uppercased()
        return fileExtension.isEmpty
            ? String(localized: "Attached file") : String(localized: "\(fileExtension) file")
    }

    var savedName: String {
        let fileExtension = (file as NSString).pathExtension.lowercased()
        let named = name.replacing("/", with: "-").replacing(":", with: "-")
        guard !fileExtension.isEmpty,
            (named as NSString).pathExtension.lowercased() == fileExtension
        else { return file }
        return named
    }
}

nonisolated enum CitedSegment: Equatable, Sendable {
    case text(String)
    case attachment(CitedAttachment)
}

nonisolated struct CitedMessage: Equatable, Sendable {
    let text: String
    let segments: [CitedSegment]

    init(_ content: String) {
        let block = Self.legacyBlock(of: content)
        text = block?.text ?? content
        let attached = (block?.paths ?? []).map { path in
            CitedSegment.attachment(
                CitedAttachment(path: path, name: Self.segments(of: path).last ?? path, kind: .file)
            )
        }
        segments = Self.cited(in: text) + attached
    }

    static func isStoredAttachment(_ path: String) -> Bool {
        let path = path.trimmingCharacters(in: .whitespaces)
        guard path.wholeMatch(of: driveLetter) != nil || path.firstMatch(of: scheme) == nil,
            !path.hasPrefix("//"), !path.hasPrefix("#")
        else { return false }
        let segments = segments(of: path)
        return segments.count > 3 && segments[segments.count - 3] == "attachments"
            && !segments[segments.count - 2].isEmpty
            && segments[segments.count - 1].wholeMatch(of: mintedName) != nil
    }

    static func segments(of path: String) -> [String] {
        path.split(omittingEmptySubsequences: false, whereSeparator: { $0 == "/" || $0 == "\\" })
            .map(String.init)
    }

    private static func cited(in text: String) -> [CitedSegment] {
        var segments: [CitedSegment] = []
        var pending = ""
        var fence: String?
        let flush = {
            if !pending.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                segments.append(.text(pending.trimmingCharacters(in: .newlines)))
            }
            pending = ""
        }
        for line in text.split(separator: "\n", omittingEmptySubsequences: false) {
            let opensOrClosesFence = line.prefixMatch(of: fenceMarker).map {
                String($0.output.marker.prefix(1))
            }
            if let marker = opensOrClosesFence, fence == nil || fence == marker {
                fence = fence == nil ? marker : nil
                pending += line + "\n"
                continue
            }
            guard fence == nil else {
                pending += line + "\n"
                continue
            }
            var rest = line[...]
            while let cite = firstCite(in: rest) {
                pending += rest[..<cite.range.lowerBound]
                flush()
                segments.append(.attachment(cite.attachment))
                rest = rest[cite.range.upperBound...]
            }
            pending += rest + "\n"
        }
        flush()
        guard segments.contains(where: { if case .attachment = $0 { true } else { false } })
        else {
            return text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? [] : [.text(text)]
        }
        return segments
    }

    private static func firstCite(in line: Substring) -> (
        range: Range<Substring.Index>, attachment: CitedAttachment
    )? {
        let code = line.matches(of: inlineCode).map(\.range)
        for match in line.matches(of: cite) {
            guard !code.contains(where: { $0.overlaps(match.range) }) else { continue }
            let written = String(match.output.angled ?? match.output.bare ?? "")
            let path = written.removingPercentEncoding ?? written
            guard isStoredAttachment(path) else { continue }
            let file = segments(of: path).last ?? path
            let label = String(match.output.label).replacing(escaped) { String($0.output.1) }
            let isImage =
                !match.output.bang.isEmpty
                && imageExtensions(contains: (file as NSString).pathExtension)
            return (
                match.range,
                CitedAttachment(
                    path: path, name: label.isEmpty ? file : label, kind: isImage ? .image : .file)
            )
        }
        return nil
    }

    private static func imageExtensions(contains fileExtension: String) -> Bool {
        CitedAttachment.imageExtensions.contains(fileExtension.lowercased())
    }

    private static func legacyBlock(of content: String) -> (text: String, paths: [String])? {
        let lines = content.trimmingCharacters(in: .whitespacesAndNewlines)
            .split(separator: "\n", omittingEmptySubsequences: false)
        guard let headerIndex = lines.lastIndex(where: { $0.wholeMatch(of: blockHeader) != nil }),
            let count = lines[headerIndex].wholeMatch(of: blockHeader).flatMap({
                Int($0.output.count)
            })
        else { return nil }
        let entries = lines[(headerIndex + 1)...]
        guard entries.count == count else { return nil }
        let paths = entries.enumerated().compactMap { index, line -> String? in
            guard let match = line.wholeMatch(of: blockEntry),
                Int(match.output.position) == index + 1, Int(match.output.total) == count,
                isStoredAttachment(String(match.output.path))
            else { return nil }
            return String(match.output.path)
        }
        guard paths.count == count else { return nil }
        let text = lines[..<headerIndex].joined(separator: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return (text, paths)
    }

    private static var cite:
        Regex<(Substring, bang: Substring, label: Substring, angled: Substring?, bare: Substring?)>
    {
        /(?<bang>!?)\[(?<label>(?:\\.|[^\\\[\]])*)\]\((?:<(?<angled>[^<>]*)>|(?<bare>[^\s()<>]+))\)/
    }

    private static var escaped: Regex<(Substring, Substring)> {
        /\\(.)/
    }

    private static var inlineCode: Regex<(Substring, Substring)> {
        /(`+)[^`].*?\1/
    }

    private static var fenceMarker: Regex<(Substring, marker: Substring)> {
        /[ ]{0,3}(?<marker>`{3,}|~{3,})/
    }

    private static var mintedName: Regex<(Substring, Substring?)> {
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.[a-z0-9]{1,16})?/
    }

    private static var scheme: Regex<Substring> {
        /^[A-Za-z][A-Za-z0-9+.\-]*:/
    }

    private static var driveLetter: Regex<Substring> {
        /[A-Za-z]:[\\\/].*/
    }

    private static var blockHeader: Regex<(Substring, count: Substring)> {
        /Attached to this message, sent \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z, (?<count>\d+) files?:/
    }

    private static var blockEntry:
        Regex<(Substring, position: Substring, total: Substring, path: Substring)>
    {
        /(?<position>\d+)\/(?<total>\d+) (?<path>.+)/
    }
}
