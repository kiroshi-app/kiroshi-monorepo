import XCTest

@MainActor
final class SettingsAccessibilityTests: XCTestCase {
    static let footer = "Your spaces stop working on this iPhone until you sign in again."
    static let alertMessage =
        "Studio, Home lab and Side project leave this iPhone until you sign in again."

    override func setUp() async throws {
        continueAfterFailure = false
    }

    func signOutRow(_ app: XCUIApplication) -> XCUIElement {
        app.collectionViews.buttons["Sign out"]
    }

    func testTheSettingsButtonOpensTheSheetAndCloseDismissesIt() {
        let app = launch("2.1")
        let settings = app.buttons["Settings"]
        XCTAssertTrue(settings.waitForExistence(timeout: 10))

        settings.tap()

        XCTAssertTrue(app.staticTexts[Self.footer].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["sam@example.com"].exists)
        app.buttons["Close"].tap()
        XCTAssertTrue(app.staticTexts[Self.footer].waitForNonExistence(timeout: 5))
        XCTAssertTrue(settings.isHittable)
    }

    func testTheSheetPassesTheAudit() throws {
        let app = launch("6.1")
        XCTAssertTrue(signOutRow(app).waitForExistence(timeout: 10))

        try audit(app)
    }

    func testTheConfirmationPassesTheAudit() throws {
        let app = launch("6.2")
        let alert = app.alerts["Sign out of Kiroshi?"]
        XCTAssertTrue(alert.waitForExistence(timeout: 10))
        XCTAssertTrue(alert.staticTexts[Self.alertMessage].exists)
        let alertFrame = alert.frame

        try audit(app) { issue in
            let isInTheAlert = issue.element.map { alertFrame.contains($0.frame) } ?? true
            return issue.auditType == .dynamicType && isInTheAlert
        }
    }

    func testCancellingKeepsTheSheetOpen() {
        let app = launch("6.1")
        XCTAssertTrue(signOutRow(app).waitForExistence(timeout: 10))

        signOutRow(app).tap()
        let alert = app.alerts["Sign out of Kiroshi?"]
        XCTAssertTrue(alert.waitForExistence(timeout: 5))
        alert.buttons["Cancel"].tap()

        XCTAssertTrue(alert.waitForNonExistence(timeout: 5))
        XCTAssertTrue(signOutRow(app).exists)
        XCTAssertTrue(app.staticTexts["sam@example.com"].exists)
    }

    func testConfirmingSignsOutAndOpensTheOpeningScreen() {
        let app = launch("6.1")
        XCTAssertTrue(signOutRow(app).waitForExistence(timeout: 10))

        signOutRow(app).tap()
        let alert = app.alerts["Sign out of Kiroshi?"]
        XCTAssertTrue(alert.waitForExistence(timeout: 5))
        alert.buttons["Sign out"].tap()

        XCTAssertTrue(app.buttons["Sign in"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.staticTexts[Self.footer].exists)
    }
}
