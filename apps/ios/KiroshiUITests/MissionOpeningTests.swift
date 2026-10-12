import XCTest

@MainActor
final class MissionOpeningTests: XCTestCase {
    override func setUp() async throws {
        continueAfterFailure = false
    }

    func question(in app: XCUIApplication) -> XCUIElement {
        app.staticTexts.matching(
            NSPredicate(format: "label BEGINSWITH %@", "Which one goes first?")
        ).firstMatch
    }

    func testALateMissionThreadShowsItsLoadingThenItsThread() {
        let app = launch("slow-mission")
        let loading = app.descendants(matching: .any)["Loading the mission"]
        XCTAssertTrue(question(in: app).waitForExistence(timeout: 15))
        XCTAssertFalse(loading.exists)

        app.navigationBars.buttons.firstMatch.tap()
        let split = app.buttons.matching(
            NSPredicate(format: "label BEGINSWITH 'Split the onboarding flow'")
        ).firstMatch
        XCTAssertTrue(split.waitForExistence(timeout: 10))
        split.tap()

        XCTAssertTrue(loading.waitForExistence(timeout: 10))
        XCTAssertTrue(question(in: app).waitForExistence(timeout: 10))
        XCTAssertTrue(question(in: app).isHittable)
        XCTAssertFalse(loading.exists)
    }
}
