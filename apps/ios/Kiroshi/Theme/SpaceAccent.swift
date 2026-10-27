import SwiftUI
import UIKit

struct SpaceAccent: Equatable, Sendable {
    static let tileFillOpacity = 0.25

    let tint: Hue?
    let userBubble: Color
    let userBubbleForeground: Color
    let tile: Color
    let tileFill: Color

    init(tint: Hue?) {
        self.tint = tint
        guard let tint else {
            userBubble = .kiroshi(.userBubble)
            userBubbleForeground = .kiroshi(.userBubbleForeground)
            tile = .kiroshi(.primary)
            tileFill = Color.kiroshi(.primary).opacity(Self.tileFillOpacity)
            return
        }
        userBubble = Color(uiColor: .hue(tint, .bubble))
        userBubbleForeground = .kiroshi(.userBubbleTintInk)
        let accent = UIColor.hue(tint, .accent)
        tile = Color(uiColor: accent)
        tileFill = Color(uiColor: accent.withAlphaComponent(Self.tileFillOpacity))
    }

    static func == (lhs: SpaceAccent, rhs: SpaceAccent) -> Bool {
        lhs.tint == rhs.tint
    }
}

extension EnvironmentValues {
    @Entry var spaceAccent = SpaceAccent(tint: nil)
}

extension HueRGB {
    var uiColor: UIColor {
        UIColor(
            red: CGFloat(red) / 255, green: CGFloat(green) / 255, blue: CGFloat(blue) / 255,
            alpha: 1)
    }
}

extension UIColor {
    static func hue(_ hue: Hue, _ role: HueRole) -> UIColor {
        let light = HueTones.tone(hue, .light, role).rgb.uiColor
        let dark = HueTones.tone(hue, .dark, role).rgb.uiColor
        return UIColor { $0.userInterfaceStyle == .dark ? dark : light }
    }
}
