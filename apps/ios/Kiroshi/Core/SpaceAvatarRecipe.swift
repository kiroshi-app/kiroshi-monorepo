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

struct SpaceAvatarDot: Equatable, Sendable {
    let diameter: Double
    let cutOut: Double
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

    var dot: SpaceAvatarDot? {
        switch self {
        case .switcher: nil
        case .menu: SpaceAvatarDot(diameter: 6, cutOut: 1.5)
        case .rail: SpaceAvatarDot(diameter: 8, cutOut: 2)
        case .settings: SpaceAvatarDot(diameter: 10, cutOut: 2)
        case .page: SpaceAvatarDot(diameter: 12, cutOut: 2.5)
        case .large: SpaceAvatarDot(diameter: 14, cutOut: 3)
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

    func dotCentre(_ dot: SpaceAvatarDot) -> Double {
        points - SpaceAvatarRecipe.dotCentreInset * dot.diameter
    }
}

enum SpaceAvatarRecipe {
    static let compactBelow = 20
    static let compactRadii = [0.44, 0.8]
    static let dotCentreInset = 0.32

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
