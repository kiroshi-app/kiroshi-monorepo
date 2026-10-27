import Foundation
import SwiftUI
import Testing

@testable import Kiroshi

struct HueToneTests {
    struct Spec: Decodable, Equatable {
        struct Contrast: Decodable, Equatable {
            let with: String
            let ratio: Double
        }

        struct Yellow: Decodable, Equatable {
            let hue: Double
            let lightness: Double
            let chroma: Double
        }

        let lightness: Double
        let chroma: Double
        let contrast: Contrast?
        let yellow: Yellow?
    }

    struct Vectors: Decodable {
        let tones: [String: [String: Spec]]
        let hues: [[String: [String: String]]]
    }

    struct Tokens: Decodable {
        struct Section: Decodable {
            struct Band: Decodable {
                let centre: Double
                let radius: Double
            }

            let presets: [String: Int]
            let yellowBand: Band
            let tones: [String: [String: Spec]]

            enum CodingKeys: String, CodingKey {
                case presets
                case yellowBand = "yellow-band"
                case tones
            }
        }

        let hue: Section
    }

    static let vectors = URL(filePath: #filePath).deletingLastPathComponent()
        .appending(path: "Vectors/hue-tones.json")
    static let tokens = URL(filePath: #filePath)
        .deletingLastPathComponent()
        .appending(path: "../../../packages/ui/tokens.json")
        .standardizedFileURL

    let vectors: Vectors

    init() throws {
        vectors = try JSONDecoder().decode(Vectors.self, from: Data(contentsOf: Self.vectors))
    }

    static func written(_ spec: HueTone.Spec) -> Spec {
        Spec(
            lightness: spec.lightness, chroma: spec.chroma,
            contrast: spec.contrast.map { Spec.Contrast(with: $0.with.hex, ratio: $0.ratio) },
            yellow: spec.yellow.map {
                Spec.Yellow(hue: $0.hue, lightness: $0.lightness, chroma: $0.chroma)
            })
    }

    @Test func derivesEveryHueInEveryRoleAndThemeTheWayTheDesktopDoes() throws {
        #expect(vectors.hues.count == Hue.degreesInATurn)
        var differing: [String] = []
        for (degrees, themes) in vectors.hues.enumerated() {
            let hue = try #require(Hue(degrees: degrees))
            for theme in HueTheme.allCases {
                for role in HueRole.allCases {
                    let desktop = themes[theme.rawValue]?[role.rawValue]
                    let derived = HueTones.tone(hue, theme, role).rgb.hex
                    if derived != desktop {
                        differing.append(
                            "\(degrees) \(theme) \(role): \(derived) ≠ \(desktop ?? "-")")
                    }
                }
            }
        }
        #expect(differing.isEmpty, "\(differing.prefix(20))")
    }

    @Test func theToneTableIsTheDesktopsTable() {
        for theme in HueTheme.allCases {
            for role in HueRole.allCases {
                #expect(
                    Self.written(HueTones.spec(theme, role))
                        == vectors.tones[theme.rawValue]?[role.rawValue], "\(theme) \(role)")
            }
        }
    }

    @Test func theToneTableAndThePresetsAreThoseOfTokensJson() throws {
        let tokens = try JSONDecoder().decode(Tokens.self, from: Data(contentsOf: Self.tokens)).hue
        #expect(tokens.presets == Hue.presets.mapValues(\.degrees))
        #expect(tokens.yellowBand.centre == HueTones.yellowBand.centre)
        #expect(tokens.yellowBand.radius == HueTones.yellowBand.radius)
        for theme in HueTheme.allCases {
            for role in HueRole.allCases {
                let token = try #require(tokens.tones[role.rawValue]?[theme.rawValue])
                let spec = Self.written(HueTones.spec(theme, role))
                #expect(token.lightness == spec.lightness, "\(theme) \(role)")
                #expect(token.chroma == spec.chroma, "\(theme) \(role)")
                #expect(token.contrast?.ratio == spec.contrast?.ratio, "\(theme) \(role)")
                #expect(token.yellow == spec.yellow, "\(theme) \(role)")
            }
        }
    }

    @Test(arguments: Hue.presets.sorted { $0.key < $1.key }.map { ($0.key, $0.value) })
    func eachPresetPaintsTheCataloguesHueColours(name: String, hue: Hue) throws {
        for role in HueRole.allCases {
            let catalogued = Color("hue-\(name)-\(role.rawValue)")
            #expect(
                try SpaceAccentTests.hex(of: catalogued, in: .light).lowercased()
                    == HueTones.tone(hue, .light, role).rgb.hex, "\(name) \(role) light")
            #expect(
                try SpaceAccentTests.hex(of: catalogued, in: .dark).lowercased()
                    == HueTones.tone(hue, .dark, role).rgb.hex, "\(name) \(role) dark")
        }
    }

    @Test(arguments: [HueTheme.light, .dark])
    func theInkTheToneTableHoldsBubblesToIsTheCataloguesInk(_ theme: HueTheme) throws {
        let scheme: ColorScheme = theme == .dark ? .dark : .light
        #expect(
            try SpaceAccentTests.hex(of: .kiroshi(.userBubbleTintInk), in: scheme).lowercased()
                == HueTones.bubbleInk(theme).hex)
        #expect(
            try SpaceAccentTests.hex(of: .kiroshi(.card), in: scheme).lowercased()
                == HueTones.card(theme).hex)
    }

    @Test func outOfRangeHuesAreNone() {
        #expect(Hue(degrees: -1) == nil)
        #expect(Hue(degrees: 360) == nil)
        #expect(Hue(degrees: 0)?.degrees == 0)
        #expect(Hue(degrees: 359)?.degrees == 359)
        #expect(Hue(named: "teal") == nil)
    }
}
