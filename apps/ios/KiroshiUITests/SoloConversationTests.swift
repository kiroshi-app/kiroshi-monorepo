import XCTest

@MainActor
final class SoloConversationTests: XCTestCase {
    func rows(_ prefix: String, in app: XCUIApplication) -> XCUIElementQuery {
        app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", prefix))
    }

    func testACompanionsOwnConversationIsListedOnceUnderTheCompanionThenOpensItsHeader() {
        let app = launch("2.1")
        let juniper = rows("Juniper,", in: app)
        XCTAssertTrue(juniper.firstMatch.waitForExistence(timeout: 10))

        for (name, role) in [("Juniper", "Writer"), ("Atlas", "Planner"), ("Pico", "Builder")] {
            let row = rows("\(name), \(role)", in: app)
            XCTAssertEqual(row.count, 1, name)
            XCTAssertEqual(row.firstMatch.value as? String ?? "", "", name)
        }
        XCTAssertEqual(
            rows("Release 0.42", in: app).firstMatch.value as? String, "Juniper, Pico, and Mira")
        XCTAssertFalse(rows("Chat", in: app).firstMatch.exists)

        juniper.firstMatch.tap()

        XCTAssertTrue(
            app.navigationBars.staticTexts.matching(
                NSPredicate(format: "label == %@", "Juniper, Writer")
            )
            .firstMatch.waitForExistence(timeout: 10))
    }
}
