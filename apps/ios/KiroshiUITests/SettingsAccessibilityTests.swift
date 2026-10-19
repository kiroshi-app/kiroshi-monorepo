import XCTest

@MainActor
final class SettingsAccessibilityTests: XCTestCase {
    static let footer = "Your spaces stop working on this iPhone until you sign in again."
    static let alertMessage =
        "Studio, Home lab and Side project leave this iPhone until you sign in again."
    static let consentFooter =
        "Messages you send here go to your computer through Kiroshi’s relay. Your computer passes them to the agent, which sends them to the model provider your computer uses. Turn this off and nothing leaves this iPhone until you agree again."
    static let fingerprintFooter =
        "When this iPhone asks to join your account, the device that approves it shows these words."

    static func isThisIPhoneCard(_ label: String) -> Bool {
        ["iPhone", "This device"].contains(label) || label.split(separator: ", ").count == 6
    }

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
            issue.auditType == .dynamicType
                && ([Self.footer, Self.consentFooter, Self.fingerprintFooter].contains(
                    issue.element?.label) || Self.isThisIPhoneCard(issue.element?.label ?? ""))
        }

        app.buttons["Close"].tap()
        XCTAssertTrue(app.staticTexts[Self.footer].waitForNonExistence(timeout: 5))
        app.tabBars.buttons["Missions"].tap()

        XCTAssertTrue(app.navigationBars.buttons["Settings"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts[Self.footer].waitForExistence(timeout: 3))
    }

    func testThePrivacyTermsAndSupportRowsOpenTheirPageInTheApp() {
        let app = launch("6.1")
        let address = app.buttons["URL"]
        let close = app.buttons.matching(NSPredicate(format: "identifier == 'Close'")).firstMatch
        XCTAssertTrue(signOutRow(app).waitForExistence(timeout: 10))

        for title in ["Privacy Policy", "Terms of Use", "Support"] {
            let row = app.collectionViews.buttons[title]
            XCTAssertTrue(row.isHittable, title)

            row.tap()

            XCTAssertTrue(address.waitForExistence(timeout: 30), title)
            XCTAssertTrue(
                becomes(address, NSPredicate(format: "value CONTAINS 'kiroshi.app'")), title)
            XCTAssertEqual(app.state, .runningForeground, title)
            close.tap()
            XCTAssertTrue(address.waitForNonExistence(timeout: 10), title)
            XCTAssertTrue(becomes(row, NSPredicate(format: "isHittable == true")), title)
        }
    }

    func becomes(_ element: XCUIElement, _ predicate: NSPredicate) -> Bool {
        let met = expectation(for: predicate, evaluatedWith: element)
        return XCTWaiter().wait(for: [met], timeout: 10) == .completed
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
