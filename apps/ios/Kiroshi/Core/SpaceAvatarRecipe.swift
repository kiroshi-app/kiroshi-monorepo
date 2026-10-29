import Foundation

enum SpaceAvatarTheme: String, CaseIterable, Sendable {
    case light
    case dark
}

struct SpaceAvatarPoint: Equatable, Sendable {
    let x: Double
    let y: Double
}

struct SpaceAvatarRGB: Equatable, Sendable {
    let red: Double
    let green: Double
    let blue: Double

    var hex: String {
        "#" + [red, green, blue].map { String(format: "%02x", Int(($0 * 255).rounded())) }.joined()
    }
}

struct SpaceAvatarArcs: Equatable, Sendable {
    let anchor: SpaceAvatarPoint
    let radii: [Double]
}

struct SpaceAvatarPalette: Equatable, Sendable {
    let full: [SpaceAvatarRGB]
    let compact: [SpaceAvatarRGB]
}

enum SpaceAvatarState: CaseIterable, Sendable {
    case local
    case shared
    case online
    case connecting
    case offline

    init(presence: SpacePresence?) {
        switch presence {
        case nil: self = .local
        case .shared: self = .shared
        case .online: self = .online
        case .connecting: self = .connecting
        case .offline: self = .offline
        }
    }

    var isFilled: Bool { self != .connecting }

    var hasDot: Bool { self == .shared || self == .online }

    var isGlazed: Bool { self == .local || hasDot }
}

struct SpaceAvatarGlyph: Equatable, Sendable {
    let scale: Double
    let stroke: Double
}

struct SpaceAvatarMarks: Equatable, Sendable {
    struct Initial: Equatable, Sendable {
        let fontSize: Double
        let weight: Int
    }

    struct Badge: Equatable, Sendable {
        let diameter: Double
        let cutOut: Double
    }

    struct Hatch: Equatable, Sendable {
        let spacing: Double
        let stroke: Double
    }

    let initial: Initial
    let badge: Badge
    let laptop: SpaceAvatarGlyph
    let cross: SpaceAvatarGlyph?
    let hatch: Hatch

    func scaled(from drawn: Double, to size: Double) -> SpaceAvatarMarks {
        let scaled = { (value: Double) in SpaceAvatarRecipe.rounded(value * size / drawn) }
        let glyph = { (glyph: SpaceAvatarGlyph) in
            SpaceAvatarGlyph(scale: scaled(glyph.scale), stroke: glyph.stroke)
        }
        return SpaceAvatarMarks(
            initial: Initial(fontSize: scaled(initial.fontSize), weight: initial.weight),
            badge: Badge(diameter: scaled(badge.diameter), cutOut: scaled(badge.cutOut)),
            laptop: glyph(laptop),
            cross: cross.map(glyph),
            hatch: Hatch(spacing: scaled(hatch.spacing), stroke: scaled(hatch.stroke)))
    }
}

enum SpaceAvatarSize: Int, CaseIterable, Sendable {
    case switcher = 12
    case menu = 14
    case rail = 26
    case settings = 36
    case page = 48
    case large = 64

    var points: Double { Double(rawValue) }

    var isCompact: Bool { rawValue < SpaceAvatarRecipe.compactBelow }

    var marks: SpaceAvatarMarks {
        let drawn = drawnMarks
        return drawn.marks.scaled(from: drawn.size.points, to: points)
    }

    var badgeCentre: Double {
        points - SpaceAvatarRecipe.badgeCentreInset * marks.badge.diameter
    }

    var badgeOverhang: Double {
        max(0, badgeCentre + marks.badge.diameter / 2 - points)
    }

    var hatchOffsets: [Double] {
        let spacing = marks.hatch.spacing
        return (0...Int((2 * points / spacing).rounded(.down))).map {
            SpaceAvatarRecipe.rounded(Double($0) * spacing)
        }
    }

    private var drawnMarks: (size: SpaceAvatarSize, marks: SpaceAvatarMarks) {
        switch self {
        case .switcher, .menu: (.menu, SpaceAvatarRecipe.menuMarks)
        case .rail, .settings: (.rail, SpaceAvatarRecipe.railMarks)
        case .page, .large: (.page, SpaceAvatarRecipe.pageMarks)
        }
    }

    var lineStroke: Double {
        switch self {
        case .switcher, .menu, .rail: 1
        case .settings: 1.125
        case .page: 1.5
        case .large: 2
        }
    }
}

enum SpaceAvatarRecipe {
    static let compactBelow = 20
    static let compactRadii = [0.44, 0.8]
    static let badgeCentreInset = 0.36
    static let glyphGrid = 24.0
    static let laptopGlyph =
        "M4 16V6C4 4.8954 4.8954 4 6 4H18C19.1046 4 20 4.8954 20 6V16M2.5 16H21.5C21.7761 16 22 16.2239 22 16.5V18C22 19.1046 21.1046 20 20 20H4C2.8954 20 2 19.1046 2 18V16.5C2 16.2239 2.2239 16 2.5 16Z"
    static let crossGlyph = "M7.5 7.5L16.5 16.5M16.5 7.5L7.5 16.5"
    static let menuMarks = SpaceAvatarMarks(
        initial: .init(fontSize: 10, weight: 700),
        badge: .init(diameter: 8, cutOut: 1.5),
        laptop: SpaceAvatarGlyph(scale: 0.258, stroke: 3.677),
        cross: nil,
        hatch: .init(spacing: 3, stroke: 0.8))
    static let railMarks = SpaceAvatarMarks(
        initial: .init(fontSize: 13, weight: 600),
        badge: .init(diameter: 12, cutOut: 2),
        laptop: SpaceAvatarGlyph(scale: 0.35, stroke: 3.143),
        cross: SpaceAvatarGlyph(scale: 0.34, stroke: 3.2),
        hatch: .init(spacing: 4, stroke: 1))
    static let pageMarks = SpaceAvatarMarks(
        initial: .init(fontSize: 24, weight: 600),
        badge: .init(diameter: 18, cutOut: 2.5),
        laptop: SpaceAvatarGlyph(scale: 0.51, stroke: 2.941),
        cross: SpaceAvatarGlyph(scale: 0.51, stroke: 3.2),
        hatch: .init(spacing: 6, stroke: 1.5))

    private static let superellipseExponent = 4.6
    private static let outlinePoints = 96
    private static let anchorOutset = 0.02
    private static let anchors = [
        SpaceAvatarPoint(x: -anchorOutset, y: -anchorOutset),
        SpaceAvatarPoint(x: 1 + anchorOutset, y: -anchorOutset),
        SpaceAvatarPoint(x: 1 + anchorOutset, y: 1 + anchorOutset),
        SpaceAvatarPoint(x: -anchorOutset, y: 1 + anchorOutset),
    ]
    private static let arcRanges: [(min: Double, max: Double)] = [
        (0.36, 0.42), (0.64, 0.76), (0.92, 1.08),
    ]
    private static let chromaStep = 0.002
    private static let gamutTolerance = 1e-6
    private static let fnvOffset: UInt32 = 0x811c_9dc5
    private static let fnvPrime: UInt32 = 0x0100_0193

    private typealias Tone = (lightness: Double, chroma: Double)

    private static let ink: [SpaceAvatarTheme: Tone] = [
        .light: (0.36, 0.09),
        .dark: (0.96, 0.03),
    ]

    private static let tones: [SpaceAvatarTheme: (full: [Tone], compact: [Tone])] = [
        .light: (
            full: [(0.93, 0.035), (0.85, 0.06), (0.76, 0.09), (0.66, 0.11)],
            compact: [(0.91, 0.045), (0.72, 0.11), (0.5, 0.13)]
        ),
        .dark: (
            full: [(0.36, 0.04), (0.46, 0.06), (0.57, 0.08), (0.68, 0.1)],
            compact: [(0.38, 0.05), (0.56, 0.09), (0.78, 0.1)]
        ),
    ]

    static func seed(_ spaceId: String) -> UInt32 {
        spaceId.unicodeScalars.reduce(fnvOffset) { hash, scalar in
            (hash ^ scalar.value) &* fnvPrime
        }
    }

    static func arcs(_ spaceId: String) -> SpaceAvatarArcs {
        let seed = seed(spaceId)
        let byte = { (index: Int) in Double((seed >> (8 * UInt32(index))) & 0xff) / 0xff }
        return SpaceAvatarArcs(
            anchor: anchors[Int(seed & 0b11)],
            radii: arcRanges.enumerated().map { index, range in
                range.min + (range.max - range.min) * byte(index + 1)
            })
    }

    static func palette(_ theme: SpaceAvatarTheme, colour: Hue?) -> SpaceAvatarPalette {
        let hue = colour.map { Double($0.degrees) * .pi / 180 }
        let tone = { (tone: Tone) in
            fitted(lightness: tone.lightness, chroma: hue == nil ? 0 : tone.chroma, hue: hue ?? 0)
        }
        let recipe = tones[theme] ?? (full: [], compact: [])
        return SpaceAvatarPalette(full: recipe.full.map(tone), compact: recipe.compact.map(tone))
    }

    static func ink(_ theme: SpaceAvatarTheme, colour: Hue?) -> SpaceAvatarRGB {
        let tone = ink[theme] ?? (0, 0)
        return fitted(
            lightness: tone.lightness, chroma: colour == nil ? 0 : tone.chroma,
            hue: colour.map { Double($0.degrees) * .pi / 180 } ?? 0)
    }

    static func initial(of name: String) -> String {
        name.trimmingCharacters(in: .whitespacesAndNewlines).first.map { $0.uppercased() } ?? ""
    }

    static func rounded(_ value: Double) -> Double {
        (value * 1000).rounded() / 1000
    }

    static func outline(centre: Double, half: Double) -> [SpaceAvatarPoint] {
        let power = 2 / superellipseExponent
        return (0..<outlinePoints).map { index in
            let angle = Double(index) / Double(outlinePoints) * 2 * .pi
            let (cos, sin) = (Foundation.cos(angle), Foundation.sin(angle))
            return SpaceAvatarPoint(
                x: centre + half * sign(cos) * pow(abs(cos), power),
                y: centre + half * sign(sin) * pow(abs(sin), power))
        }
    }

    private static func sign(_ value: Double) -> Double {
        value > 0 ? 1 : value < 0 ? -1 : 0
    }

    private static func fitted(lightness: Double, chroma: Double, hue: Double) -> SpaceAvatarRGB {
        var chroma = chroma
        while chroma > 0, !isInSrgb(linearSrgb(lightness: lightness, chroma: chroma, hue: hue)) {
            chroma = max(0, chroma - chromaStep)
        }
        let channels = linearSrgb(lightness: lightness, chroma: chroma, hue: hue).map(gamma)
        return SpaceAvatarRGB(red: channels[0], green: channels[1], blue: channels[2])
    }

    private static func linearSrgb(lightness: Double, chroma: Double, hue: Double) -> [Double] {
        let a = chroma * cos(hue)
        let b = chroma * sin(hue)
        let l = pow(lightness + 0.3963377774 * a + 0.2158037573 * b, 3)
        let m = pow(lightness - 0.1055613458 * a - 0.0638541728 * b, 3)
        let s = pow(lightness - 0.0894841775 * a - 1.291485548 * b, 3)
        return [
            4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
            -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
            -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
        ]
    }

    private static func isInSrgb(_ channels: [Double]) -> Bool {
        channels.allSatisfy { $0 >= -gamutTolerance && $0 <= 1 + gamutTolerance }
    }

    private static func gamma(_ linear: Double) -> Double {
        let clamped = min(1, max(0, linear))
        let encoded =
            clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * pow(clamped, 1 / 2.4) - 0.055
        return (encoded * 255).rounded() / 255
    }
}
