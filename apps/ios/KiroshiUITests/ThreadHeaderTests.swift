import XCTest

@MainActor
final class ThreadHeaderTests: XCTestCase {
    func header(_ label: String, in app: XCUIApplication) -> XCUIElement {
        app.navigationBars.staticTexts[label]
    }

    func open(_ name: String, in app: XCUIApplication) {
        let row = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", name))
            .firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 15))
        row.tap()
    }

    func testAConversationHeaderShowsTheCompanionsNameThenItsTitle() {
        let app = launch("conversations")

        open("Juniper", in: app)

        XCTAssertTrue(header("Juniper, Writer", in: app).waitForExistence(timeout: 10))
        app.navigationBars.buttons["BackButton"].tap()
        open("Shoto", in: app)
        XCTAssertTrue(header("Shoto", in: app).waitForExistence(timeout: 10))
        XCTAssertFalse(
            app.navigationBars.staticTexts.matching(
                NSPredicate(format: "label BEGINSWITH 'Shoto,'")
            )
            .firstMatch.exists)
    }

    func testAMissionHeaderShowsTheTicketCompanionAndTitleOverTheMission() {
        let app = launch("5.1")
        app.tabBars.buttons["Missions"].tap()

        open("Split the onboarding flow", in: app)

        XCTAssertTrue(
            header("OPE-212 · Atlas · Planner, Split the onboarding flow", in: app)
                .waitForExistence(timeout: 10))
    }
}
