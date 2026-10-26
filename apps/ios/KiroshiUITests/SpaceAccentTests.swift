import XCTest

@MainActor
final class SpaceAccentTests: XCTestCase {
    let yourMessage = "Can you draft the release notes for 0.42?"

    override func setUp() async throws {
        continueAfterFailure = true
        XCUIDevice.shared.appearance = .light
    }

    override func tearDown() async throws {
        XCUIDevice.shared.appearance = .light
    }

    func testYourBubbleInTheSpacesColourPassesTheAuditAtTheLargestSize() throws {
        let app = launch(
            "3.1", "-spaceColours", "yellow", "-UIPreferredContentSizeCategoryName",
            "UICTContentSizeCategoryAccessibilityXXXL")
        let bubble = app.staticTexts[yourMessage].firstMatch
        XCTAssertTrue(bubble.waitForExistence(timeout: 10))
        for _ in 0..<5 where !isOnScreen(bubble, in: app) {
            app.scrollViews.firstMatch.swipeDown()
        }
        XCTAssertTrue(isOnScreen(bubble, in: app))

        try auditYourBubble(app, named: "light")
        XCUIDevice.shared.appearance = .dark
        try auditYourBubble(app, named: "dark")
    }

    func testSwitchingSpaceRepaintsYourBubbleInTheNewSpacesColour() throws {
        let yourAsk = "Can you two get 0.42 out today?"
        let app = launch("shared-thread", "-spaceColours", "purple,green")
        XCTAssertTrue(app.staticTexts[yourAsk].firstMatch.waitForExistence(timeout: 10))
        let green = try colour(behind: yourAsk, in: app)
        app.navigationBars.buttons["BackButton"].tap()
        app.navigationBars.buttons["Space"].tap()
        let studio = button("Studio", in: app)
        XCTAssertTrue(studio.waitForExistence(timeout: 5))
        studio.tap()
        let releaseCrew = button("Release crew", in: app)
        XCTAssertTrue(releaseCrew.waitForExistence(timeout: 15))
        releaseCrew.tap()
        XCTAssertTrue(app.staticTexts[yourAsk].firstMatch.waitForExistence(timeout: 10))

        let purple = try colour(behind: yourAsk, in: app)

        assert(green, is: [0xAF, 0xC9, 0x9B])
        assert(purple, is: [0xBC, 0xAF, 0xE3])
    }

    func button(_ name: String, in app: XCUIApplication) -> XCUIElement {
        app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", name)).firstMatch
    }

    func shownArea(in app: XCUIApplication) -> CGRect {
        let titleBottom = titleBottom(in: app)
        return CGRect(
            x: 0, y: titleBottom, width: app.frame.width,
            height: composer(in: app).frame.minY - titleBottom)
    }

    func isOnScreen(_ element: XCUIElement, in app: XCUIApplication) -> Bool {
        shownArea(in: app).contains(element.frame)
    }

    func auditYourBubble(_ app: XCUIApplication, named name: String) throws {
        let screenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        screenshot.name = "Your bubble in yellow at the largest size, \(name)"
        screenshot.lifetime = .keepAlways
        add(screenshot)
        let titleBottom = titleBottom(in: app)
        let onScreen = shownArea(in: app)
        try audit(app) { issue in
            guard let element = issue.element else { return issue.auditType == .textClipped }
            let isShown = onScreen.contains(element.frame)
            return switch issue.auditType {
            case .contrast: element.frame.minY < titleBottom || !isShown
            case .textClipped, .dynamicType: !isShown
            default: false
            }
        }
    }

    func colour(behind text: String, in app: XCUIApplication) throws -> [Int] {
        let frames = app.staticTexts.matching(identifier: text).allElementsBoundByIndex.map(\.frame)
        let frame = try XCTUnwrap(frames.min { $0.width < $1.width })
        let image = try XCTUnwrap(XCUIScreen.main.screenshot().image.cgImage)
        let scale = CGFloat(image.width) / app.frame.width
        let pixel = try XCTUnwrap(
            image.cropping(
                to: CGRect(x: (frame.minX - 6) * scale, y: frame.midY * scale, width: 1, height: 1))
        )
        let srgb = try XCTUnwrap(CGColorSpace(name: CGColorSpace.sRGB))
        var rgba = [UInt8](repeating: 0, count: 4)
        let context = try XCTUnwrap(
            CGContext(
                data: &rgba, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4,
                space: srgb,
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        context.draw(pixel, in: CGRect(x: 0, y: 0, width: 1, height: 1))
        return rgba.prefix(3).map(Int.init)
    }

    func assert(
        _ colour: [Int], is expected: [Int], file: StaticString = #filePath, line: UInt = #line
    ) {
        let isClose = zip(colour, expected).allSatisfy { abs($0 - $1) <= 6 }
        XCTAssertTrue(isClose, "\(colour) isn't \(expected)", file: file, line: line)
    }
}
