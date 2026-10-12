import XCTest

@MainActor
final class HomeTabBarTests: XCTestCase {
    override func setUp() async throws {
        continueAfterFailure = false
    }

    func row(_ name: String, in app: XCUIApplication) -> XCUIElement {
        app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", name)).firstMatch
    }

    func assertTheTabBarShowsWith(
        _ row: XCUIElement, in app: XCUIApplication,
        file: StaticString = #filePath, line: UInt = #line
    ) {
        let tabs = app.tabBars.firstMatch
        XCTAssertTrue(
            row.isHittable && tabs.buttons["Conversations"].isHittable
                && tabs.buttons["Missions"].isHittable,
            file: file, line: line)
    }

    func openJuniper(in app: XCUIApplication) {
        let juniper = row("Juniper", in: app)
        XCTAssertTrue(juniper.waitForExistence(timeout: 15))
        juniper.tap()
        XCTAssertTrue(composer(in: app).waitForExistence(timeout: 10))
        XCTAssertFalse(app.tabBars.firstMatch.isHittable)
    }

    func testBackFromAConversationShowsTheTabBarWithTheList() {
        let app = launch("2.1")
        openJuniper(in: app)

        app.navigationBars.buttons["BackButton"].tap()

        assertTheTabBarShowsWith(row("Juniper", in: app), in: app)
    }

    func testSwipingBackFromAConversationShowsTheTabBarWithTheList() {
        let app = launch("2.1")
        openJuniper(in: app)

        app.coordinate(withNormalizedOffset: CGVector(dx: 0.01, dy: 0.5)).press(
            forDuration: 0.05,
            thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)),
            withVelocity: .fast, thenHoldForDuration: 0)

        assertTheTabBarShowsWith(row("Juniper", in: app), in: app)
    }

    func testBackFromAMissionShowsTheTabBarWithTheList() {
        let app = launch("5.1")
        app.tabBars.buttons["Missions"].tap()
        let mission = row("Split the onboarding flow", in: app)
        XCTAssertTrue(mission.waitForExistence(timeout: 15))
        mission.tap()
        XCTAssertTrue(composer(in: app).waitForExistence(timeout: 10))
        XCTAssertFalse(app.tabBars.firstMatch.isHittable)

        app.navigationBars.buttons["BackButton"].tap()

        assertTheTabBarShowsWith(mission, in: app)
    }

    func testClosingSettingsShowsTheTabBarWithTheList() {
        let app = launch("2.1")
        XCTAssertTrue(row("Juniper", in: app).waitForExistence(timeout: 15))
        app.navigationBars.buttons["Settings"].tap()
        let close = app.buttons["Close"]
        XCTAssertTrue(close.waitForExistence(timeout: 5))

        close.tap()

        assertTheTabBarShowsWith(row("Juniper", in: app), in: app)
    }

    func testSwitchingSpaceShowsTheTabBarWithTheList() {
        let app = launch("2.1")
        XCTAssertTrue(row("Juniper", in: app).waitForExistence(timeout: 15))
        app.navigationBars.buttons["Space"].tap()
        let homeLab = row("Home lab", in: app)
        XCTAssertTrue(homeLab.waitForExistence(timeout: 5))

        homeLab.tap()

        let juniper = row("Juniper", in: app)
        XCTAssertTrue(juniper.waitForExistence(timeout: 10))
        assertTheTabBarShowsWith(juniper, in: app)
    }

    func testComingBackFromTheBackgroundShowsTheTabBarWithTheList() {
        let app = launch("2.1")
        XCTAssertTrue(row("Juniper", in: app).waitForExistence(timeout: 15))
        XCUIDevice.shared.press(.home)
        XCTAssertTrue(app.wait(for: .runningBackground, timeout: 10))

        app.activate()

        assertTheTabBarShowsWith(row("Juniper", in: app), in: app)
    }
}
