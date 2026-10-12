import XCTest

@MainActor
final class ThreadAccessibilityTests: XCTestCase {
    override func setUp() async throws {
        continueAfterFailure = true
    }

    func waitForThePushToEnd(_ app: XCUIApplication) {
        let listRow = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Atlas'"))
            .firstMatch
        XCTAssertTrue(listRow.waitForNonExistence(timeout: 10))
    }

    func testTheThreadPassesTheAudit() throws {
        let app = launch("3.1")
        XCTAssertTrue(
            app.staticTexts["They’re waiting for your read."].waitForExistence(timeout: 10))
        waitForThePushToEnd(app)

        try auditTheThread(app)
    }

    func testTheWorkingThreadPassesTheAudit() throws {
        let app = launch("3.3")
        XCTAssertTrue(app.staticTexts["Juniper is working…"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["Stop"].waitForExistence(timeout: 10))
        waitForThePushToEnd(app)

        try auditTheThread(app)
    }

    func testAnEmptyThreadInvitesTheFirstMessageAndPassesTheAudit() throws {
        let app = launch("3.2")
        XCTAssertTrue(
            app.staticTexts["Nothing here yet. Your first message starts the conversation."]
                .waitForExistence(timeout: 10))
        waitForThePushToEnd(app)

        try auditTheThread(app)
    }

    func testAnOfflineHostKeepsTheThreadAndPassesTheAudit() throws {
        let onScreen = labelsFullyOnScreenAtTheLargestSize(of: "3.4")
        let app = launch("3.4")
        XCTAssertTrue(
            app.staticTexts[
                "Side project is offline. You can write again once sam@example.com’s Mac is back."
            ].waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["They’re waiting for your read."].exists)
        XCTAssertFalse(composer(in: app).isEnabled)

        try auditTheThread(app, onScreenAtTheLargestSize: onScreen)
    }

    func testTheShownTimesPassTheAudit() throws {
        let app = launchInEnglish("3.5")
        XCTAssertTrue(
            app.staticTexts.matching(NSPredicate(format: "label == %@", "9:40\u{202F}AM"))
                .firstMatch.waitForExistence(timeout: 10))
        waitForThePushToEnd(app)

        try auditTheThread(app)
    }

    func testSwipingLeftSlidesTheThreadToShowEachMessagesTime() {
        let app = launchInEnglish("3.1", "-holdsTimes", "YES")
        let waiting = app.staticTexts.matching(
            NSPredicate(
                format: "label == %@ AND value == %@", "They’re waiting for your read.",
                "9:40\u{202F}AM")
        ).firstMatch
        XCTAssertTrue(waiting.waitForExistence(timeout: 10))
        waitForThePushToEnd(app)
        let time = app.staticTexts.matching(
            NSPredicate(format: "label == %@", "9:40\u{202F}AM")
        ).firstMatch
        XCTAssertFalse(time.exists)
        let restingX = waiting.frame.minX

        waiting.swipeLeft()

        XCTAssertTrue(time.waitForExistence(timeout: 5))
        XCTAssertTrue(app.frame.contains(time.frame))
        XCTAssertLessThan(waiting.frame.minX, restingX)
    }

    func testTheThreadStillScrollsUpAtTheLargestSize() {
        let app = launch(
            "3.1", "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"
        )
        let today = app.staticTexts["Today"]
        XCTAssertTrue(
            app.staticTexts["They’re waiting for your read."].waitForExistence(timeout: 10))
        XCTAssertFalse(today.isHittable)

        for _ in 1...3 where !today.isHittable {
            app.scrollViews.firstMatch.swipeDown()
        }

        XCTAssertTrue(today.isHittable)
    }

    func testATurnShowsNoRowForTheAgentsTools() {
        let app = launch("3.1", "-draft", "Draft the notes for 0.43.")
        let toolRows = app.descendants(matching: .any).matching(
            NSPredicate(format: "label BEGINSWITH 'The agent '"))
        XCTAssertTrue(app.buttons["Send"].waitForExistence(timeout: 10))
        waitForThePushToEnd(app)

        app.buttons["Send"].tap()

        XCTAssertTrue(app.staticTexts["Juniper is working…"].waitForExistence(timeout: 10))
        XCTAssertTrue(
            app.staticTexts["Drafted. Three sections: new, fixed, under the hood."]
                .waitForExistence(timeout: 15))
        XCTAssertEqual(toolRows.count, 0)
        XCTAssertTrue(app.buttons["Stop"].waitForNonExistence(timeout: 15))
        XCTAssertEqual(toolRows.count, 0)
    }

    func auditTheThread(
        _ app: XCUIApplication, onScreenAtTheLargestSize: Set<String>? = nil
    ) throws {
        let titleBottom = titleBottom(in: app)
        let transcript = app.scrollViews.firstMatch.frame
        try audit(app) { issue in
            guard let element = issue.element else { return false }
            let isInTheTitle = element.frame.minY < titleBottom
            let isScrolledOffScreenAtTheLargestSize =
                onScreenAtTheLargestSize.map {
                    transcript.contains(element.frame) && !$0.contains(element.label)
                } ?? false
            return switch issue.auditType {
            case .contrast, .textClipped: isInTheTitle
            case .dynamicType: isInTheTitle || isScrolledOffScreenAtTheLargestSize
            default: false
            }
        }
    }
}
