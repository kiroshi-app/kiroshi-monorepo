import XCTest

@MainActor
final class PinnedStripTests: XCTestCase {
    override func setUp() async throws {
        continueAfterFailure = true
    }

    func buttons(in app: XCUIApplication) -> [(label: String, frame: CGRect)] {
        guard let root = try? app.snapshot() else { return [] }
        var found: [(label: String, frame: CGRect)] = []
        var pending = [root]
        while let node = pending.popLast() {
            if node.elementType == .button {
                found.append((node.label, node.frame))
            }
            pending += node.children
        }
        return found
    }

    func strip(in app: XCUIApplication) -> [String] {
        buttons(in: app).filter { $0.label.hasSuffix(", pinned") }
            .sorted { $0.frame.minX < $1.frame.minX }.map(\.label)
    }

    func rows(in app: XCUIApplication) -> [String] {
        let names = ["Juniper", "Release 0.42", "Otto", "Atlas", "Pico", "Mira"]
        return buttons(in: app).filter { !$0.label.hasSuffix(", pinned") }
            .sorted { $0.frame.minY < $1.frame.minY }
            .compactMap { button in names.first { button.label.hasPrefix("\($0),") } }
    }

    func auditThePinnedList(_ app: XCUIApplication) throws {
        let chips = buttons(in: app).filter { $0.label.hasSuffix(", pinned") }.map(\.frame)
        try audit(app) { issue in
            switch issue.auditType {
            case .textClipped:
                issue.element.map {
                    let frame = $0.frame
                    return ConversationsAccessibilityTests.truncatedPreviews.contains($0.label)
                        || chips.contains { $0.intersects(frame) }
                } ?? true
            case .contrast:
                issue.element.map { $0.frame.intersects(app.tabBars.firstMatch.frame) } ?? false
            case .dynamicType:
                issue.element.map { app.navigationBars.firstMatch.frame.contains($0.frame) }
                    ?? false
            default: false
            }
        }
    }

    func testTheStripHoldsThePinnedConversationsInTheHostOrderAndUnpinReturnsOneToTheList()
        throws
    {
        let app = launch("pinned")
        XCTAssertTrue(app.buttons["Otto, pinned"].waitForExistence(timeout: 10))
        XCTAssertEqual(
            strip(in: app), ["Juniper, pinned", "Release 0.42, pinned", "Otto, pinned"])
        XCTAssertEqual(rows(in: app), ["Atlas", "Pico", "Mira"])

        try auditThePinnedList(app)

        app.buttons["Release 0.42, pinned"].tap()
        let release = app.navigationBars["Release 0.42"]
        XCTAssertTrue(release.waitForExistence(timeout: 10))
        release.buttons.firstMatch.tap()

        XCTAssertTrue(app.buttons["Otto, pinned"].waitForExistence(timeout: 10))
        app.buttons["Otto, pinned"].press(forDuration: 1.2)
        let unpin = app.buttons["Unpin"]
        XCTAssertTrue(unpin.waitForExistence(timeout: 5))
        unpin.tap()

        XCTAssertTrue(app.buttons["Otto, pinned"].waitForNonExistence(timeout: 10))
        XCTAssertEqual(strip(in: app), ["Juniper, pinned", "Release 0.42, pinned"])
        XCTAssertEqual(rows(in: app), ["Atlas", "Pico", "Mira", "Otto"])
    }

    func testTheSwipedRowShowsPinWithItsSymbolOnAColouredDisc() throws {
        let app = launch("pinned")
        let atlas = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Atlas, '"))
            .firstMatch
        XCTAssertTrue(atlas.waitForExistence(timeout: 10))

        atlas.swipeRight()
        let pin = app.buttons["Pin"]
        XCTAssertTrue(pin.waitForExistence(timeout: 5))
        XCTAssertEqual(pin.identifier, "pin")

        let disc = try SwipeActionDisc(pin.screenshot())
        XCTAssertGreaterThan(disc.fillSaturation, 0.5)
        XCTAssertGreaterThan(disc.glyphDistance, 0.3)

        try auditThePinnedList(app)
    }

    func testSwipingARowAndTappingPinPinsItOnceAtTheEndOfTheStrip() {
        let app = launch("pinned")
        let atlas = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Atlas, '"))
            .firstMatch
        XCTAssertTrue(atlas.waitForExistence(timeout: 10))

        atlas.swipeRight()
        let pin = app.buttons["Pin"]
        XCTAssertTrue(pin.waitForExistence(timeout: 5))
        pin.tap()

        XCTAssertTrue(app.buttons["Atlas, pinned"].waitForExistence(timeout: 10))
        XCTAssertEqual(
            strip(in: app),
            ["Juniper, pinned", "Release 0.42, pinned", "Otto, pinned", "Atlas, pinned"])
        XCTAssertEqual(rows(in: app), ["Pico", "Mira"])
        XCTAssertFalse(app.alerts["Couldn’t pin Atlas."].waitForExistence(timeout: 2))
    }
}

struct SwipeActionDisc {
    let fillSaturation: Double
    let glyphDistance: Double

    init(_ screenshot: XCUIScreenshot) throws {
        let image = try XCTUnwrap(screenshot.image.cgImage)
        let width = image.width
        let height = image.height
        var bytes = [UInt8](repeating: 0, count: width * height * 4)
        let context = try XCTUnwrap(
            CGContext(
                data: &bytes, width: width, height: height, bitsPerComponent: 8,
                bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue))
        context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        let colour = { (x: Int, y: Int) -> SIMD3<Double> in
            let offset = (y * width + x) * 4
            return SIMD3(
                Double(bytes[offset]), Double(bytes[offset + 1]), Double(bytes[offset + 2]))
                / 255
        }
        let fill = colour(width * 15 / 100, height / 2)
        fillSaturation = fill.max() == 0 ? 0 : (fill.max() - fill.min()) / fill.max()
        let centre = (width * 35 / 100..<width * 65 / 100).flatMap { x in
            (height * 25 / 100..<height * 75 / 100).map { y in colour(x, y) }
        }
        glyphDistance = centre.map { max(($0 - fill).max(), (fill - $0).max()) }.max() ?? 0
    }
}
