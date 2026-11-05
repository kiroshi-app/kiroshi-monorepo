import XCTest

@MainActor
final class CitedFilesTests: XCTestCase {
    static let chart = "Build times, week 45"
    static let notes = "Release notes 4.2.pdf"

    override func setUp() async throws {
        continueAfterFailure = false
    }

    func testACitedImageShowsBetweenItsSentences() throws {
        let app = launchInEnglish("markdown", "-artboard", "cited")
        let image = app.descendants(matching: .any)[Self.chart]
        XCTAssertTrue(image.waitForExistence(timeout: 10))
        let before = text(containing: "how the build times moved", in: app)
        let after = text(containing: "notes are ready for your review", in: app)

        XCTAssertGreaterThan(image.frame.minY, before.frame.midY)
        XCTAssertLessThan(image.frame.maxY, after.frame.midY)
        XCTAssertTrue(image.isHittable)
        capture("1-cited-image")
        try auditTheThread(app)
    }

    func testACitedFileOpensInQuickLook() {
        let app = launchInEnglish("markdown", "-artboard", "cited")
        let notes = app.buttons[Self.notes]
        XCTAssertTrue(notes.waitForExistence(timeout: 10))

        notes.tap()

        let title = app.staticTexts.matching(identifier: Self.notes)
        XCTAssertTrue(
            app.otherElements["QLPreviewControllerView"].waitForExistence(timeout: 10)
                || title.count > 1)
        XCTAssertTrue(app.staticTexts["Release notes 4.2"].waitForExistence(timeout: 10))
        capture("2-quick-look-pdf")
    }

    func testAnOldBlockShowsItsFilesAndNoBlockText() throws {
        let app = launchInEnglish("markdown", "-artboard", "cited")
        let text = app.staticTexts["Both files from yesterday’s run."]
        XCTAssertTrue(text.waitForExistence(timeout: 10))
        app.scrollViews.firstMatch.swipeUp()

        let block = app.descendants(matching: .any).matching(
            NSPredicate(format: "label CONTAINS 'Attached to this message'"))
        XCTAssertEqual(block.count, 0)
        XCTAssertTrue(app.buttons["PDF file"].exists)
        XCTAssertTrue(app.buttons["PNG file"].exists)
        capture("3-old-block")
    }

    func testAnImageThatFailsSaysSoAndOffersToTryAgain() throws {
        let app = launchInEnglish("markdown", "-artboard", "cited-failed")

        XCTAssertTrue(
            app.buttons["Couldn't load Crash on launch. Tap to try again."]
                .waitForExistence(timeout: 10))
        capture("4-failed-image")
        try auditTheThread(app)
    }

    func testCitedFilesHoldAtTheLargestTextSizeInDark() throws {
        let app = try launch(
            "markdown", in: .dark, "-artboard", "cited", "-AppleLocale", "en_US",
            "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL")
        XCTAssertTrue(app.descendants(matching: .any)[Self.chart].waitForExistence(timeout: 10))

        capture("5-largest-dark")
        try auditTheThread(app)
    }

    private func text(containing part: String, in app: XCUIApplication) -> XCUIElement {
        app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", part)).firstMatch
    }

    private func auditTheThread(_ app: XCUIApplication) throws {
        let top = titleBottom(in: app)
        let bottom = composer(in: app).frame.minY
        try audit(app) { issue in
            guard let element = issue.element else { return issue.auditType == .textClipped }
            let isInTheTitle = element.frame.minY < top
            let isFullyShown = element.frame.minY >= top && element.frame.maxY <= bottom
            return switch issue.auditType {
            case .contrast: isInTheTitle
            case .textClipped, .dynamicType: isInTheTitle || !isFullyShown
            default: false
            }
        }
    }

    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
