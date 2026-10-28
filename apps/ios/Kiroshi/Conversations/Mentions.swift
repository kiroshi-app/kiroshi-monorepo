import Foundation

enum Mentions {
    static func query(in draft: String) -> String? {
        draft.firstMatch(of: #/(?:^|\s)@([^\s@]*)$/#).map { String($0.1) }
    }

    static func candidates(for query: String, among members: [Companion]) -> [Companion] {
        guard !query.isEmpty else { return members }
        return members.filter { $0.name.localizedCaseInsensitiveContains(query) }
    }

    static func picking(_ companion: Companion, in draft: String) -> String {
        guard let query = query(in: draft) else { return draft }
        return "\(draft.dropLast(query.count + 1))@\(companion.name) "
    }

    static func tokens(in text: String, among members: [Companion]) -> String {
        var written = ""
        var rest = text[...]
        while let at = rest.firstIndex(of: "@") {
            written += rest[..<at]
            let named = rest[rest.index(after: at)...]
            let opensToken = at > text.startIndex && text[text.index(before: at)] == "<"
            if !opensToken, let companion = companion(namedAt: named, among: members) {
                written += "<@\(companion.id)>"
                rest = named.dropFirst(companion.name.count)
            } else {
                written += "@"
                rest = named
            }
        }
        return written + rest
    }

    static func summoned(in content: String, among members: [Companion]) -> [Companion.ID] {
        var summoned: [Companion.ID] = []
        for match in content.matches(of: token) {
            let id = String(match.1)
            if members.contains(where: { $0.id == id }), !summoned.contains(id) {
                summoned.append(id)
            }
        }
        return summoned
    }

    static func shown(in text: String, among authors: [Companion]) -> String {
        authors.isEmpty ? text : names(in: text, among: authors)
    }

    static func names(in text: String, among authors: [Companion]) -> String {
        text.replacing(token) { match in
            let name = authors.first { $0.id == match.1 }?.name
            return "@\(name ?? String(localized: "Unknown agent"))"
        }
    }

    private static var token: Regex<(Substring, Substring)> {
        #/<@([\w-]+)>/#
    }

    private static func companion(namedAt text: Substring, among members: [Companion])
        -> Companion?
    {
        members
            .filter {
                !$0.name.isEmpty && text.prefix($0.name.count).lowercased() == $0.name.lowercased()
            }
            .max { $0.name.count < $1.name.count }
    }
}
