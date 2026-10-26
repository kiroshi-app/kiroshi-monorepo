import XCTest

enum Appearance: String {
    case light, dark
}

extension XCTestCase {
    @MainActor func launch(
        _ fixture: String, in appearance: Appearance, _ arguments: String...,
        file: StaticString = #filePath, line: UInt = #line
    ) throws -> XCUIApplication {
        let app = launch(fixture, arguments: ["-appearance", appearance.rawValue] + arguments)
        try assertShown(appearance, file: file, line: line)
        return app
    }

    @MainActor func assertShown(
        _ appearance: Appearance, file: StaticString = #filePath, line: UInt = #line
    ) throws {
        let deadline = Date.now.addingTimeInterval(5)
        var luminance = try medianLuminanceOnScreen()
        while Self.appearance(ofLuminance: luminance) != appearance, Date.now < deadline {
            _ = XCTWaiter.wait(for: [XCTestExpectation()], timeout: 0.5)
            luminance = try medianLuminanceOnScreen()
        }
        let shown = Self.appearance(ofLuminance: luminance)
        guard shown != appearance else { return }
        let screenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        screenshot.name = "Asked for \(appearance), shown \(shown)"
        screenshot.lifetime = .keepAlways
        add(screenshot)
        XCTFail(
            "The screen is \(shown) (median luminance \(Int(luminance))), not \(appearance)",
            file: file, line: line)
    }

    static func appearance(ofLuminance luminance: Double) -> Appearance {
        luminance < 128 ? .dark : .light
    }

    @MainActor func medianLuminanceOnScreen() throws -> Double {
        let image = try XCTUnwrap(XCUIScreen.main.screenshot().image.cgImage)
        let (width, height) = (40, 87)
        var rgba = [UInt8](repeating: 0, count: width * height * 4)
        let context = try XCTUnwrap(
            CGContext(
                data: &rgba, width: width, height: height, bitsPerComponent: 8,
                bytesPerRow: width * 4, space: try XCTUnwrap(CGColorSpace(name: CGColorSpace.sRGB)),
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        let luminances = stride(from: 0, to: rgba.count, by: 4).map { pixel in
            let (red, green, blue) = (rgba[pixel], rgba[pixel + 1], rgba[pixel + 2])
            return 0.2126 * Double(red) + 0.7152 * Double(green) + 0.0722 * Double(blue)
        }.sorted()
        return luminances[luminances.count / 2]
    }
}
