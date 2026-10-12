import XCTest

@MainActor
final class ThreadOpeningTests: XCTestCase {
    override func setUp() async throws {
        continueAfterFailure = false
    }

    func message(_ text: String, in app: XCUIApplication) -> XCUIElement {
        app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", text)).firstMatch
    }

    func assertTheThreadOpensOnItsLastMessage(_ app: XCUIApplication) {
        let loading = app.descendants(matching: .any)["Loading the conversation"]
        XCTAssertTrue(loading.waitForExistence(timeout: 10))
        assertNoDaySeparatorWhile(loading, in: app)
        let last = message("That’s the whole checklist", in: app)
        XCTAssertTrue(last.waitForExistence(timeout: 10))
        XCTAssertTrue(last.isHittable)
        let first = message("Step 1 of the 0.42 checklist", in: app)
        XCTAssertFalse(first.exists && first.isHittable)
        XCTAssertFalse(loading.exists)
    }

    func reopen(_ name: String, in app: XCUIApplication) {
        app.navigationBars.buttons.firstMatch.tap()
        let row = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", name))
            .firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 10))
        row.tap()
    }

    func testALateThreadShowsItsLoadingThenOpensOnItsLastMessageWithoutAScroll() {
        let app = launch("slow-thread")
        assertTheThreadOpensOnItsLastMessage(app)

        reopen("Juniper", in: app)

        assertTheThreadOpensOnItsLastMessage(app)
    }

    func testALateGroupThreadShowsItsLoadingThenOpensOnItsLastMessageWithoutAScroll() {
        let app = launch("slow-group")
        XCTAssertTrue(message("That’s the whole checklist", in: app).waitForExistence(timeout: 15))

        reopen("Release crew", in: app)

        assertTheThreadOpensOnItsLastMessage(app)
    }
}
