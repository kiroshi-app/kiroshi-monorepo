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
        let joinThisSpace = app.staticTexts["Join this Space"]
        XCTAssertTrue(joinThisSpace.waitForExistence(timeout: 10))
        XCTAssertTrue(
            app.staticTexts[
                "This iPhone doesn’t have the key to Studio yet. Open an invitation to Studio on this iPhone to join."
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

    func testKeysTakenByAnotherAccountSaySoAndPassTheAudit() throws {
        let app = launch("device-key-taken")
        XCTAssertTrue(
            app.staticTexts["Couldn’t add this iPhone to your account"].waitForExistence(
                timeout: 10))
        XCTAssertTrue(
            app.staticTexts[
                "This iPhone is already linked to another Kiroshi account. Sign in with that account to use it here."
            ].exists)

        try audit(app)

        app.buttons["Use another account"].tap()
        XCTAssertTrue(app.buttons["Sign in with Apple"].waitForExistence(timeout: 10))
    }
}
