import SwiftUI
import UIKit

struct SpaceAccent: Equatable, Sendable {
    static let lightTintStrength = 1.0
    static let darkTintStrength = 0.5

    let tint: CompanionTint?
    let userBubble: Color
    let userBubbleForeground: Color

    init(tint: CompanionTint?) {
        self.tint = tint
        userBubble = Color(uiColor: Self.userBubble(tint))
        userBubbleForeground = Color(
            uiColor: .kiroshi(tint == nil ? .userBubbleForeground : .userBubbleTintInk))
    }

    static func == (lhs: SpaceAccent, rhs: SpaceAccent) -> Bool {
        lhs.tint == rhs.tint
    }

    private static func blot(_ tint: CompanionTint) -> UIColor {
        UIColor(named: "bot-blot-\(tint.rawValue)") ?? .clear
    }

    private static func userBubble(_ tint: CompanionTint?) -> UIColor {
        guard let tint else { return .kiroshi(.userBubble) }
        let blot = blot(tint)
        let card = UIColor.kiroshi(.card)
        return UIColor { traits in
            let strength =
                traits.userInterfaceStyle == .dark ? darkTintStrength : lightTintStrength
            return OKLab.mix(
                blot.resolvedColor(with: traits), strength, card.resolvedColor(with: traits))
        }
    }
}

extension EnvironmentValues {
    @Entry var spaceAccent = SpaceAccent(tint: nil)
}

private struct OKLab {
    let lightness: Double
    let a: Double
    let b: Double

    static func mix(_ first: UIColor, _ share: Double, _ second: UIColor) -> UIColor {
        let one = OKLab(first)
        let other = OKLab(second)
        return OKLab(
            lightness: one.lightness * share + other.lightness * (1 - share),
            a: one.a * share + other.a * (1 - share),
            b: one.b * share + other.b * (1 - share)
        ).color
    }

    init(lightness: Double, a: Double, b: Double) {
        self.lightness = lightness
        self.a = a
        self.b = b
    }

    init(_ color: UIColor) {
        var red: CGFloat = 0
        var green: CGFloat = 0
        var blue: CGFloat = 0
        color.getRed(&red, green: &green, blue: &blue, alpha: nil)
        let (r, g, b) = (Self.linear(red), Self.linear(green), Self.linear(blue))
        let l = cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
        let m = cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
        let s = cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
        lightness = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
        a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
        self.b = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    }

    var color: UIColor {
        let l = pow(lightness + 0.3963377774 * a + 0.2158037573 * b, 3)
        let m = pow(lightness - 0.1055613458 * a - 0.0638541728 * b, 3)
        let s = pow(lightness - 0.0894841775 * a - 1.2914855480 * b, 3)
        return UIColor(
            red: Self.gamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
            green: Self.gamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
            blue: Self.gamma(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
            alpha: 1)
    }

    private static func linear(_ channel: CGFloat) -> Double {
        let value = Double(channel)
        return value <= 0.04045 ? value / 12.92 : pow((value + 0.055) / 1.055, 2.4)
    }

    private static func gamma(_ value: Double) -> CGFloat {
        let encoded = value <= 0.0031308 ? 12.92 * value : 1.055 * pow(value, 1 / 2.4) - 0.055
        return CGFloat(min(max(encoded, 0), 1))
    }
}
