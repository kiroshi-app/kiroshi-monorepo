import SwiftUI

struct InlineText: View {
    static let chipEdge = "\u{202F}"
    nonisolated static let unbreakableHyphen = "\u{2011}"
    nonisolated static let largestTexture: CGFloat = 16384
    nonisolated static let chipFill = Color(.tertiarySystemFill)

    let inline: MarkdownInline
    var codeFont: Font? = .subheadline.monospaced()
    var strongWeight: Font.Weight? = .semibold

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.displayScale) private var displayScale
    @State private var size = CGSize.zero

    var body: some View {
        let text = inline.runs.reduce(Text(verbatim: "")) { text, run in
            Text("\(text)\(piece(run))")
        }
        let measuresSize = hasChips
        text
            .modifier(ChipDrawing(isDrawn: hasChips && !fillsChipsAsText, width: size.width))
            .onGeometryChange(for: CGSize.self) { proxy in
                measuresSize ? proxy.size : .zero
            } action: { measured in
                size = measured
            }
            .tint(Color(.link))
            .modifier(SpokenSource(source: hasChips ? Self.source(of: inline) : nil))
    }

    private var fillsChipsAsText: Bool {
        Self.isTooTallForOneTexture(height: size.height, scale: displayScale)
    }

    nonisolated static func isTooTallForOneTexture(height: CGFloat, scale: CGFloat) -> Bool {
        height * scale > largestTexture
    }

    private var hasChips: Bool {
        inline.runs.contains { $0.kind != .text }
    }

    nonisolated static func source(of inline: MarkdownInline) -> AttributedString {
        inline.runs.reduce(into: AttributedString()) { source, run in
            var piece = AttributedString(run.text)
            piece.link = run.link
            source += piece
        }
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
            let code = chip(shown, radius: 5)
            return codeFont.map { code.font($0) } ?? code.monospaced()
        case .mention(let isKnown):
            return chip(run.text, radius: 6)
                .fontWeight(.semibold)
                .foregroundStyle(isKnown ? Color.primary : Color.secondary)
        }
    }

    private func chip(_ shown: String, radius: CGFloat) -> Text {
        var attributed = AttributedString(Self.chipEdge + shown + Self.chipEdge)
        if fillsChipsAsText {
            attributed.backgroundColor = Self.chipFill
        }
        return Text(attributed).customAttribute(Chip(radius: radius))
    }
}

private struct ChipDrawing: ViewModifier {
    let isDrawn: Bool
    let width: CGFloat

    func body(content: Content) -> some View {
        if isDrawn {
            content.textRenderer(ChipRenderer(width: width))
        } else {
            content
        }
    }
}

private struct SpokenSource: ViewModifier {
    let source: AttributedString?

    func body(content: Content) -> some View {
        if let source {
            content.accessibilityRepresentation { Text(source) }
        } else {
            content
        }
    }
}

struct Chip: TextAttribute {
    let radius: CGFloat
}

struct ChipRenderer: TextRenderer {
    let width: CGFloat

    func draw(layout: Text.Layout, in context: inout GraphicsContext) {
        for line in layout {
            for run in line {
                if let chip = run[Chip.self],
                    case let shown = Self.shown(run.typographicBounds.rect, within: width),
                    !shown.isEmpty
                {
                    context.fill(
                        Path(roundedRect: shown, cornerRadius: chip.radius, style: .continuous),
                        with: .color(InlineText.chipFill))
                }
                context.draw(run)
            }
        }
    }

    nonisolated static func shown(_ bounds: CGRect, within width: CGFloat) -> CGRect {
        bounds.intersection(CGRect(x: 0, y: bounds.minY, width: width, height: bounds.height))
    }
}
