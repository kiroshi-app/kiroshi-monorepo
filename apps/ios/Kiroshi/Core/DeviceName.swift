import Foundation

enum DeviceName {
    static let maxLength = 64

    static func of(name: String, model: String) -> String {
        let named = clipped(name)
        return named.isEmpty ? clipped(model) : named
    }

    private static func clipped(_ text: String) -> String {
        var clipped = ""
        for character in text.trimmingCharacters(in: .whitespacesAndNewlines) {
            guard clipped.utf16.count + character.utf16.count <= maxLength else { break }
            clipped.append(character)
        }
        return clipped.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
