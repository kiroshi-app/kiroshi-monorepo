import Foundation
import Testing

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

        struct Size: Decodable {
            struct Dot: Decodable {
                let diameter: Double
                let cutOut: Double
                let centre: Double
            }

            let size: Int
            let isCompact: Bool
            let lineStroke: Double
            let dot: Dot?
            let outline: [[Double]]
        }

        let compactRadii: [Double]
        let arcs: [Arc]
        let palettes: [Palette]
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

    @Test func drawsTheSameCornerDotAndLinesAtEverySize() throws {
        #expect(vectors.sizes.map(\.size) == SpaceAvatarSize.allCases.map(\.rawValue))
        for vector in vectors.sizes {
            let size = try #require(SpaceAvatarSize(rawValue: vector.size))
            #expect(size.isCompact == vector.isCompact)
            #expect(size.lineStroke == vector.lineStroke)
            #expect(size.dot?.diameter == vector.dot?.diameter)
            #expect(size.dot?.cutOut == vector.dot?.cutOut)
            #expect(size.dot.map(size.dotCentre) == vector.dot?.centre)
            let outline = SpaceAvatarRecipe.outline(centre: size.points / 2, half: size.points / 2)
            #expect(outline.count == vector.outline.count)
            for (point, expected) in zip(outline, vector.outline) {
                #expect(abs(point.x - expected[0]) <= Self.pathRounding, "\(vector.size)")
                #expect(abs(point.y - expected[1]) <= Self.pathRounding, "\(vector.size)")
            }
        }
    }
}
