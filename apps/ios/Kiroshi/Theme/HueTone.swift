import Foundation
import Synchronization

enum HueTheme: String, CaseIterable, Sendable {
    case light
    case dark
}

enum HueRole: String, CaseIterable, Sendable {
    case bubble
    case accent
    case newLine = "new-line"
    case avatarInk = "avatar-ink"
    case avatarGround = "avatar-ground"
    case conversationIcon = "conversation-icon"
    case conversationIconForeground = "conversation-icon-foreground"
}

struct HueRGB: Hashable, Sendable {
    let red: Int
    let green: Int
    let blue: Int

    var hex: String {
        String(format: "#%02x%02x%02x", red, green, blue)
    }

    var relativeLuminance: Double {
        let linear = { (byte: Int) in
            let encoded = Double(byte) / 255
            return encoded <= 0.04045 ? encoded / 12.92 : pow((encoded + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue)
    }

    func contrast(with other: HueRGB) -> Double {
        let (first, second) = (relativeLuminance, other.relativeLuminance)
        return (max(first, second) + 0.05) / (min(first, second) + 0.05)
    }
}

struct HueTone: Hashable, Sendable {
    struct Contrast: Hashable, Sendable {
        let with: HueRGB
        let ratio: Double
    }

    struct Yellow: Hashable, Sendable {
        let hue: Double
        let lightness: Double
        let chroma: Double
    }

    struct Spec: Hashable, Sendable {
        let lightness: Double
        let chroma: Double
        var contrast: Contrast? = nil
        var yellow: Yellow? = nil
    }

    let lightness: Double
    let chroma: Double
    let hue: Double
    let rgb: HueRGB
}

enum HueTones {
    static let yellowBand = (centre: 82.0, radius: 20.0)

    static func bubbleInk(_ theme: HueTheme) -> HueRGB {
        switch theme {
        case .light: HueRGB(red: 0x02, green: 0x02, blue: 0x02)
        case .dark: HueRGB(red: 0xf5, green: 0xf5, blue: 0xf5)
        }
    }

    static func card(_ theme: HueTheme) -> HueRGB {
        switch theme {
        case .light: HueRGB(red: 0xff, green: 0xff, blue: 0xff)
        case .dark: HueRGB(red: 0x12, green: 0x12, blue: 0x13)
        }
    }

    static func spec(_ theme: HueTheme, _ role: HueRole) -> HueTone.Spec {
        switch (theme, role) {
        case (.light, .bubble):
            .init(
                lightness: 0.87, chroma: 0.075, contrast: .init(with: bubbleInk(.light), ratio: 7))
        case (.light, .accent):
            .init(
                lightness: 0.5, chroma: 0.13, contrast: .init(with: card(.light), ratio: 4.5),
                yellow: .init(hue: 75, lightness: 0.54, chroma: 0.115))
        case (.light, .newLine): .init(lightness: 0.8, chroma: 0.06)
        case (.light, .avatarInk): .init(lightness: 0.56, chroma: 0.13)
        case (.light, .avatarGround): .init(lightness: 0.93, chroma: 0.035)
        case (.light, .conversationIcon): .init(lightness: 0.92, chroma: 0.033)
        case (.light, .conversationIconForeground): .init(lightness: 0.45, chroma: 0.054)
        case (.dark, .bubble):
            .init(lightness: 0.45, chroma: 0.1, contrast: .init(with: bubbleInk(.dark), ratio: 7.2))
        case (.dark, .accent):
            .init(lightness: 0.78, chroma: 0.12, contrast: .init(with: card(.dark), ratio: 4.5))
        case (.dark, .newLine): .init(lightness: 0.4, chroma: 0.06)
        case (.dark, .avatarInk): .init(lightness: 0.8, chroma: 0.12)
        case (.dark, .avatarGround): .init(lightness: 0.3, chroma: 0.04)
        case (.dark, .conversationIcon): .init(lightness: 0.385, chroma: 0.033)
        case (.dark, .conversationIconForeground): .init(lightness: 0.8, chroma: 0.054)
        }
    }

    private struct Key: Hashable {
        let hue: Hue
        let theme: HueTheme
        let role: HueRole
    }

    private static let cache = Mutex<[Key: HueTone]>([:])

    static func tone(_ hue: Hue, _ theme: HueTheme, _ role: HueRole) -> HueTone {
        let key = Key(hue: hue, theme: theme, role: role)
        if let cached = cache.withLock({ $0[key] }) { return cached }
        let tone = HueRecipe.tone(spec(theme, role), hue: Double(hue.degrees))
        cache.withLock { $0[key] = tone }
        return tone
    }
}

enum HueRecipe {
    static let lightnessStep = 0.0025
    static let lightnessResolution = 1e4
    static let chromaSearchSteps = 24
    static let gamutTolerance = 1e-6

    static func tone(_ spec: HueTone.Spec, hue: Double) -> HueTone {
        let corrected = corrected(spec, hue: normalised(hue))
        let toneAt = { (lightness: Double) in
            let chroma = gamutChroma(lightness, corrected.chroma, corrected.hue)
            return HueTone(
                lightness: lightness, chroma: chroma, hue: corrected.hue,
                rgb: rgb(lightness, chroma, corrected.hue))
        }
        var tone = toneAt(rounded(corrected.lightness))
        guard let contrast = spec.contrast else { return tone }
        let direction: Double =
            contrast.with.relativeLuminance > tone.rgb.relativeLuminance ? -1 : 1
        while tone.rgb.contrast(with: contrast.with) < contrast.ratio, tone.lightness > 0,
            tone.lightness < 1
        {
            tone = toneAt(rounded(tone.lightness + direction * lightnessStep))
        }
        return tone
    }

    static func normalised(_ hue: Double) -> Double {
        (hue.truncatingRemainder(dividingBy: 360) + 360).truncatingRemainder(dividingBy: 360)
    }

    static func distance(_ from: Double, _ to: Double) -> Double {
        abs((from - to + 540).truncatingRemainder(dividingBy: 360) - 180)
    }

    private static func corrected(_ spec: HueTone.Spec, hue: Double) -> (
        lightness: Double, chroma: Double, hue: Double
    ) {
        guard let yellow = spec.yellow else { return (spec.lightness, spec.chroma, hue) }
        let band = HueTones.yellowBand
        let away = distance(hue, band.centre)
        let weight = away < band.radius ? pow(cos(.pi / 2 * away / band.radius), 2) : 0
        let blend = { (from: Double, to: Double) in from + (to - from) * weight }
        return (
            blend(spec.lightness, yellow.lightness),
            blend(spec.chroma, yellow.chroma),
            normalised(blend(hue, hue + yellow.hue - band.centre))
        )
    }

    private static func rounded(_ lightness: Double) -> Double {
        (lightness * lightnessResolution).rounded() / lightnessResolution
    }

    private static func linearSrgb(_ lightness: Double, _ chroma: Double, _ hue: Double)
        -> [Double]
    {
        let radians = hue * .pi / 180
        let a = chroma * cos(radians)
        let b = chroma * sin(radians)
        let l = pow(lightness + 0.3963377774 * a + 0.2158037573 * b, 3)
        let m = pow(lightness - 0.1055613458 * a - 0.0638541728 * b, 3)
        let s = pow(lightness - 0.0894841775 * a - 1.291485548 * b, 3)
        return [
            4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
            -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
            -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
        ]
    }

    private static func isInSrgb(_ lightness: Double, _ chroma: Double, _ hue: Double) -> Bool {
        linearSrgb(lightness, chroma, hue).allSatisfy {
            $0 >= -gamutTolerance && $0 <= 1 + gamutTolerance
        }
    }

    private static func gamutChroma(_ lightness: Double, _ chroma: Double, _ hue: Double)
        -> Double
    {
        if isInSrgb(lightness, chroma, hue) { return chroma }
        var inside = 0.0
        var outside = chroma
        for _ in 0..<chromaSearchSteps {
            let middle = (inside + outside) / 2
            if isInSrgb(lightness, middle, hue) { inside = middle } else { outside = middle }
        }
        return inside
    }

    private static func rgb(_ lightness: Double, _ chroma: Double, _ hue: Double) -> HueRGB {
        let bytes = linearSrgb(lightness, chroma, hue).map { linear in
            let clamped = min(1, max(0, linear))
            let encoded =
                clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * pow(clamped, 1 / 2.4) - 0.055
            return Int((encoded * 255).rounded())
        }
        return HueRGB(red: bytes[0], green: bytes[1], blue: bytes[2])
    }
}
