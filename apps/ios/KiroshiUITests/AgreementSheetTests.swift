import XCTest

@MainActor
final class AgreementSheetTests: XCTestCase {
    static let title = "Where your messages go"

    override func setUp() async throws {
        continueAfterFailure = true
    }

    func sheetTitle(_ app: XCUIApplication) -> XCUIElement {
        app.staticTexts[Self.title]
    }

    func becomesHittable(_ element: XCUIElement) -> Bool {
        let hittable = expectation(
            for: NSPredicate(format: "isHittable == true"), evaluatedWith: element)
        return XCTWaiter().wait(for: [hittable], timeout: 10) == .completed
    }

    func testTheSheetPassesTheAuditAndIAgreeOpensTheSpace() throws {
        let app = launch("agreement")
        XCTAssertTrue(sheetTitle(app).waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Nothing is sent until you agree."].exists)
        XCTAssertTrue(app.links["Privacy Policy"].exists)
        try audit(app)

        app.buttons["I agree"].tap()

        XCTAssertTrue(app.tabBars.buttons["Conversations"].waitForExistence(timeout: 10))
        XCTAssertFalse(sheetTitle(app).exists)
    }

    func testNotNowSignsOutToWelcome() {
        let app = launch("agreement")
        XCTAssertTrue(sheetTitle(app).waitForExistence(timeout: 10))

        app.buttons["Not now"].tap()

        XCTAssertTrue(sheetTitle(app).waitForNonExistence(timeout: 10))
        XCTAssertTrue(app.buttons["Sign in with Apple"].waitForExistence(timeout: 10))
        XCTAssertTrue(becomesHittable(app.textFields["Email"]))
    }

    func testTheSheetAtTheLargestTextKeepsBothActionsAndPassesTheAudit() throws {
        let app = launch(
            "agreement", "-UIPreferredContentSizeCategoryName",
            "UICTContentSizeCategoryAccessibilityXXXL")
        XCTAssertTrue(sheetTitle(app).waitForExistence(timeout: 10))
        XCTAssertTrue(becomesHittable(app.buttons["Not now"]))
        XCTAssertTrue(app.buttons["I agree"].isHittable)
        add(XCTAttachment(screenshot: app.screenshot()))

        try audit(app)
    }
}
