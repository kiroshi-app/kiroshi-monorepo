import Foundation
import SwiftUI
import Testing

@testable import Kiroshi

struct SpaceAccentTests {
    struct Desktop: Sendable, CustomTestStringConvertible {
        let tint: CompanionTint?
        let light: String
        let dark: String

        var testDescription: String { tint?.rawValue ?? "no colour" }
    }

    static let tokens = URL(filePath: #filePath)
        .deletingLastPathComponent()
        .appending(path: "../../../packages/ui/tokens.json")
        .standardizedFileURL

    static let desktop = [
        Desktop(tint: .red, light: "#F4A98C", dark: "#79584C"),
        Desktop(tint: .yellow, light: "#F2C879", dark: "#786544"),
        Desktop(tint: .green, light: "#AFC99B", dark: "#5A6652"),
        Desktop(tint: .cyan, light: "#92C9C2", dark: "#4E6663"),
        Desktop(tint: .blue, light: "#A0BEE8", dark: "#546174"),
        Desktop(tint: .purple, light: "#BCAFE3", dark: "#605A72"),
        Desktop(tint: .pink, light: "#F0A9C0", dark: "#775862"),
        Desktop(tint: .orange, light: "#F2B57E", dark: "#785D46"),
        Desktop(tint: nil, light: "#364F7C", dark: "#364F7C"),
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

    @Test(arguments: desktop)
    func yourBubbleIsTheOneTheDesktopMixes(_ desktop: Desktop) throws {
        let accent = SpaceAccent(tint: desktop.tint)
        #expect(try Self.hex(of: accent.userBubble, in: .light) == desktop.light)
        #expect(try Self.hex(of: accent.userBubble, in: .dark) == desktop.dark)
    }

    @Test(arguments: desktop.map(\.tint))
    func yourTextReadsOnYourBubble(_ tint: CompanionTint?) throws {
        let accent = SpaceAccent(tint: tint)
        for scheme in [ColorScheme.light, .dark] {
            let ratio = Self.contrast(
                try Self.rgb(of: accent.userBubble, in: scheme),
                try Self.rgb(of: accent.userBubbleForeground, in: scheme))
            #expect(ratio >= 4.5, "\(scheme): \(ratio)")
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

    @Test func theTintStrengthsAreTheDesktopTokens() throws {
        let tokens = try JSONDecoder().decode(Tokens.self, from: Data(contentsOf: Self.tokens))
        let strength = try #require(tokens.parameters["user-bubble-tint-strength"])
        #expect(strength == ["light": "100%", "dark": "50%"])
        #expect(SpaceAccent.lightTintStrength == 1.0)
        #expect(SpaceAccent.darkTintStrength == 0.5)
    }

    @Test func anotherSpaceIsAnotherAccent() {
        #expect(SpaceAccent(tint: .green) == SpaceAccent(tint: .green))
        #expect(SpaceAccent(tint: .green) != SpaceAccent(tint: .pink))
        #expect(SpaceAccent(tint: nil) != SpaceAccent(tint: .blue))
    }
}

private struct Tokens: Decodable {
    let parameters: [String: [String: String]]
}
