import XCTest

@MainActor
final class PagingTests: XCTestCase {
    override func setUp() async throws {
        continueAfterFailure = false
    }

    func containing(_ text: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", text))
            .firstMatch
    }

    func swipe(
        _ list: XCUIElement, until element: XCUIElement, _ gesture: (XCUIElement) -> Void
    ) {
        for _ in 0..<8 where !(element.exists && element.isHittable) {
            gesture(list)
        }
        XCTAssertTrue(element.isHittable)
    }

    func testEachListAndAThreadReadTheirNextPageWhereThePersonScrolls() {
        let app = launch("conversations", "-paged", "YES")
        let juniper = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Juniper'"))
            .firstMatch
        XCTAssertTrue(juniper.waitForExistence(timeout: 10))

        juniper.tap()
        XCTAssertTrue(composer(in: app).waitForExistence(timeout: 5))
        swipe(
            app.scrollViews.firstMatch, until: containing("Earlier note 1.", in: app),
            { $0.swipeDown(velocity: .fast) })
        XCTAssertFalse(app.descendants(matching: .any)["Loading earlier messages"].exists)
        app.navigationBars.buttons.firstMatch.tap()

        let conversations = app.collectionViews.firstMatch
        XCTAssertTrue(conversations.waitForExistence(timeout: 5))
        swipe(conversations, until: containing("Topic 7", in: app), { $0.swipeUp(velocity: .fast) })
        XCTAssertFalse(app.descendants(matching: .any)["Loading more conversations"].exists)

        app.tabBars.buttons["Missions"].tap()
        let missions = app.collectionViews.firstMatch
        XCTAssertTrue(containing("OPE-212", in: app).waitForExistence(timeout: 5))
        swipe(missions, until: containing("OPE-305", in: app), { $0.swipeUp(velocity: .fast) })
        XCTAssertFalse(app.descendants(matching: .any)["Loading more missions"].exists)
    }
}
