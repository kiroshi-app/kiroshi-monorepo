import SwiftUI
import Testing

@testable import Kiroshi

struct CodeCardColorsTests {
    struct Artboard: Sendable, CustomTestStringConvertible {
        let color: String
        let light: String
        let dark: String
        let increasedLight: String
        let increasedDark: String

        var testDescription: String { color }
    }

    static let artboards = [
        Artboard(
            color: "syntax-keyword", light: "#AD3DA4", dark: "#FF7AB2",
            increasedLight: "#8A2E84", increasedDark: "#FF9CC8"),
        Artboard(
            color: "syntax-function", light: "#326D74", dark: "#67B7A4",
            increasedLight: "#2A5C62", increasedDark: "#85D0BE"),
        Artboard(
            color: "syntax-comment", light: "#5D6C79", dark: "#8E9AA6",
            increasedLight: "#4A5763", increasedDark: "#B0BCC8"),
        Artboard(
            color: "syntax-string", light: "#D12F1B", dark: "#FF8170",
            increasedLight: "#A8200F", increasedDark: "#FFA197"),
        Artboard(
            color: "syntax-type", light: "#3900A0", dark: "#DABAFF",
            increasedLight: "#3900A0", increasedDark: "#DABAFF"),
        Artboard(
            color: "syntax-number", light: "#272AD8", dark: "#D9C97C",
            increasedLight: "#272AD8", increasedDark: "#D9C97C"),
        Artboard(
            color: "card-label", light: "#6C6C70", dark: "#EBEBF599",
            increasedLight: "#545456", increasedDark: "#AEAEB2"),
        Artboard(
            color: "card-stroke", light: "#C6C6C8", dark: "#48484A",
            increasedLight: "#6C6C70", increasedDark: "#7C7C80"),
    ]

    static func hex(of color: Color, in scheme: ColorScheme, contrast: ColorSchemeContrast) throws
        -> String
    {
        var environment = EnvironmentValues()
        environment.colorScheme = scheme
        environment._colorSchemeContrast = contrast
        let srgb = try #require(CGColorSpace(name: CGColorSpace.sRGB))
        let resolved = try #require(
            color.resolve(in: environment).cgColor
                .converted(to: srgb, intent: .defaultIntent, options: nil)?.components)
        let bytes = resolved.map { Int(($0 * 255).rounded()) }
        let rgb = bytes.prefix(3).map { String(format: "%02X", $0) }.joined()
        return "#" + rgb + (bytes[3] == 255 ? "" : String(format: "%02X", bytes[3]))
    }

    func hex(of color: String, in scheme: ColorScheme, contrast: ColorSchemeContrast) throws
        -> String
    {
        try Self.hex(of: Color(color), in: scheme, contrast: contrast)
    }

    @Test(arguments: artboards)
    func aCodeCardColourMatchesItsArtboardInEveryAppearance(_ artboard: Artboard) throws {
        #expect(try hex(of: artboard.color, in: .light, contrast: .standard) == artboard.light)
        #expect(try hex(of: artboard.color, in: .dark, contrast: .standard) == artboard.dark)
        #expect(
            try hex(of: artboard.color, in: .light, contrast: .increased)
                == artboard.increasedLight)
        #expect(
            try hex(of: artboard.color, in: .dark, contrast: .increased) == artboard.increasedDark)
    }
}
