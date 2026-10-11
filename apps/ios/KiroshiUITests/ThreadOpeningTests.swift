import XCTest

@MainActor
final class ThreadOpeningTests: XCTestCase {
    override func setUp() async throws {
        continueAfterFailure = false
    }

    func message(_ text: String, in app: XCUIApplication) -> XCUIElement {
        app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", text)).firstMatch
    }

    func assertTheThreadOpensOnItsLastMessage(_ app: XCUIApplication) {
        let loading = app.descendants(matching: .any)["Loading the conversation"]
        XCTAssertTrue(loading.waitForExistence(timeout: 10))
        let last = message("That’s the whole checklist", in: app)
        XCTAssertTrue(last.waitForExistence(timeout: 10))
        XCTAssertTrue(last.isHittable)
        let first = message("Step 1 of the 0.42 checklist", in: app)
        XCTAssertFalse(first.exists && first.isHittable)
        XCTAssertFalse(loading.exists)
    }

    func testALateThreadShowsItsLoadingThenOpensOnItsLastMessageWithoutAScroll() {
        let app = launch("slow-thread")
        assertTheThreadOpensOnItsLastMessage(app)

        app.navigationBars.buttons.firstMatch.tap()
        let juniper = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Juniper'"))
            .firstMatch
        XCTAssertTrue(juniper.waitForExistence(timeout: 10))
        juniper.tap()

        assertTheThreadOpensOnItsLastMessage(app)
    }
}
