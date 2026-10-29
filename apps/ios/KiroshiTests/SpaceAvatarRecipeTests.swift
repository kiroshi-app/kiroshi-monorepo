import Foundation
import SwiftUI
import Testing
import UIKit

@testable import Kiroshi

struct SpaceAvatarRecipeTests {
    struct Vectors: Decodable {
        struct Arc: Decodable {
            struct Point: Decodable {
                let x: Double
                let y: Double
            }

            let id: String
            let seed: UInt32
            let anchor: Point
            let radii: [Double]
        }

        struct Palette: Decodable {
            let theme: String
            let colour: Int?
            let full: [String]
            let compact: [String]
        }

        struct Ink: Decodable {
            let theme: String
            let colour: Int?
            let ink: String
        }

        struct Initial: Decodable {
            let name: String
            let initial: String
        }

        struct Glyphs: Decodable {
            let grid: Double
            let laptop: String
            let cross: String
        }

        struct Badges: Decodable {
            struct Hatch: Decodable {
                let colour: String
                let opacity: Double
            }

            let local: String
            let offline: String
            let hatch: Hatch
        }

        struct Size: Decodable {
            struct Mark: Decodable {
                struct Initial: Decodable {
                    let fontSize: Double
                    let weight: Int
                }

                struct Pair: Decodable {
                    let diameter: Double?
                    let cutOut: Double?
                    let scale: Double?
                    let stroke: Double?
                    let spacing: Double?
                }

                let initial: Initial
                let badge: Pair
                let laptop: Pair
                let cross: Pair?
                let hatch: Pair
                let badgeCentre: Double
                let hatchOffsets: [Double]
            }

            let size: Int
            let isCompact: Bool
            let lineStroke: Double
            let mark: Mark
            let outline: [[Double]]
        }

        let compactRadii: [Double]
        let arcs: [Arc]
        let palettes: [Palette]
        let inks: [Ink]
        let initials: [Initial]
        let glyphs: Glyphs
        let badges: [String: Badges]
        let sizes: [Size]
    }

    static let vectors = URL(filePath: #filePath).deletingLastPathComponent()
        .appending(path: "Vectors/space-avatar.json")
    static let pathRounding = 0.0005
    static let drift = 1e-12

    let vectors: Vectors

    init() throws {
        vectors = try JSONDecoder().decode(Vectors.self, from: Data(contentsOf: Self.vectors))
    }

    @Test func seedsTheSameArcsFromTheSpaceIdAsTheDesktop() {
        #expect(vectors.arcs.count == 12)
        for arc in vectors.arcs {
            let arcs = SpaceAvatarRecipe.arcs(arc.id)
            #expect(SpaceAvatarRecipe.seed(arc.id) == arc.seed, "\(arc.id)")
            #expect(arcs.anchor == SpaceAvatarPoint(x: arc.anchor.x, y: arc.anchor.y), "\(arc.id)")
            #expect(arcs.radii.count == arc.radii.count)
            for (radius, expected) in zip(arcs.radii, arc.radii) {
                #expect(abs(radius - expected) < Self.drift, "\(arc.id)")
            }
        }
        #expect(SpaceAvatarRecipe.compactRadii == vectors.compactRadii)
    }

    @Test func paintsTheSameTonesAsTheDesktopInEveryColourAndTheme() throws {
        #expect(vectors.palettes.count == 2 * (Hue.presets.count + 3))
        for palette in vectors.palettes {
            let theme = try #require(SpaceAvatarTheme(rawValue: palette.theme))
            let colour = palette.colour.flatMap(Hue.init(degrees:))
            #expect(colour != nil || palette.colour == nil)
            let drawn = SpaceAvatarRecipe.palette(theme, colour: colour)
            let label = "\(palette.theme) \(palette.colour.map(String.init) ?? "no colour")"
            #expect(drawn.full.map(\.hex) == palette.full, "\(label)")
            #expect(drawn.compact.map(\.hex) == palette.compact, "\(label)")
        }
    }

    @Test func inksTheInitialInTheSpaceHueAndTheNeutralInkWithoutOne() throws {
        #expect(vectors.inks.count == 2 * (Hue.presets.count + 3))
        for vector in vectors.inks {
            let theme = try #require(SpaceAvatarTheme(rawValue: vector.theme))
            let colour = vector.colour.flatMap(Hue.init(degrees:))
            #expect(
                SpaceAvatarRecipe.ink(theme, colour: colour).hex == vector.ink,
                "\(vector.theme) \(vector.colour.map(String.init) ?? "no colour")")
        }
    }

    @Test func takesTheSameInitialAsTheDesktop() {
        #expect(vectors.initials.count == 12)
        for vector in vectors.initials {
            #expect(SpaceAvatarRecipe.initial(of: vector.name) == vector.initial, "\(vector.name)")
        }
    }

    @Test func drawsTheDesktopGlyphsOnTheirGrid() {
        #expect(SpaceAvatarRecipe.glyphGrid == vectors.glyphs.grid)
        #expect(SpaceAvatarRecipe.laptopGlyph == vectors.glyphs.laptop)
        #expect(SpaceAvatarRecipe.crossGlyph == vectors.glyphs.cross)
        #expect(
            Path(glyph: vectors.glyphs.laptop).boundingRect
                == CGRect(x: 2, y: 4, width: 20, height: 16))
        #expect(
            Path(glyph: vectors.glyphs.cross).boundingRect
                == CGRect(x: 7.5, y: 7.5, width: 9, height: 9))
    }

    @Test(arguments: SpaceAvatarTheme.allCases)
    func paintsTheBadgesAndTheHatchInTheDesktopColours(_ theme: SpaceAvatarTheme) throws {
        let badges = try #require(vectors.badges[theme.rawValue])
        let traits = UITraitCollection(userInterfaceStyle: theme == .dark ? .dark : .light)
        let resolved = { (name: String) in
            Self.rgba(UIColor(named: name)?.resolvedColor(with: traits) ?? .clear)
        }
        #expect(resolved("space-avatar-local-badge") == Self.rgba(badges.local, opacity: 1))
        #expect(resolved("space-avatar-offline-badge") == Self.rgba(badges.offline, opacity: 1))
        #expect(
            resolved("space-avatar-hatch")
                == Self.rgba(badges.hatch.colour, opacity: badges.hatch.opacity))
    }

    @Test func drawsTheStateOfEachPresence() {
        #expect(SpaceAvatarState(presence: nil) == .local)
        #expect(SpaceAvatarState(presence: .shared) == .shared)
        #expect(SpaceAvatarState(presence: .online) == .online)
        #expect(SpaceAvatarState(presence: .connecting) == .connecting)
        #expect(SpaceAvatarState(presence: .offline) == .offline)
    }

    @Test func drawsTheSameMarksLinesAndOutlineAtEverySize() throws {
        #expect(vectors.sizes.map(\.size) == SpaceAvatarSize.allCases.map(\.rawValue))
        for vector in vectors.sizes {
            let size = try #require(SpaceAvatarSize(rawValue: vector.size))
            let marks = size.marks
            let mark = vector.mark
            #expect(size.isCompact == vector.isCompact)
            #expect(size.lineStroke == vector.lineStroke)
            #expect(marks.initial.fontSize == mark.initial.fontSize, "\(vector.size)")
            #expect(marks.initial.weight == mark.initial.weight, "\(vector.size)")
            #expect(marks.badge.diameter == mark.badge.diameter, "\(vector.size)")
            #expect(marks.badge.cutOut == mark.badge.cutOut, "\(vector.size)")
            #expect(marks.laptop.scale == mark.laptop.scale, "\(vector.size)")
            #expect(marks.laptop.stroke == mark.laptop.stroke, "\(vector.size)")
            #expect(marks.cross?.scale == mark.cross?.scale, "\(vector.size)")
            #expect(marks.cross?.stroke == mark.cross?.stroke, "\(vector.size)")
            #expect(marks.hatch.spacing == mark.hatch.spacing, "\(vector.size)")
            #expect(marks.hatch.stroke == mark.hatch.stroke, "\(vector.size)")
            #expect(abs(size.badgeCentre - mark.badgeCentre) < Self.drift, "\(vector.size)")
            #expect(size.hatchOffsets == mark.hatchOffsets, "\(vector.size)")
            let overhang = mark.badgeCentre + (mark.badge.diameter ?? 0) / 2 - Double(vector.size)
            #expect(abs(size.badgeOverhang - max(0, overhang)) < Self.drift, "\(vector.size)")
            let outline = SpaceAvatarRecipe.outline(centre: size.points / 2, half: size.points / 2)
            #expect(outline.count == vector.outline.count)
            for (point, expected) in zip(outline, vector.outline) {
                #expect(abs(point.x - expected[0]) <= Self.pathRounding, "\(vector.size)")
                #expect(abs(point.y - expected[1]) <= Self.pathRounding, "\(vector.size)")
            }
        }
    }

    private static func rgba(_ colour: UIColor) -> [Int] {
        var (red, green, blue, alpha): (CGFloat, CGFloat, CGFloat, CGFloat) = (0, 0, 0, 0)
        colour.getRed(&red, green: &green, blue: &blue, alpha: &alpha)
        return [red, green, blue, alpha].map { Int(($0 * 255).rounded()) }
    }

    private static func rgba(_ hex: String, opacity: Double) -> [Int] {
        let value = Int(hex.dropFirst(), radix: 16) ?? 0
        return [
            value >> 16 & 0xff, value >> 8 & 0xff, value & 0xff, Int((opacity * 255).rounded()),
        ]
    }
}
