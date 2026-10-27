import SwiftUI

struct CompanionAvatar: View {
    enum Size {
        case inline
        case title
        case message
        case row
        case pinned
        case header
        case hero

        var points: CGFloat {
            switch self {
            case .inline: 20
            case .title: 28
            case .message: 40
            case .row: 52
            case .pinned: 56
            case .header: 52
            case .hero: 88
            }
        }

        var textStyle: Font.TextStyle {
            switch self {
            case .inline: .subheadline
            case .title: .caption2
            case .message: .body
            case .row: .subheadline
            case .pinned: .caption
            case .header: .footnote
            case .hero: .title3
            }
        }
    }

    let companion: Companion?
    let size: Size
    let isWorking: Bool

    init(_ companion: Companion?, size: Size, isWorking: Bool = false) {
        self.companion = companion
        self.size = size
        self.isWorking = isWorking
    }

    var body: some View {
        ScaledAvatar(companion: companion, size: size, isWorking: isWorking)
            .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
            .accessibilityHidden(true)
    }
}

private struct ScaledAvatar: View {
    let companion: Companion?
    let isWorking: Bool
    @ScaledMetric private var side: CGFloat

    init(companion: Companion?, size: CompanionAvatar.Size, isWorking: Bool) {
        self.companion = companion
        self.isWorking = isWorking
        _side = ScaledMetric(wrappedValue: size.points, relativeTo: size.textStyle)
    }

    var body: some View {
        CompanionAvatarArt(companion: companion, isWorking: isWorking)
            .frame(width: side, height: side)
    }
}

struct CompanionPlaceholder: View {
    let size: CompanionAvatar.Size

    var body: some View {
        ScaledPlaceholder(size: size)
            .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
            .accessibilityHidden(true)
    }
}

private struct ScaledPlaceholder: View {
    @ScaledMetric private var side: CGFloat

    init(size: CompanionAvatar.Size) {
        _side = ScaledMetric(wrappedValue: size.points, relativeTo: size.textStyle)
    }

    var body: some View {
        FlatHexagon(isDashed: false)
            .frame(width: side, height: side)
    }
}

struct FlatHexagon: View {
    let isDashed: Bool

    var body: some View {
        let outline = CompanionOutline(drawing: Self.ground)
        if isDashed {
            outline
                .stroke(.secondary, style: StrokeStyle(lineWidth: 2, dash: [5, 4]))
                .padding(1)
        } else {
            outline.fill(Color(.systemGray6))
        }
    }

    static let ground: CompanionDrawing? = try? CompanionAvatarEngine.shared?.drawing(
        name: CompanionAvatarArt.placeholderName, tint: nil, pose: .idle, time: 0, theme: .light)
}

struct CompanionAvatarArt: View {
    static let frameInterval = 1.0 / 30
    static let placeholderName = "Companion"

    let companion: Companion?
    let isWorking: Bool
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(CompanionPictures.self) private var pictures: CompanionPictures?

    var body: some View {
        content
            .overlay { HexagonBorder() }
            .task(id: pictureRequest) {
                guard let file = pictureRequest?.file else { return }
                await pictures?.load(file)
            }
    }

    @ViewBuilder private var content: some View {
        if let companion, let picture = companion.pictureFile.flatMap({ pictures?.pictures[$0] }) {
            Image(uiImage: picture)
                .resizable()
                .scaledToFill()
                .clipShape(CompanionOutline(drawing: drawing(of: companion, at: .now, pose: .idle)))
        } else if let companion {
            TimelineView(.animation(minimumInterval: Self.frameInterval, paused: !isAnimated)) {
                timeline in
                if let drawing = drawing(
                    of: companion, at: timeline.date, pose: isAnimated ? .working : .idle)
                {
                    CompanionField(drawing: drawing)
                } else {
                    plainHexagon
                }
            }
        } else if let ground = placeholderGround {
            CompanionOutline(drawing: ground).fill(ground.groundColour.color)
        } else {
            plainHexagon
        }
    }

    private var isAnimated: Bool {
        isWorking && !reduceMotion
    }

    private var theme: CompanionTheme {
        colorScheme == .dark ? .dark : .light
    }

    private var pictureRequest: PictureRequest? {
        companion?.pictureFile.map {
            PictureRequest(file: $0, pictures: pictures.map(ObjectIdentifier.init))
        }
    }

    private var placeholderGround: CompanionDrawing? {
        try? CompanionAvatarEngine.shared?.drawing(
            name: Self.placeholderName, tint: nil, pose: .idle, time: 0, theme: theme)
    }

    private func drawing(of companion: Companion, at date: Date, pose: CompanionPose)
        -> CompanionDrawing?
    {
        do {
            return try CompanionAvatarEngine.shared?.drawing(
                name: companion.name, tint: companion.tint, pose: pose,
                time: date.timeIntervalSinceReferenceDate * 1000, theme: theme)
        } catch {
            CompanionAvatarEngine.log.error(
                "\(companion.name)'s avatar falls back to a plain hexagon: \(String(describing: error))"
            )
            return nil
        }
    }

    private var plainHexagon: some View {
        Image(systemName: "hexagon.fill")
            .resizable()
            .scaledToFit()
            .foregroundStyle(Color.kiroshi(.railAvatar))
    }
}

private struct PictureRequest: Hashable {
    let file: String
    let pictures: ObjectIdentifier?
}

private struct CompanionField: View {
    let drawing: CompanionDrawing

    var body: some View {
        Canvas { context, canvas in
            let side = canvas.width
            context.clip(to: drawing.outlinePath(side: side))
            context.fill(
                Path(CGRect(origin: .zero, size: canvas)), with: .color(drawing.groundColour.color))
            for lit in drawing.toneOpacities {
                context.fill(
                    drawing.cellsPath(lit: lit.tone, side: side),
                    with: .color(drawing.cellColour.color.opacity(lit.opacity)))
            }
        }
    }
}

struct CompanionOutline: Shape {
    let drawing: CompanionDrawing?

    func path(in rect: CGRect) -> Path {
        guard let drawing else { return Path(rect) }
        return drawing.outlinePath(side: rect.width).offsetBy(dx: rect.minX, dy: rect.minY)
    }
}
