import Foundation
import SwiftUI
import Testing

@testable import Kiroshi

struct SpaceAccentTests {
    static let hues: [Hue?] = [
        .red, .orange, .yellow, .green, .cyan, .blue, .purple, .pink,
        Hue(degrees: 17), Hue(degrees: 200), nil,
    ]

    static func rgb(of color: Color, in scheme: ColorScheme) throws -> [Double] {
        var environment = EnvironmentValues()
        environment.colorScheme = scheme
        let srgb = try #require(CGColorSpace(name: CGColorSpace.sRGB))
        let components = try #require(
            color.resolve(in: environment).cgColor
                .converted(to: srgb, intent: .defaultIntent, options: nil)?.components)
        return components.prefix(3).map(Double.init)
    }

    static func hex(of color: Color, in scheme: ColorScheme) throws -> String {
        "#"
            + (try rgb(of: color, in: scheme)).map {
                String(format: "%02X", Int(($0 * 255).rounded()))
            }
            .joined()
    }

    static func contrast(_ first: [Double], _ second: [Double]) -> Double {
        let luminance: ([Double]) -> Double = { rgb in
            let linear = rgb.map { $0 <= 0.04045 ? $0 / 12.92 : pow(($0 + 0.055) / 1.055, 2.4) }
            return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
        }
        let (lighter, darker) = (luminance(first), luminance(second))
        return (max(lighter, darker) + 0.05) / (min(lighter, darker) + 0.05)
    }

    @Test(arguments: hues.compactMap { $0 })
    func yourBubbleIsTheBubbleToneOfTheSpacesHue(_ hue: Hue) throws {
        let accent = SpaceAccent(tint: hue)
        for (theme, scheme) in [(HueTheme.light, ColorScheme.light), (.dark, .dark)] {
            #expect(
                try Self.hex(of: accent.userBubble, in: scheme).lowercased()
                    == HueTones.tone(hue, theme, .bubble).rgb.hex)
        }
    }

    @Test func aSpaceOutsideThePresetsPaintsTheDesktopsTones() throws {
        let accent = SpaceAccent(tint: Hue(degrees: 200))
        #expect(try Self.hex(of: accent.userBubble, in: .light) == "#98E4E8")
        #expect(try Self.hex(of: accent.userBubble, in: .dark) == "#005B5F")
        #expect(try Self.hex(of: accent.tile, in: .light) == "#007176")
        #expect(try Self.hex(of: accent.tile, in: .dark) == "#3ACED6")
    }

    @Test func aSpaceWithoutAColourKeepsTheCataloguesBubble() throws {
        let accent = SpaceAccent(tint: nil)
        for scheme in [ColorScheme.light, .dark] {
            #expect(try Self.hex(of: accent.userBubble, in: scheme) == "#364F7C")
        }
    }

    @Test(arguments: hues)
    func yourTextReadsOnYourBubble(_ hue: Hue?) throws {
        let accent = SpaceAccent(tint: hue)
        for scheme in [ColorScheme.light, .dark] {
            let ratio = Self.contrast(
                try Self.rgb(of: accent.userBubble, in: scheme),
                try Self.rgb(of: accent.userBubbleForeground, in: scheme))
            #expect(ratio >= 7, "\(scheme): \(ratio)")
        }
    }

    @Test func aTintedBubbleWritesInTheDesktopsInk() throws {
        let accent = SpaceAccent(tint: .purple)
        #expect(try Self.hex(of: accent.userBubbleForeground, in: .light) == "#020202")
        #expect(try Self.hex(of: accent.userBubbleForeground, in: .dark) == "#F5F5F5")
        let fallback = SpaceAccent(tint: nil)
        #expect(try Self.hex(of: fallback.userBubbleForeground, in: .light) == "#FFFFFF")
        #expect(try Self.hex(of: fallback.userBubbleForeground, in: .dark) == "#FFFFFF")
    }

    @Test(arguments: hues.compactMap { $0 })
    func anInvitationsTileIsTheAccentToneOfTheInvitedSpacesHue(_ hue: Hue) throws {
        let accent = SpaceAccent(tint: hue)
        for (theme, scheme) in [(HueTheme.light, ColorScheme.light), (.dark, .dark)] {
            let colour = HueTones.tone(hue, theme, .accent).rgb.hex
            #expect(try Self.hex(of: accent.tile, in: scheme).lowercased() == colour)
            #expect(try Self.hex(of: accent.tileFill, in: scheme).lowercased() == colour)
            var environment = EnvironmentValues()
            environment.colorScheme = scheme
            #expect(accent.tileFill.resolve(in: environment).opacity == 0.25)
        }
    }

    @Test func anInvitationWithoutAColourKeepsTheTileItWore() throws {
        let accent = SpaceAccent(tint: nil)
        for scheme in [ColorScheme.light, .dark] {
            let primary = try Self.hex(of: .kiroshi(.primary), in: scheme)
            #expect(try Self.hex(of: accent.tile, in: scheme) == primary)
            #expect(try Self.hex(of: accent.tileFill, in: scheme) == primary)
        }
    }

    @Test func anotherSpaceIsAnotherAccent() {
        #expect(SpaceAccent(tint: .green) == SpaceAccent(tint: .green))
        #expect(SpaceAccent(tint: .green) != SpaceAccent(tint: .pink))
        #expect(SpaceAccent(tint: Hue(degrees: 200)) != SpaceAccent(tint: .cyan))
        #expect(SpaceAccent(tint: nil) != SpaceAccent(tint: .blue))
    }
}
