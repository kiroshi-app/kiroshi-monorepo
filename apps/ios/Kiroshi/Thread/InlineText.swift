import SwiftUI

struct InlineText: View {
    static let chipEdge = "\u{202F}"

    let inline: MarkdownInline
    var codeFont: Font? = .subheadline.monospaced()
    var strongWeight: Font.Weight? = .semibold

    var body: some View {
        inline.runs.reduce(Text(verbatim: "")) { text, run in
            Text("\(text)\(piece(run))")
        }
        .textRenderer(ChipRenderer())
        .tint(Color(.link))
        .modifier(SpokenPlain(text: isSpokenPlain ? inline.plain : nil))
    }

    private var isSpokenPlain: Bool {
        inline.runs.contains { $0.kind != .text } && !inline.runs.contains { $0.link != nil }
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
            let unbroken = run.text.replacing("-", with: "\u{2011}")
            let code = Text(verbatim: Self.chipEdge + unbroken + Self.chipEdge)
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
