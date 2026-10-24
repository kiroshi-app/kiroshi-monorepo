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
            increasedLight: "#8A8A8E", increasedDark: "#7C7C80"),
        Artboard(
            name: "row count", color: MessageCard.label, light: "#6C6C70", dark: "#EBEBF599",
            increasedLight: "#545456", increasedDark: "#AEAEB2"),
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

    @Test func theTableCardFillMatchesArtboardSevenInLightAndDark() throws {
        #expect(try hex(of: MessageCard.fill, in: .light, contrast: .standard) == "#FFFFFF")
        #expect(try hex(of: MessageCard.fill, in: .dark, contrast: .standard) == "#2C2C2E")
    }

    @Test(arguments: [(1, "1 row"), (3, "3 rows"), (0, "0 rows")])
    func theHeaderCountsTheRowsUnderTheColumnTitles(_ count: Int, _ label: String) {
        #expect(TableCard.rowCount(count) == label)
    }
}
