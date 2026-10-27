import XCTest

@MainActor
final class SpaceHeaderTests: XCTestCase {
    override func setUp() async throws {
        continueAfterFailure = false
    }

    func header(in app: XCUIApplication) -> (settings: XCUIElement, space: XCUIElement) {
        let bar = app.navigationBars["Studio"]
        return (bar.buttons["Settings"], bar.buttons["Space"])
    }

    func testBothTabsShowTheSameHeaderAndItsSpaceButtonOpensTheMenuOfSpaces() {
        let app = launch("2.1")
        let conversations = header(in: app)
        XCTAssertTrue(conversations.space.waitForExistence(timeout: 10))
        XCTAssertTrue(conversations.settings.exists)
        XCTAssertEqual(
            XCTWaiter().wait(
                for: [
                    expectation(
                        for: NSPredicate(format: "value == 'Studio, Shared'"),
                        evaluatedWith: conversations.space)
                ], timeout: 10),
            .completed)
        let settingsFrame = conversations.settings.frame
        let spaceFrame = conversations.space.frame

        app.tabBars.buttons["Missions"].tap()

        let missions = header(in: app)
        XCTAssertTrue(missions.space.waitForExistence(timeout: 10))
        XCTAssertTrue(missions.settings.exists)
        XCTAssertEqual(missions.space.value as? String, "Studio, Shared")
        XCTAssertEqual(missions.settings.frame, settingsFrame)
        XCTAssertEqual(missions.space.frame, spaceFrame)

        missions.space.tap()

        XCTAssertTrue(app.buttons["Side project, Not connected"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Home lab, Online"].exists)
        XCTAssertTrue(app.buttons["Studio, Shared"].exists)
    }
}
