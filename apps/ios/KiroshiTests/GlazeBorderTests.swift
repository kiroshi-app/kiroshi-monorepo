import Foundation
import SwiftUI
import Testing

@testable import Kiroshi

@MainActor
struct GlazeBorderTests {
    struct Vectors: Decodable {
        struct Border: Decodable {
            struct Edge: Decodable {
                let colour: String
                let opacity: Double
            }

            let side: Double
            let theme: String
            let isCompact: Bool
            let edgeWidth: Double
            let edge: Edge
            let lipOpacity: Double?
        }

        let compactBelow: Double
        let borders: [Border]
    }

    static let vectors = URL(filePath: #filePath).deletingLastPathComponent()
        .appending(path: "Vectors/glaze-border.json")
    static let drift = 1e-12
    static let inks: [String: GlazeBorder.Ink] = ["#000000": .black, "#ffffff": .white]

    @Test func drawsTheBorderTheDesktopDrawsAtEverySideAndTheme() throws {
        let vectors = try JSONDecoder().decode(
            Vectors.self, from: Data(contentsOf: Self.vectors))
        #expect(vectors.compactBelow == GlazeBorder.compactBelow)
        #expect(vectors.borders.count == 26)
        for vector in vectors.borders {
            let border = GlazeBorder(
                side: vector.side, colorScheme: vector.theme == "dark" ? .dark : .light)
            #expect(border.isCompact == vector.isCompact, "\(vector.side) \(vector.theme)")
            #expect(abs(border.edgeWidth - vector.edgeWidth) <= Self.drift)
            #expect(border.edge.ink == Self.inks[vector.edge.colour])
            #expect(border.edge.opacity == vector.edge.opacity)
            #expect(border.lipOpacity == vector.lipOpacity)
        }
    }

    @Test(arguments: [ColorScheme.light, .dark])
    func liftsTheTopEdgeOfTheConversationIcon(_ scheme: ColorScheme) throws {
        let cell = ConversationIconCell(icon: .messageSquare, color: nil, size: .hero)
            .environment(\.colorScheme, scheme)
        let image = try #require(
            CompanionAvatarTests.rasterisedOnTheCPU(ImageRenderer(content: cell)))
        let png = URL.temporaryDirectory.appending(path: "glaze-border-icon-\(scheme).png")
        try UIImage(cgImage: image).pngData()?.write(to: png)
        print("glaze-border rendered: \(png.path)")
        let pixels = try Luminance(image)

        #expect(image.width == 88)
        let lip = pixels.at(x: 44, y: 5)
        let bottomEdge = pixels.at(x: 44, y: 82)
        let face = pixels.at(x: 44, y: 75)
        #expect(lip > bottomEdge + 10)
        if scheme == .dark {
            #expect(bottomEdge > face)
        } else {
            #expect(bottomEdge < face)
        }
    }
}

private struct Luminance {
    let width: Int
    let bytes: [UInt8]

    init(_ image: CGImage) throws {
        width = image.width
        var bytes = [UInt8](repeating: 0, count: image.width * image.height * 4)
        let space = try #require(CGColorSpace(name: CGColorSpace.sRGB))
        let drawn = bytes.withUnsafeMutableBytes { buffer in
            guard
                let context = CGContext(
                    data: buffer.baseAddress, width: image.width, height: image.height,
                    bitsPerComponent: 8, bytesPerRow: image.width * 4, space: space,
                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
            else { return false }
            context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
            return true
        }
        try #require(drawn)
        self.bytes = bytes
    }

    func at(x: Int, y: Int) -> Int {
        let offset = (y * width + x) * 4
        return (0..<3).map { Int(bytes[offset + $0]) }.reduce(0, +) / 3
    }
}
