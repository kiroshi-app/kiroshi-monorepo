import XCTest

@MainActor
final class NewConversationTests: XCTestCase {
    override func setUp() async throws {
        continueAfterFailure = true
    }

    func openThePicker() -> XCUIApplication {
        let app = launch("2.1")
        let plus = app.navigationBars["Studio"].buttons["New Conversation"]
        XCTAssertTrue(plus.waitForExistence(timeout: 10))
        let isEnabled = expectation(
            for: NSPredicate(format: "isEnabled == true"), evaluatedWith: plus)
        wait(for: [isEnabled], timeout: 10)
        plus.tap()
        XCTAssertTrue(app.navigationBars["New Conversation"].waitForExistence(timeout: 5))
        return app
    }

    func testThePlusStartsAGroupConversationWithThePickedCompanions() {
        let app = openThePicker()
        let create = app.buttons["Create"]
        XCTAssertFalse(create.isEnabled)

        let juniper = app.buttons["Juniper"]
        juniper.tap()
        app.buttons["Pico"].tap()
        XCTAssertTrue(juniper.isSelected)
        XCTAssertFalse(app.buttons["Atlas"].isSelected)
        XCTAssertTrue(create.isEnabled)
        create.tap()

        XCTAssertTrue(app.navigationBars["Juniper, Pico"].waitForExistence(timeout: 10))
        XCTAssertTrue(
            app.staticTexts["Nothing here yet. Your first message starts the conversation."]
                .waitForExistence(timeout: 10))
        app.navigationBars["Juniper, Pico"].buttons.firstMatch.tap()
        XCTAssertTrue(
            app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Juniper, Pico'"))
                .firstMatch.waitForExistence(timeout: 10))
    }

    func testThePickerPassesTheAuditAndCancelClosesItWithoutCreatingAnything() throws {
        let app = openThePicker()
        app.buttons["Mira"].tap()

        try audit(app)

        app.buttons["Cancel"].tap()

        XCTAssertTrue(app.navigationBars["New Conversation"].waitForNonExistence(timeout: 5))
        XCTAssertEqual(
            app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Mira'")).count, 1)
    }
}
