import SwiftUI

struct InlineText: View {
    static let chipEdge = "\u{202F}"
    nonisolated static let unbreakableHyphen = "\u{2011}"

    let inline: MarkdownInline
    var codeFont: Font? = .subheadline.monospaced()
    var strongWeight: Font.Weight? = .semibold

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        inline.runs.reduce(Text(verbatim: "")) { text, run in
            Text("\(text)\(piece(run))")
        }
        .modifier(ChipDrawing(isDrawn: hasChips))
        .tint(Color(.link))
        .modifier(SpokenPlain(text: isSpokenPlain ? inline.plain : nil))
    }

    private var hasChips: Bool {
        inline.runs.contains { $0.kind != .text }
    }

    private var isSpokenPlain: Bool {
        hasChips && !inline.runs.contains { $0.link != nil }
    }

    nonisolated static func shown(code: String, breaksAfterWordHyphens: Bool) -> String {
        guard breaksAfterWordHyphens else {
            return code.replacing("-", with: unbreakableHyphen)
        }
        var shown = ""
        for character in code {
            let followsAWord = shown.last.map { $0.isLetter || $0.isNumber } ?? false
            shown += character == "-" && !followsAWord ? unbreakableHyphen : String(character)
        }
        return shown
    }

    private func piece(_ run: MarkdownInline.Run) -> Text {
        var attributed = AttributedString(run.text)
        attributed.link = run.link
        var text = Text(attributed)
        if run.isStrong {
            text = text.fontWeight(strongWeight)
        }
        if run.isEmphasized {
            text = text.italic()
        }
        if run.isStruck {
            text = text.strikethrough()
        }
        switch run.kind {
        case .text:
            return text
        case .code:
            let shown = Self.shown(
                code: run.text, breaksAfterWordHyphens: dynamicTypeSize.isAccessibilitySize)
            let code = Text(verbatim: Self.chipEdge + shown + Self.chipEdge)
            return (codeFont.map { code.font($0) } ?? code.monospaced())
                .customAttribute(Chip(radius: 5))
        case .mention(let isKnown):
            return Text(verbatim: Self.chipEdge + run.text + Self.chipEdge)
                .fontWeight(.semibold)
                .foregroundStyle(isKnown ? Color.primary : Color.secondary)
                .customAttribute(Chip(radius: 6))
        }
    }
}

private struct ChipDrawing: ViewModifier {
    let isDrawn: Bool

    func body(content: Content) -> some View {
        if isDrawn {
            content.textRenderer(ChipRenderer())
        } else {
            content
        }
    }
}

private struct SpokenPlain: ViewModifier {
    let text: String?

    func body(content: Content) -> some View {
        if let text {
            content.accessibilityLabel(text)
        } else {
            content
        }
    }
}

struct Chip: TextAttribute {
    let radius: CGFloat
}

struct ChipRenderer: TextRenderer {
    func draw(layout: Text.Layout, in context: inout GraphicsContext) {
        for line in layout {
            for run in line {
                if let chip = run[Chip.self] {
                    let chipShape = Path(
                        roundedRect: run.typographicBounds.rect, cornerRadius: chip.radius,
                        style: .continuous)
                    context.fill(chipShape, with: .color(Color(.tertiarySystemFill)))
                }
                context.draw(run)
            }
        }
    }
}
