import SwiftUI
import UIKit

enum KiroshiColor: String, CaseIterable, Sendable {
    case background
    case foreground
    case card
    case muted
    case mutedForeground = "muted-foreground"
    case border
    case ring
    case primary
    case primaryForeground = "primary-foreground"
    case secondary
    case secondaryForeground = "secondary-foreground"
    case destructive
    case presenceOnline = "presence-online"
    case presenceOffline = "presence-offline"
    case spaceAvatarLocalBadge = "space-avatar-local-badge"
    case spaceAvatarOfflineBadge = "space-avatar-offline-badge"
    case spaceAvatarHatch = "space-avatar-hatch"
    case railAvatar = "rail-avatar"
    case imageOutline = "image-outline"
    case userBubble = "user-bubble"
    case userBubbleForeground = "user-bubble-foreground"
    case userBubbleTintInk = "user-bubble-tint-ink"
}

extension Color {
    static func kiroshi(_ name: KiroshiColor) -> Color {
        Color(name.rawValue)
    }
}

extension UIColor {
    static func kiroshi(_ name: KiroshiColor) -> UIColor {
        UIColor(named: name.rawValue) ?? .clear
    }
}
