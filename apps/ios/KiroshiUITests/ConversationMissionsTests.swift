import XCTest

@MainActor
final class ConversationMissionsTests: XCTestCase {
    override func setUp() async throws {
        continueAfterFailure = false
    }

    func row(_ label: String, in app: XCUIApplication) -> XCUIElement {
        app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", label)).firstMatch
    }

    func auditTheMissions(_ app: XCUIApplication) throws {
        try audit(app) { issue in
            issue.auditType == .textClipped && issue.element == nil
        }
    }

    func testTheMissionsButtonShowsOnlyThisConversationsMissionsAndBackReturnsToTheThread()
        throws
    {
        let app = launch("2.1")
        let release = row("Release 0.42", in: app)
        XCTAssertTrue(release.waitForExistence(timeout: 15))
        release.tap()
        let missionsButton = app.navigationBars.buttons["Missions"]
        XCTAssertTrue(missionsButton.waitForExistence(timeout: 10))
        XCTAssertTrue(missionsButton.isEnabled)

        missionsButton.tap()

        let dictation = row("Add dictation to the composer", in: app)
        XCTAssertTrue(dictation.waitForExistence(timeout: 10))
        XCTAssertTrue(dictation.label.hasPrefix("Add dictation to the composer, OPE-215"))
        XCTAssertTrue(dictation.label.hasSuffix("Pico · Working now"), dictation.label)
        XCTAssertTrue(row("Retry failed uploads", in: app).exists)
        XCTAssertTrue(row("Settings sheet on iPhone", in: app).exists)
        XCTAssertTrue(app.staticTexts["Working"].exists)
        XCTAssertTrue(app.staticTexts["Review"].exists)
        XCTAssertFalse(row("Draft the 0.42 release notes", in: app).exists)
        XCTAssertFalse(app.staticTexts["Needs you"].exists)
        XCTAssertTrue(app.navigationBars.staticTexts["Missions"].exists)
        XCTAssertTrue(app.navigationBars.staticTexts["Release 0.42"].exists)
        XCTAssertFalse(app.tabBars.firstMatch.isHittable)
        try auditTheMissions(app)

        row("Settings sheet on iPhone", in: app).tap()
        XCTAssertTrue(app.staticTexts["Mission opened by Mira"].waitForExistence(timeout: 10))
        app.navigationBars.buttons["BackButton"].tap()
        XCTAssertTrue(dictation.waitForExistence(timeout: 10))

        app.navigationBars.buttons["BackButton"].tap()

        XCTAssertTrue(missionsButton.waitForExistence(timeout: 10))
        XCTAssertTrue(
            app.staticTexts.matching(
                NSPredicate(
                    format: "label ENDSWITH %@", "All checks passed, the pull request is ready.")
            ).firstMatch.exists)
        XCTAssertFalse(dictation.exists)
    }

    func testAConversationWithoutMissionsSaysWhereTheyComeFromAndPassesTheAudit() throws {
        let app = launch("conversation-no-missions")
        XCTAssertTrue(app.staticTexts["No missions yet"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["Missions opened in this conversation show up here."].exists)
        XCTAssertTrue(app.navigationBars.staticTexts["Atlas"].exists)

        try auditTheMissions(app)

        app.navigationBars.buttons["BackButton"].tap()
        XCTAssertTrue(app.navigationBars.buttons["Missions"].waitForExistence(timeout: 10))
    }
}
