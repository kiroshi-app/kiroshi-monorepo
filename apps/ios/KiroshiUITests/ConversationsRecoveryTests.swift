import XCTest

@MainActor
final class ConversationsRecoveryTests: XCTestCase {
    override func setUp() async throws {
        continueAfterFailure = true
    }

    func failure(in app: XCUIApplication) -> XCUIElement {
        app.staticTexts["Couldn’t load your agents."]
    }

    func juniper(in app: XCUIApplication) -> XCUIElement {
        app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Juniper'")).firstMatch
    }

    func testTheFailureAtTheLargestSizePassesTheAuditAndTryAgainLoadsTheList() throws {
        let app = launch(
            "conversations-recovering", "-UIPreferredContentSizeCategoryName",
            "UICTContentSizeCategoryAccessibilityXXXL")
        XCTAssertTrue(failure(in: app).waitForExistence(timeout: 10))
        XCTAssertTrue(
            app.staticTexts["Check that the computer where Kiroshi runs is on, then try again."]
                .exists)
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

        app.buttons["Try Again"].tap()

        XCTAssertTrue(juniper(in: app).waitForExistence(timeout: 10))
        XCTAssertFalse(failure(in: app).exists)
    }

    func testComingBackToTheForegroundClearsTheFailureByItself() throws {
        let app = launch("conversations-recovering")
        XCTAssertTrue(failure(in: app).waitForExistence(timeout: 10))

        XCUIDevice.shared.press(.home)
        let isInTheBackground = NSPredicate { app, _ in
            (app as? XCUIApplication)?.state != .runningForeground
        }
        wait(for: [expectation(for: isInTheBackground, evaluatedWith: app)], timeout: 10)
        app.activate()

        XCTAssertTrue(juniper(in: app).waitForExistence(timeout: 10))
        XCTAssertFalse(failure(in: app).exists)
    }
}
