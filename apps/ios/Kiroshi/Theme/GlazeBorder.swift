import SwiftUI

struct GlazeBorder: Equatable, Sendable {
    enum Ink: Equatable, Sendable {
        case black
        case white

        var color: Color {
            switch self {
            case .black: .black
            case .white: .white
            }
        }
    }

    struct Edge: Equatable, Sendable {
        let ink: Ink
        let opacity: Double

        var color: Color { ink.color.opacity(opacity) }
    }

    static let compactBelow = 20.0
    static let glazeEdgeShare = 0.025
    static let compactEdgeShare = 0.05
    static let glazeEdge = (
        light: Edge(ink: .black, opacity: 0.08), dark: Edge(ink: .white, opacity: 0.1)
    )
    static let compactEdge = (
        light: Edge(ink: .black, opacity: 0.1), dark: Edge(ink: .white, opacity: 0.12)
    )
    static let lipOpacity = (light: 0.55, dark: 0.22)

    let isCompact: Bool
    let edgeWidth: Double
    let edge: Edge
    let lipOpacity: Double?

    init(side: Double, colorScheme: ColorScheme) {
        let isDark = colorScheme == .dark
        let edges = side < Self.compactBelow ? Self.compactEdge : Self.glazeEdge
        isCompact = side < Self.compactBelow
        edgeWidth =
            isCompact ? Self.compactEdgeShare * side : max(1, Self.glazeEdgeShare * side)
        edge = isDark ? edges.dark : edges.light
        lipOpacity = isCompact ? nil : isDark ? Self.lipOpacity.dark : Self.lipOpacity.light
    }

    func draw(around shape: Path, in context: GraphicsContext) {
        var inside = context
        inside.clip(to: shape)
        inside.stroke(shape, with: .color(edge.color), lineWidth: 2 * edgeWidth)
        guard let lipOpacity else { return }
        var lip = shape
        lip.addPath(shape, transform: CGAffineTransform(translationX: 0, y: edgeWidth))
        inside.fill(lip, with: .color(.white.opacity(lipOpacity)), style: FillStyle(eoFill: true))
    }
}

struct HexagonBorder: View {
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Canvas { context, canvas in
            guard let ground = FlatHexagon.ground else { return }
            GlazeBorder(side: canvas.width, colorScheme: colorScheme)
                .draw(around: ground.outlinePath(side: canvas.width), in: context)
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}
