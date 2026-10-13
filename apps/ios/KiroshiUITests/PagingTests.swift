import XCTest

@MainActor
final class PagingTests: XCTestCase {
    override func setUp() async throws {
        continueAfterFailure = false
    }

    func element(_ predicate: String, _ text: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any).matching(NSPredicate(format: predicate, text)).firstMatch
    }

    func scroll(
        _ app: XCUIApplication, until element: XCUIElement, swiping swipe: (XCUIElement) -> Void
    ) {
        let list =
            app.collectionViews.firstMatch.exists
            ? app.collectionViews.firstMatch : app.scrollViews.firstMatch
        for _ in 0..<20 where !(element.exists && element.isHittable) {
            swipe(list)
        }
        XCTAssertTrue(element.waitForExistence(timeout: 10))
        XCTAssertTrue(element.isHittable)
    }

    func testConversationsScrolledToTheEndShowTheRowsOfPageTwo() {
        let app = launch("conversations", "-paged", "YES")
        let first = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Release crew'"))
            .firstMatch
        XCTAssertTrue(first.waitForExistence(timeout: 10))

        scroll(
            app, until: element("label BEGINSWITH %@", "Topic 40", in: app),
            swiping: { $0.swipeUp() })

        XCTAssertFalse(app.descendants(matching: .any)["Loading more conversations"].exists)
    }

    func testMissionsScrolledToTheEndShowTheRowsOfPageTwo() {
        let app = launch("5.1", "-paged", "YES")
        XCTAssertTrue(
            element("label CONTAINS %@", "OPE-212", in: app).waitForExistence(timeout: 10))

        scroll(
            app, until: element("label CONTAINS %@", "OPE-340", in: app),
            swiping: { $0.swipeUp() })

        XCTAssertFalse(app.descendants(matching: .any)["Loading more missions"].exists)
    }

    func drag(_ list: XCUIElement, from start: CGFloat, to end: CGFloat) {
        list.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: start)).press(
            forDuration: 0.05,
            thenDragTo: list.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: end)),
            withVelocity: .slow, thenHoldForDuration: 0.3)
    }

    func testAThreadScrolledToTheTopShowsAnOlderMessageWithoutMovingTheOneOnScreen() {
        let app = launch("3.1", "-paged", "YES")
        XCTAssertTrue(composer(in: app).waitForExistence(timeout: 10))
        let transcript = app.scrollViews.firstMatch
        let loading = app.descendants(matching: .any)["Loading earlier messages"]
        let firstOfThePage = app.staticTexts.matching(identifier: "Earlier note 64.").firstMatch

        for _ in 0..<20 where !(loading.exists && firstOfThePage.exists) {
            drag(transcript, from: 0.3, to: 0.6)
        }
        let readAt = firstOfThePage.frame.minY
        XCTAssertTrue(loading.waitForNonExistence(timeout: 10))

        XCTAssertEqual(firstOfThePage.frame.minY, readAt, accuracy: 44)
        drag(transcript, from: 0.3, to: 0.6)
        XCTAssertTrue(
            element("label CONTAINS %@", "Earlier note 63.", in: app).waitForExistence(timeout: 5))
    }
}
