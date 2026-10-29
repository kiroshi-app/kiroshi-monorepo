import SwiftUI
import UIKit

struct SpaceAvatar: View {
    let spaceId: String
    let name: String
    let colour: Hue?
    let size: SpaceAvatarSize
    let state: SpaceAvatarState

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        let drawing = SpaceAvatarDrawing(
            spaceId: spaceId, name: name, colour: colour, size: size, state: state,
            theme: colorScheme == .dark ? .dark : .light)
        let overhang = size.badgeOverhang
        Canvas { context, _ in
            context.translateBy(x: overhang, y: overhang)
            drawing.draw(in: &context)
        }
        .frame(width: size.points + 2 * overhang, height: size.points + 2 * overhang)
        .padding(-overhang)
        .accessibilityHidden(true)
    }
}

extension SpaceAvatar {
    func image(in colorScheme: ColorScheme, scale: CGFloat) -> UIImage {
        let renderer = ImageRenderer(
            content: padding(size.badgeOverhang).environment(\.colorScheme, colorScheme))
        renderer.scale = scale
        return renderer.uiImage?.withRenderingMode(.alwaysOriginal) ?? UIImage()
    }
}

extension Path {
    init(glyph: String) {
        self.init()
        var tokens = glyph.matches(of: /[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)/).map {
            String($0.output)
        }[...]
        var command = ""
        var point = CGPoint.zero
        let number = { CGFloat(Double(tokens.removeFirst()) ?? 0) }
        let next = { CGPoint(x: number(), y: number()) }
        while let token = tokens.first {
            if Double(token) == nil { command = tokens.removeFirst() }
            switch command {
            case "M":
                point = next()
                move(to: point)
                command = "L"
            case "L":
                point = next()
                addLine(to: point)
            case "H":
                point.x = number()
                addLine(to: point)
            case "V":
                point.y = number()
                addLine(to: point)
            case "C":
                let (control1, control2, end) = (next(), next(), next())
                addCurve(to: end, control1: control1, control2: control2)
                point = end
            case "Z":
                closeSubpath()
                command = ""
            default:
                _ = tokens.popFirst()
            }
        }
    }
}

private struct SpaceAvatarDrawing {
    static let offlineOpacity: [SpaceAvatarTheme: Double] = [.light: 0.8, .dark: 1]
    static let sheen = Gradient(stops: [
        .init(color: .white.opacity(0.3), location: 0),
        .init(color: .white.opacity(0), location: 0.55),
        .init(color: .black.opacity(0), location: 0.55),
        .init(color: .black.opacity(0.08), location: 1),
    ])
    static let highlight = Gradient(colors: [.white.opacity(0.25), .white.opacity(0)])
    static let initialTracking = -0.02
    static let arcOpacity = 0.45
    static let localBadge = Color("space-avatar-local-badge")
    static let offlineBadge = Color("space-avatar-offline-badge")
    static let hatchInk = Color("space-avatar-hatch")
    static let laptop = Path(glyph: SpaceAvatarRecipe.laptopGlyph)
    static let cross = Path(glyph: SpaceAvatarRecipe.crossGlyph)

    let size: SpaceAvatarSize
    let state: SpaceAvatarState
    let theme: SpaceAvatarTheme
    let arcs: SpaceAvatarArcs
    let tones: [Color]
    let lineColour: Color
    let initial: String
    let ink: Color
    let marks: SpaceAvatarMarks

    init(
        spaceId: String, name: String, colour: Hue?, size: SpaceAvatarSize,
        state: SpaceAvatarState, theme: SpaceAvatarTheme
    ) {
        self.size = size
        self.state = state
        self.theme = theme
        let tint = state == .offline ? nil : colour
        arcs = SpaceAvatarRecipe.arcs(spaceId)
        let palette = SpaceAvatarRecipe.palette(theme, colour: tint)
        tones = (size.isCompact ? palette.compact : palette.full).map(Self.color)
        lineColour = Self.color(palette.compact[2])
        initial = state.isFilled ? SpaceAvatarRecipe.initial(of: name) : ""
        ink = Self.color(SpaceAvatarRecipe.ink(theme, colour: tint))
        marks = size.marks
    }

    private var side: Double { size.points }

    private var radii: [Double] { size.isCompact ? SpaceAvatarRecipe.compactRadii : arcs.radii }

    private var isGlazed: Bool { !size.isCompact && state.isGlazed }

    private var border: GlazeBorder {
        GlazeBorder(side: side, colorScheme: theme == .dark ? .dark : .light)
    }

    private var shape: Path {
        Self.path(SpaceAvatarRecipe.outline(centre: side / 2, half: side / 2))
    }

    func draw(in context: inout GraphicsContext) {
        context.drawLayer { avatar in
            avatar.opacity = state == .offline ? Self.offlineOpacity[theme] ?? 1 : 1
            avatar.drawLayer { clipped in
                clipped.clip(to: shape)
                clipped.fill(Path(frame), with: .color(tones[0]))
                if state == .connecting {
                    for radius in radii {
                        clipped.stroke(
                            arc(radius), with: .color(lineColour), lineWidth: size.lineStroke)
                    }
                    return
                }
                for (index, radius) in radii.enumerated().reversed() {
                    clipped.fill(
                        arc(radius),
                        with: .color(tones[tones.count - 1 - index].opacity(Self.arcOpacity)))
                }
                if state == .offline { hatch(in: &clipped) }
                if isGlazed { sheen(in: &clipped) }
                if isGlazed || size.isCompact { border.draw(around: shape, in: clipped) }
            }
            avatar.opacity = 1
            if !initial.isEmpty { drawInitial(in: &avatar) }
            if state.isFilled {
                avatar.blendMode = .destinationOut
                avatar.fill(
                    disc(radius: marks.badge.diameter / 2 + marks.badge.cutOut),
                    with: .color(.black))
            }
        }
        drawBadge(in: &context)
    }

    private func drawInitial(in context: inout GraphicsContext) {
        let fontSize = marks.initial.fontSize
        let text = Text(initial)
            .font(.system(size: fontSize, weight: marks.initial.weight >= 700 ? .bold : .semibold))
            .tracking(Self.initialTracking * fontSize)
            .foregroundStyle(ink)
        context.draw(context.resolve(text), at: CGPoint(x: side / 2, y: side / 2), anchor: .center)
    }

    private func drawBadge(in context: inout GraphicsContext) {
        let radius = marks.badge.diameter / 2
        switch state {
        case .shared, .online:
            context.fill(disc(radius: radius), with: .color(.kiroshi(.presenceOnline)))
        case .local:
            context.fill(disc(radius: radius), with: .color(Self.localBadge))
            drawGlyph(Self.laptop, marks.laptop, in: &context)
        case .offline:
            context.fill(disc(radius: radius), with: .color(Self.offlineBadge))
            if let cross = marks.cross { drawGlyph(Self.cross, cross, in: &context) }
        case .connecting:
            break
        }
    }

    private func drawGlyph(
        _ glyph: Path, _ metrics: SpaceAvatarGlyph, in context: inout GraphicsContext
    ) {
        let origin = size.badgeCentre - SpaceAvatarRecipe.glyphGrid / 2 * metrics.scale
        let stroked = glyph.strokedPath(
            StrokeStyle(lineWidth: metrics.stroke, lineCap: .round, lineJoin: .round))
        context.fill(
            stroked.applying(
                CGAffineTransform(translationX: origin, y: origin)
                    .scaledBy(x: metrics.scale, y: metrics.scale)),
            with: .color(.white))
    }

    private func hatch(in context: inout GraphicsContext) {
        var lines = Path()
        for offset in size.hatchOffsets {
            lines.move(to: CGPoint(x: SpaceAvatarRecipe.rounded(offset - side), y: side))
            lines.addLine(to: CGPoint(x: offset, y: 0))
        }
        context.stroke(
            lines, with: .color(Self.hatchInk), lineWidth: marks.hatch.stroke)
    }

    private func sheen(in context: inout GraphicsContext) {
        context.fill(
            Path(frame),
            with: .linearGradient(
                Self.sheen, startPoint: .zero, endPoint: CGPoint(x: 0, y: side)))
        context.fill(
            Path(frame),
            with: .radialGradient(
                Self.highlight, center: CGPoint(x: 0.3 * side, y: 0.18 * side),
                startRadius: 0, endRadius: 0.6 * side))
    }

    private var frame: CGRect {
        CGRect(x: 0, y: 0, width: side, height: side)
    }

    private func arc(_ radius: Double) -> Path {
        let centre = CGPoint(x: arcs.anchor.x * side, y: arcs.anchor.y * side)
        return Path(
            ellipseIn: CGRect(
                x: centre.x - radius * side, y: centre.y - radius * side,
                width: 2 * radius * side, height: 2 * radius * side))
    }

    private func disc(radius: Double) -> Path {
        let centre = size.badgeCentre
        return Path(
            ellipseIn: CGRect(
                x: centre - radius, y: centre - radius, width: 2 * radius, height: 2 * radius))
    }

    private static func path(_ points: [SpaceAvatarPoint]) -> Path {
        var path = Path()
        path.addLines(points.map { CGPoint(x: $0.x, y: $0.y) })
        path.closeSubpath()
        return path
    }

    private static func color(_ rgb: SpaceAvatarRGB) -> Color {
        Color(.sRGB, red: rgb.red, green: rgb.green, blue: rgb.blue)
    }
}

private struct SpaceAvatarPreview: View {
    static let spaces: [(id: String, name: String, colour: Hue?)] = [
        ("atelier", "Atelier", Hue(degrees: 257)),
        ("personal", "Personal", nil),
        ("fieldwork", "Fieldwork", Hue(degrees: 132)),
    ]
    static let sizes: [SpaceAvatarSize] = [.page, .rail, .menu]

    let state: SpaceAvatarState

    var body: some View {
        VStack(spacing: 0) {
            row.environment(\.colorScheme, .light)
            row.environment(\.colorScheme, .dark)
        }
    }

    private var row: some View {
        VStack(alignment: .leading, spacing: 16) {
            ForEach(Self.sizes, id: \.self) { size in
                HStack(spacing: 12) {
                    ForEach(Self.spaces, id: \.id) { space in
                        SpaceAvatar(
                            spaceId: space.id, name: space.name, colour: space.colour,
                            size: size, state: state)
                    }
                }
            }
        }
        .padding()
        .frame(maxWidth: .infinity)
        .background(Color(.systemBackground))
    }
}

#Preview("On this computer") { SpaceAvatarPreview(state: .local) }
#Preview("Shared") { SpaceAvatarPreview(state: .shared) }
#Preview("Online") { SpaceAvatarPreview(state: .online) }
#Preview("Connecting") { SpaceAvatarPreview(state: .connecting) }
#Preview("Offline") { SpaceAvatarPreview(state: .offline) }
