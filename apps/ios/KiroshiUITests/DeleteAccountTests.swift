import XCTest

@MainActor
final class DeleteAccountTests: XCTestCase {
    static let alertMessage =
        "Your Kiroshi account, your Space memberships and the Spaces you host are deleted. This can’t be undone."
    static let failure = "Couldn’t delete your account. Check your connection and try again."

    let requestLog = FileManager.default.temporaryDirectory
        .appending(path: "requests-\(UUID().uuidString).log")

    override func setUp() async throws {
        continueAfterFailure = false
    }

    override func tearDown() async throws {
        try? FileManager.default.removeItem(at: requestLog)
    }

    func deleteAccountRow(_ app: XCUIApplication) -> XCUIElement {
        app.collectionViews.buttons["Delete account"]
    }

    func deletionCalls() -> Int {
        Self.deletionCalls(in: requestLog)
    }

    nonisolated static func deletionCalls(in log: URL) -> Int {
        let lines = (try? String(contentsOf: log, encoding: .utf8)) ?? ""
        return lines.split(separator: "\n").filter { $0 == "DELETE /me" }.count
    }

    static func isTheFailureLineInItsFooter(_ issue: XCUIAccessibilityAuditIssue) -> Bool {
        issue.auditType == .dynamicType && issue.element?.label.contains(failure) == true
    }

    func waitForDeletionCalls(_ count: Int) {
        let log = requestLog
        let counted = NSPredicate { _, _ in Self.deletionCalls(in: log) == count }
        wait(for: [expectation(for: counted, evaluatedWith: nil)], timeout: 10)
    }

    func testDeleteAsksOnceThenDeletesTheAccountAndOpensWelcome() throws {
        let app = launch("6.1", "-requestLog", requestLog.path())
        let row = deleteAccountRow(app)
        XCTAssertTrue(row.waitForExistence(timeout: 10))

        row.tap()

        let alert = app.alerts["Delete your account?"]
        XCTAssertTrue(alert.waitForExistence(timeout: 5))
        XCTAssertTrue(alert.staticTexts[Self.alertMessage].exists)
        XCTAssertTrue(alert.buttons["Cancel"].exists)
        let alertFrame = alert.frame
        try audit(app) { issue in
            let isInTheAlert = issue.element.map { alertFrame.contains($0.frame) } ?? true
            return issue.auditType == .dynamicType && isInTheAlert
        }
        XCTAssertEqual(deletionCalls(), 0)

        alert.buttons["Delete"].tap()

        XCTAssertTrue(app.buttons["Sign in with Apple"].waitForExistence(timeout: 10))
        XCTAssertFalse(row.exists)
        XCTAssertEqual(deletionCalls(), 1)
    }

    func testAFailedDeletionSaysSoAndKeepsTheSessionInSettings() throws {
        let app = launch("delete-account-failed", "-requestLog", requestLog.path())
        let failure = app.staticTexts[Self.failure]
        XCTAssertTrue(failure.waitForExistence(timeout: 10))
        XCTAssertEqual(deletionCalls(), 1)
        XCTAssertTrue(app.staticTexts["sam@example.com"].exists)
        XCTAssertTrue(app.collectionViews.buttons["Sign out"].exists)
        try audit(app) { issue in Self.isTheFailureLineInItsFooter(issue) }

        deleteAccountRow(app).tap()
        let alert = app.alerts["Delete your account?"]
        XCTAssertTrue(alert.waitForExistence(timeout: 5))
        alert.buttons["Delete"].tap()

        XCTAssertTrue(alert.waitForNonExistence(timeout: 5))
        waitForDeletionCalls(2)
        XCTAssertTrue(failure.waitForExistence(timeout: 10))
        XCTAssertTrue(deleteAccountRow(app).isEnabled)
        XCTAssertTrue(app.staticTexts["sam@example.com"].exists)
        XCTAssertFalse(app.buttons["Sign in with Apple"].exists)
        XCTAssertEqual(deletionCalls(), 2)
    }
}
