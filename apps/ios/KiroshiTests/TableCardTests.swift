import SwiftUI
import Testing

@testable import Kiroshi

struct TableCardTests {
    struct Artboard: Sendable, CustomTestStringConvertible {
        let name: String
        let color: Color
        let light: String
        let dark: String
        let increasedLight: String
        let increasedDark: String

        var testDescription: String { name }
    }

    static let artboards = [
        Artboard(
            name: "stroke", color: MessageCard.stroke, light: "#C6C6C8", dark: "#48484A",
            increasedLight: "#6C6C70", increasedDark: "#7C7C80"),
        Artboard(
            name: "row count", color: MessageCard.label, light: "#6C6C70", dark: "#EBEBF599",
            increasedLight: "#545456", increasedDark: "#AEAEB2"),
        Artboard(
            name: "fill", color: MessageCard.fill, light: "#FFFFFF", dark: "#2C2C2E",
            increasedLight: "#FFFFFF", increasedDark: "#2C2C2E"),
        Artboard(
            name: "row separator", color: MessageCard.separator, light: "#3C3C434A",
            dark: "#54545899", increasedLight: "#3C3C434A", increasedDark: "#54545899"),
    ]

    func hex(of color: Color, in scheme: ColorScheme, contrast: ColorSchemeContrast) throws
        -> String
    {
        try CodeCardColorsTests.hex(of: color, in: scheme, contrast: contrast)
    }

    @Test(arguments: artboards)
    func aTableCardColourMatchesArtboardsSevenAndSixCInEveryAppearance(_ artboard: Artboard)
        throws
    {
        #expect(try hex(of: artboard.color, in: .light, contrast: .standard) == artboard.light)
        #expect(try hex(of: artboard.color, in: .dark, contrast: .standard) == artboard.dark)
        #expect(
            try hex(of: artboard.color, in: .light, contrast: .increased)
                == artboard.increasedLight)
        #expect(
            try hex(of: artboard.color, in: .dark, contrast: .increased) == artboard.increasedDark)
    }

    @Test(arguments: [(1, "1 row"), (3, "3 rows"), (0, "0 rows")])
    func theHeaderCountsTheRowsUnderTheColumnTitles(_ count: Int, _ label: String) {
        #expect(TableCard.rowCount(count) == label)
    }
}
