import SwiftUI
import UIKit

struct SpaceAvatar: View {
    let spaceId: String
    let colour: Hue?
    let size: SpaceAvatarSize
    let presence: SpacePresence

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        let drawing = SpaceAvatarDrawing(
            spaceId: spaceId, colour: colour, size: size, presence: presence,
            theme: colorScheme == .dark ? .dark : .light)
        Canvas { context, _ in drawing.draw(in: &context) }
            .frame(width: size.points, height: size.points)
            .accessibilityHidden(true)
    }
}

extension SpaceAvatar {
    func image(in colorScheme: ColorScheme, scale: CGFloat) -> UIImage {
        let renderer = ImageRenderer(content: environment(\.colorScheme, colorScheme))
        renderer.scale = scale
        return renderer.uiImage?.withRenderingMode(.alwaysOriginal) ?? UIImage()
    }
}

private struct SpaceAvatarDrawing {
    static let notConnectedOpacity: [SpaceAvatarTheme: Double] = [.light: 0.8, .dark: 1]
    static let sheen = Gradient(stops: [
        .init(color: .white.opacity(0.3), location: 0),
        .init(color: .white.opacity(0), location: 0.55),
        .init(color: .black.opacity(0), location: 0.55),
        .init(color: .black.opacity(0.08), location: 1),
    ])
    static let highlight = Gradient(colors: [.white.opacity(0.25), .white.opacity(0)])

    let size: SpaceAvatarSize
    let presence: SpacePresence
    let theme: SpaceAvatarTheme
    let arcs: SpaceAvatarArcs
    let tones: [Color]
    let lineColour: Color

    init(
        spaceId: String, colour: Hue?, size: SpaceAvatarSize, presence: SpacePresence,
        theme: SpaceAvatarTheme
    ) {
        self.size = size
        self.presence = presence
        self.theme = theme
        arcs = SpaceAvatarRecipe.arcs(spaceId)
        let palette = SpaceAvatarRecipe.palette(
            theme, colour: presence == .notConnected ? nil : colour)
        tones = (size.isCompact ? palette.compact : palette.full).map(Self.color)
        lineColour = Self.color(palette.compact[2])
    }

    private var side: Double { size.points }

    private var radii: [Double] { size.isCompact ? SpaceAvatarRecipe.compactRadii : arcs.radii }

    private var isHostUp: Bool { presence == .shared || presence == .online }

    private var dot: SpaceAvatarDot? { isHostUp ? size.dot : nil }

    private var isGlazed: Bool { !size.isCompact && isHostUp }

    private var border: GlazeBorder {
        GlazeBorder(side: side, colorScheme: theme == .dark ? .dark : .light)
    }

    private var shape: Path {
        Self.path(SpaceAvatarRecipe.outline(centre: side / 2, half: side / 2))
    }

    func draw(in context: inout GraphicsContext) {
        context.drawLayer { avatar in
            avatar.opacity = presence == .notConnected ? Self.notConnectedOpacity[theme] ?? 1 : 1
            avatar.drawLayer { clipped in
                clipped.clip(to: shape)
                clipped.fill(Path(frame), with: .color(tones[0]))
                if presence == .connecting {
                    for radius in radii {
                        clipped.stroke(
                            arc(radius), with: .color(lineColour), lineWidth: size.lineStroke)
                    }
                    return
                }
                for (index, radius) in radii.enumerated().reversed() {
                    clipped.fill(arc(radius), with: .color(tones[tones.count - 1 - index]))
                }
                if isGlazed { sheen(in: &clipped) }
                if isGlazed || size.isCompact { border.draw(around: shape, in: clipped) }
            }
            if let dot {
                avatar.blendMode = .destinationOut
                avatar.fill(
                    circle(dot, radius: dot.diameter / 2 + dot.cutOut), with: .color(.black))
            }
        }
        if let dot {
            context.fill(
                circle(dot, radius: dot.diameter / 2), with: .color(.kiroshi(.presenceOnline)))
        }
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

    private func circle(_ dot: SpaceAvatarDot, radius: Double) -> Path {
        let centre = size.dotCentre(dot)
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
