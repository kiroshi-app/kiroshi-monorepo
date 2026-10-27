import Foundation
import SwiftUI
import Testing

@testable import Kiroshi

@MainActor
struct CompanionAvatarTests {
    static let fixture = URL(filePath: #filePath)
        .deletingLastPathComponent()
        .appending(path: "../../../packages/ui/src/components/companion-avatar.fixture.jsonl")
        .standardizedFileURL
    static let engineDrift = 1e-12

    func engine() throws -> CompanionAvatarEngine {
        try CompanionAvatarEngine(bundle: Bundle(for: CompanionAvatarEngine.self))
    }

    @Test func drawsEveryFixtureCaseTheWayTheDesktopDoes() throws {
        let engine = try engine()
        let lines = try String(contentsOf: Self.fixture, encoding: .utf8)
            .split(separator: "\n")
        var passed = 0
        for line in lines {
            let entry = try #require(
                JSONSerialization.jsonObject(with: Data(line.utf8)) as? [String: Any])
            let input = try #require(entry["input"] as? [String: Any])
            let drawn = try JSONSerialization.jsonObject(with: Data(engine.json(input).utf8))
            if Self.matches(drawn, try #require(entry["output"]), drift: 0) {
                passed += 1
            } else {
                Issue.record("Differs from the fixture: \(input)")
            }
        }
        print("companion-avatar fixture: \(passed)/\(lines.count) cases passed")
        #expect(lines.count == 80)
        #expect(passed == lines.count)
    }

    @Test func throwsWhenTheScriptThrows() throws {
        #expect(throws: CompanionAvatarError.script("Error: broken")) {
            try CompanionAvatarEngine(script: "throw new Error('broken')")
        }
        let engine = try engine()
        #expect {
            try engine.json(["name": "Lyra", "tint": "teal", "state": "idle", "time": 0])
        } throws: { error in
            if case CompanionAvatarError.script = error { return true }
            return false
        }
    }

    @Test func cachesTheIdleDrawingAndTimesAWorkingFrame() throws {
        let engine = try engine()
        let clock = ContinuousClock()
        let firstIdle = try clock.measure {
            _ = try engine.drawing(
                name: "Lyra", tint: .blue, pose: .idle, time: 0, theme: .light)
        }
        let cachedIdle = try clock.measure {
            _ = try engine.drawing(
                name: "Lyra", tint: .blue, pose: .idle, time: 0, theme: .light)
        }
        let frames = 120
        let working = try clock.measure {
            for frame in 0..<frames {
                _ = try engine.drawing(
                    name: "Lyra", tint: .blue, pose: .working, time: Double(frame) * 33,
                    theme: .light)
            }
        }
        print(
            "companion-avatar timings: first idle \(firstIdle), cached idle \(cachedIdle), working frame \(working / frames)"
        )
        #expect(cachedIdle < firstIdle)
        #expect(working / frames < .milliseconds(8))
    }

    @Test func readsTheRoundedHexagonOutline() throws {
        let outline =
            "M 393.14 171.16 A 58.68 58.68 0 0 1 393.14 229.84 L 322.23 352.66 A 58.68 58.68 0 0 1 271.41 382.00 L 129.59 382.00 A 58.68 58.68 0 0 1 78.77 352.66 L 7.86 229.84 A 58.68 58.68 0 0 1 7.86 171.16 L 78.77 48.34 A 58.68 58.68 0 0 1 129.59 19.00 L 271.41 19.00 A 58.68 58.68 0 0 1 322.23 48.34 Z"
        let bounds = try #require(Path(svgOutline: outline)).boundingRect

        #expect(abs(bounds.minX) < 0.01)
        #expect(abs(bounds.maxX - 401) < 0.01)
        #expect(abs(bounds.minY - 19) < 0.01)
        #expect(abs(bounds.maxY - 382) < 0.01)
        #expect(Path(svgOutline: "M 0 0 Q 1 1 2 2") == nil)
    }

    @Test func decodesTheCompanionLookAndToleratesWhatIsMissing() throws {
        let bots = #"""
            [{"id":"a","name":"Atlas","avatarBlot":"blue","avatarImagePath":"/pictures/atlas.png"},
             {"id":"b","name":"Pico","avatarBlot":"teal","avatarImagePath":null},
             {"id":"c","name":"Otto"},
             {"id":"d","name":"Juno","avatarBlot":17}]
            """#
        let companions = try JSONDecoder().decode([Companion].self, from: Data(bots.utf8))

        #expect(companions.map(\.tint) == [.blue, nil, nil, Hue(degrees: 17)])
        #expect(companions.map(\.pictureFile) == ["atlas.png", nil, nil, nil])
    }

    @Test(arguments: [CompanionTheme.light, .dark])
    func drawsTheCompanionInItsHue(_ theme: CompanionTheme) throws {
        let engine = try engine()
        let hue = try #require(Hue(degrees: 200))
        let drawn = try engine.json(name: "Lyra", tint: hue, pose: .idle, time: 0, theme: theme)
        let desktop = try engine.json([
            "name": "Lyra", "hue": 200, "state": "idle", "time": 0, "theme": theme.rawValue,
        ])
        let untinted = try engine.json(
            name: "Lyra", tint: nil, pose: .idle, time: 0, theme: theme)

        #expect(drawn == desktop)
        #expect(drawn != untinted)
    }

    @Test(arguments: [ColorScheme.light, .dark])
    func rendersTheAvatarInTheThemeColours(_ scheme: ColorScheme) throws {
        let companion = Companion(id: "lyra", name: "Lyra", tint: .blue)
        let drawing = try engine().drawing(
            name: "Lyra", tint: .blue, pose: .idle, time: 0,
            theme: scheme == .dark ? .dark : .light)
        let renderer = ImageRenderer(
            content: CompanionAvatar(companion, size: .hero).environment(\.colorScheme, scheme))
        let image = try #require(Self.rasterisedOnTheCPU(renderer))
        let pixels = try RenderedPixels(image)
        let png = URL.temporaryDirectory.appending(path: "companion-avatar-\(scheme).png")
        try UIImage(cgImage: image).pngData()?.write(to: png)
        print("companion-avatar rendered: \(png.path)")

        #expect(image.width == 88)
        #expect(pixels.alpha(x: 0, y: 0) == 0)
        #expect(pixels.count(near: drawing.groundColour) > 200)
        #expect(pixels.count(near: drawing.cellColour) > 50)
    }

    static func rasterisedOnTheCPU(_ renderer: ImageRenderer<some View>) -> CGImage? {
        var image: CGImage?
        renderer.render(rasterizationScale: 1) { size, draw in
            guard
                let space = CGColorSpace(name: CGColorSpace.sRGB),
                let context = CGContext(
                    data: nil, width: Int(size.width), height: Int(size.height),
                    bitsPerComponent: 8, bytesPerRow: 0, space: space,
                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
            else { return }
            draw(context)
            image = context.makeImage()
        }
        return image
    }

    static func matches(_ drawn: Any, _ recorded: Any, drift: Double) -> Bool {
        switch (drawn, recorded) {
        case (let drawn as [String: Any], let recorded as [String: Any]):
            return drawn.count == recorded.count
                && recorded.allSatisfy { key, value in
                    drawn[key].map {
                        matches($0, value, drift: key == "cellCorners" ? engineDrift : drift)
                    } ?? false
                }
        case (let drawn as [Any], let recorded as [Any]):
            return drawn.count == recorded.count
                && zip(drawn, recorded).allSatisfy { matches($0, $1, drift: drift) }
        case (let drawn as String, let recorded as String):
            return drawn == recorded
        case (let drawn as NSNumber, let recorded as NSNumber):
            return abs(drawn.doubleValue - recorded.doubleValue) <= drift
        case (is NSNull, is NSNull):
            return true
        default:
            return false
        }
    }
}

private struct RenderedPixels {
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

    func alpha(x: Int, y: Int) -> UInt8 {
        bytes[(y * width + x) * 4 + 3]
    }

    func count(near colour: CompanionDrawing.Channels) -> Int {
        let target = [colour.red, colour.green, colour.blue].map { Int(($0 * 255).rounded()) }
        return stride(from: 0, to: bytes.count, by: 4).filter { offset in
            bytes[offset + 3] == 255
                && (0..<3).allSatisfy { abs(Int(bytes[offset + $0]) - target[$0]) <= 2 }
        }.count
    }
}
