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

    func testTheSettingsButtonOfEachTabOpensTheSheetAndCloseDismissesIt() {
        let app = launch("2.1")
        let settings = app.buttons["Settings"]
        XCTAssertTrue(settings.waitForExistence(timeout: 10))

        settings.tap()

        XCTAssertTrue(app.staticTexts[Self.footer].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["sam@example.com"].exists)
        app.buttons["Close"].tap()
        XCTAssertTrue(app.staticTexts[Self.footer].waitForNonExistence(timeout: 5))
        XCTAssertTrue(settings.isHittable)

        app.tabBars.buttons["Missions"].tap()
        let missionsSettings = app.navigationBars.buttons["Settings"]
        XCTAssertTrue(missionsSettings.waitForExistence(timeout: 10))

        missionsSettings.tap()

        XCTAssertTrue(app.staticTexts[Self.footer].waitForExistence(timeout: 5))
        app.buttons["Close"].tap()
        XCTAssertTrue(app.staticTexts[Self.footer].waitForNonExistence(timeout: 5))
    }

    func testTheSheetPassesTheAuditAndTheFixtureOpensItOnlyOnConversations() throws {
        let app = launch("6.1")
        XCTAssertTrue(signOutRow(app).waitForExistence(timeout: 10))
        XCTAssertEqual(app.staticTexts.matching(identifier: Self.footer).count, 1)

        try audit(app) { issue in
            issue.auditType == .dynamicType && issue.element?.label == Self.footer
        }

        app.buttons["Close"].tap()
        XCTAssertTrue(app.staticTexts[Self.footer].waitForNonExistence(timeout: 5))
        app.tabBars.buttons["Missions"].tap()

        XCTAssertTrue(app.navigationBars.buttons["Settings"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts[Self.footer].waitForExistence(timeout: 3))
    }

    func testThePrivacyTermsAndSupportRowsOpenTheirPageInTheApp() {
        let app = launch("6.1")
        let safari = XCUIApplication(bundleIdentifier: "com.apple.SafariViewService")
        XCTAssertTrue(signOutRow(app).waitForExistence(timeout: 10))

        for title in ["Privacy Policy", "Terms of Use", "Support"] {
            let row = app.collectionViews.buttons[title]
            XCTAssertTrue(row.isHittable, title)

            row.tap()

            let address = safari.buttons["URL"]
            XCTAssertTrue(address.waitForExistence(timeout: 10), title)
            XCTAssertTrue((address.value as? String)?.contains("kiroshi.app") == true, title)
            XCTAssertEqual(app.state, .runningForeground, title)
            safari.buttons["Close"].tap()
            let isBack = expectation(
                for: NSPredicate(format: "isHittable == true"), evaluatedWith: row)
            wait(for: [isBack], timeout: 10)
        }
    }

    func testTheConfirmationPassesTheAuditCancelKeepsTheSheetAndSignOutOpensWelcome()
        throws
    {
        let app = launch("6.2")
        let alert = app.alerts["Sign out of Kiroshi?"]
        XCTAssertTrue(alert.waitForExistence(timeout: 10))
        XCTAssertTrue(alert.staticTexts[Self.alertMessage].exists)
        let alertFrame = alert.frame

        try audit(app) { issue in
            let isInTheAlert = issue.element.map { alertFrame.contains($0.frame) } ?? true
            return issue.auditType == .dynamicType && isInTheAlert
        }

        alert.buttons["Cancel"].tap()

        XCTAssertTrue(alert.waitForNonExistence(timeout: 5))
        XCTAssertTrue(signOutRow(app).exists)
        XCTAssertTrue(app.staticTexts["sam@example.com"].exists)

        signOutRow(app).tap()
        XCTAssertTrue(alert.waitForExistence(timeout: 5))
        alert.buttons["Sign out"].tap()

        XCTAssertTrue(app.buttons["Sign in with Apple"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.staticTexts[Self.footer].exists)
    }
}
