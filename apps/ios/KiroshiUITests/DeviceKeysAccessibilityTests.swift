import XCTest

@MainActor
final class DeviceKeysAccessibilityTests: XCTestCase {
    override func setUp() async throws {
        continueAfterFailure = true
    }

    func testJoinThisSpaceShowsOnBothTabsAndPassesTheAuditAtTheLargestSize() throws {
        let app = launch(
            "join-space", "-UIPreferredContentSizeCategoryName",
            "UICTContentSizeCategoryAccessibilityXXXL")
        let joinThisSpace = app.staticTexts["Waiting for the key to Studio"]
        XCTAssertTrue(joinThisSpace.waitForExistence(timeout: 10))
        XCTAssertTrue(
            app.staticTexts[
                "The computer where Studio runs sends this iPhone its key once Kiroshi is open there."
            ].exists)
        XCTAssertFalse(app.staticTexts["Loading companions"].exists)
        let navigationBar = app.navigationBars.firstMatch.frame

        try audit(app) { issue in
            let isInTheNavigationBar =
                issue.element.map { navigationBar.contains($0.frame) } ?? false
            return switch issue.auditType {
            case .textClipped: issue.element == nil
            case .dynamicType: isInTheNavigationBar
            default: false
            }
        }

        app.tabBars.buttons["Missions"].tap()
        XCTAssertTrue(joinThisSpace.waitForExistence(timeout: 10))
    }

    func testARefusedProofSaysSoKeepsThePersonSignedInAndPassesTheAudit() throws {
        let app = launch("device-not-added")
        let title = app.staticTexts["Couldn’t add this iPhone to your account"]
        XCTAssertTrue(title.waitForExistence(timeout: 10))
        XCTAssertTrue(
            app.staticTexts[
                "Kiroshi couldn’t confirm this iPhone’s keys. Wait a moment, then check again."
            ].exists)
        XCTAssertFalse(app.buttons["Use another account"].exists)

        try audit(app)

        app.buttons["Check again"].tap()
        XCTAssertTrue(title.waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["Sign in with Apple"].exists)
    }

    func testADeviceMovedToAnotherAccountLandsOnSignInWithOneSentence() throws {
        let app = launch("device-moved")
        let notice = app.staticTexts[
            "This iPhone now belongs to another Kiroshi account, so you’ve been signed out."]
        XCTAssertTrue(notice.waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["Sign in with Apple"].exists)

        try audit(app) { issue in
            issue.auditType == .textClipped
                && (issue.element == nil || issue.element?.elementType == .textField)
        }
    }
}
