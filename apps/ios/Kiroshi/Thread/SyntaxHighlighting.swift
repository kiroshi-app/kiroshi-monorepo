import Highlightr
import SwiftUI
import UIKit

@MainActor
final class SyntaxHighlighting {
    static let shared = SyntaxHighlighting()

    private enum Role: String {
        case keyword
        case type
        case string
        case comment
        case number
        case function
    }

    private static let themeRoles: [UInt32: Role] = [
        0xAA0D91: .keyword, 0x5C2699: .type, 0xC41A16: .string, 0x007400: .comment,
        0x1C00CF: .number,
    ]
    private static let aliases = [
        "sh": "bash", "shell": "bash", "zsh": "bash", "console": "bash", "js": "javascript",
        "jsx": "javascript", "ts": "typescript", "tsx": "typescript", "py": "python",
        "rb": "ruby", "yml": "yaml", "md": "markdown", "objc": "objectivec", "kt": "kotlin",
        "rs": "rust", "html": "xml", "jsonc": "json",
    ]
    private static let cacheLimit = 200

    private let highlightr: Highlightr?
    private let languages: Set<String>
    private var cache: [MarkdownCode: AttributedString] = [:]

    private init() {
        highlightr = Highlightr()
        highlightr?.setTheme(to: "xcode")
        languages = Set(highlightr?.supportedLanguages() ?? [])
    }

    func highlighted(_ code: MarkdownCode) -> AttributedString {
        if let cached = cache[code] {
            return cached
        }
        let highlighted = highlight(code) ?? AttributedString(code.text)
        if cache.count >= Self.cacheLimit {
            cache.removeAll()
        }
        cache[code] = highlighted
        return highlighted
    }

    private func highlight(_ code: MarkdownCode) -> AttributedString? {
        guard let written = code.language?.lowercased() else { return nil }
        let language = Self.aliases[written] ?? written
        guard languages.contains(language),
            let drawn = highlightr?.highlight(code.text, as: language)
        else { return nil }
        var highlighted = AttributedString()
        var isAfterSwiftTypeDeclaration = false
        var isAfterFunctionDeclaration = false
        drawn.enumerateAttribute(
            .foregroundColor, in: NSRange(location: 0, length: drawn.length)
        ) { color, range, _ in
            let text = drawn.attributedSubstring(from: range).string
            let role = (color as? UIColor).flatMap(Self.role)
            if language == "swift", text == "_", Self.isArgumentLabel(in: drawn.string, at: range) {
                highlighted += Self.piece(text, role: nil)
            } else if isAfterSwiftTypeDeclaration, role == nil {
                highlighted += Self.declaredTypeName(in: text)
            } else if role == nil {
                highlighted += Self.callsAndMembers(
                    in: text, isAfterFunctionDeclaration: isAfterFunctionDeclaration)
            } else {
                highlighted += Self.piece(text, role: role)
            }
            isAfterSwiftTypeDeclaration =
                language == "swift" && role == .keyword
                && Self.swiftTypeDeclarations.contains(text)
            isAfterFunctionDeclaration =
                role == .keyword && Self.functionDeclarations.contains(text)
        }
        return highlighted
    }

    private static let swiftTypeDeclarations: Set<String> = ["struct", "class", "enum", "protocol"]
    private static let functionDeclarations: Set<String> = ["func", "def", "fn", "fun", "function"]

    private static func isArgumentLabel(in code: String, at range: NSRange) -> Bool {
        let after = (code as NSString).substring(from: NSMaxRange(range))
        return after.prefixMatch(of: /\s+\w+\s*:/) != nil
    }

    private static func declaredTypeName(in text: String) -> AttributedString {
        let nameStart = text.firstIndex { !$0.isWhitespace } ?? text.endIndex
        let nameEnd =
            text[nameStart...].firstIndex { !($0.isLetter || $0.isNumber || $0 == "_") }
            ?? text.endIndex
        return piece(String(text[..<nameStart]), role: nil)
            + piece(String(text[nameStart..<nameEnd]), role: .type)
            + callsAndMembers(in: String(text[nameEnd...]), isAfterFunctionDeclaration: false)
    }

    private static func callsAndMembers(in text: String, isAfterFunctionDeclaration: Bool)
        -> AttributedString
    {
        var drawn = AttributedString()
        var isDeclaredName = isAfterFunctionDeclaration
        var rest = text[...]
        while let start = rest.firstIndex(where: isIdentifierPart) {
            let end = rest[start...].firstIndex { !isIdentifierPart($0) } ?? rest.endIndex
            let before = text[..<start]
            let isMember = before.hasSuffix(".") && !before.hasSuffix("..")
            let isCall = rest[end...].first { $0 != " " } == "("
            let isName = !rest[start].isNumber
            let role: Role? = isName && !isDeclaredName && (isMember || isCall) ? .function : nil
            drawn += piece(String(rest[..<start]), role: nil)
            drawn += piece(String(rest[start..<end]), role: role)
            isDeclaredName = isDeclaredName && !isName
            rest = rest[end...]
        }
        return drawn + piece(String(rest), role: nil)
    }

    private static func isIdentifierPart(_ character: Character) -> Bool {
        character.isLetter || character.isNumber || character == "_"
    }

    private static func piece(_ text: String, role: Role?) -> AttributedString {
        var piece = AttributedString(text)
        if let role {
            piece.foregroundColor = Color("syntax-\(role.rawValue)")
        }
        return piece
    }

    private static func role(of color: UIColor) -> Role? {
        var red: CGFloat = 0
        var green: CGFloat = 0
        var blue: CGFloat = 0
        guard color.getRed(&red, green: &green, blue: &blue, alpha: nil) else { return nil }
        let rgb = [red, green, blue].reduce(UInt32(0)) { $0 << 8 | UInt32(($1 * 255).rounded()) }
        return themeRoles[rgb]
    }
}
