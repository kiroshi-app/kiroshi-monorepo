import XCTest

@MainActor
final class DeviceApprovalAccessibilityTests: XCTestCase {
    static let sheetLabels: Set<String> = [
        "Sam’s MacBook Pro wants to use your account",
        "Asked just now. Approve it only if it’s yours. If it isn’t, choose Not me and it’ll be signed out.",
        "Approve only if Sam’s MacBook Pro shows these same six words.",
        "Sam’s MacBook Pro", "Approve", "Not me",
    ]

    func auditTheSheet(_ app: XCUIApplication, overTheList: Bool) throws {
        try audit(app) { issue in
            let label = issue.element?.label ?? ""
            let isTheSheetsOwnText =
                Self.sheetLabels.contains(label) || label.hasPrefix("Sam’s MacBook Pro, ")
            let isTheListDimmedBehindTheSheet =
                overTheList && issue.auditType == .elementDetection && issue.element == nil
            return issue.auditType == .textClipped && (issue.element == nil || isTheSheetsOwnText)
                || isTheListDimmedBehindTheSheet
        }
    }

    override func setUp() async throws {
        continueAfterFailure = true
    }

    func testWaitingForApprovalPassesTheAuditAtTheLargestSize() throws {
        let app = launch(
            "approval-6", "-UIPreferredContentSizeCategoryName",
            "UICTContentSizeCategoryAccessibilityXXXL")
        XCTAssertTrue(
            app.staticTexts["Approve this device from one you already use"]
                .waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Waiting for approval…"].exists)
        XCTAssertFalse(app.staticTexts["Loading your spaces…"].exists)

        try audit(app) { issue in
            issue.auditType == .textClipped && issue.element == nil
        }
    }

    func testEachApprovalStatePassesTheAudit() throws {
        let states = [
            ("approval-6.2", "This device is approved"),
            ("approval-6.4", "The request expired"),
            ("approval-6.5", "Check your email"),
        ]
        for (fixture, title) in states {
            let app = launch(fixture)
            XCTAssertTrue(app.staticTexts[title].waitForExistence(timeout: 10), fixture)
            try audit(app) { issue in
                let isDisabled = issue.element?.isEnabled == false
                return issue.auditType == .textClipped && issue.element == nil
                    || issue.auditType == .contrast && isDisabled
            }
            app.terminate()
        }
    }

    func testNotMeElsewhereShowsTheRefusalThenGoesBackToSignIn() throws {
        let app = launch("approval-6.3")
        XCTAssertTrue(
            app.staticTexts["This device wasn’t approved"].waitForExistence(timeout: 10))
        try audit(app) { issue in
            issue.auditType == .textClipped && issue.element == nil
        }

        app.buttons["Back to sign in"].tap()

        XCTAssertTrue(app.buttons["Sign in with Apple"].waitForExistence(timeout: 10))
    }

    func testAnotherDeviceAskingOpensTheSheetThatApproves() throws {
        let app = launch("device-request")
        let title = app.staticTexts["Sam’s MacBook Pro wants to use your account"]
        XCTAssertTrue(title.waitForExistence(timeout: 15))
        XCTAssertTrue(app.buttons["Not me"].exists)
        try auditTheSheet(app, overTheList: true)

        app.buttons["Approve"].tap()

        XCTAssertTrue(title.waitForNonExistence(timeout: 10))
        XCTAssertTrue(app.tabBars.buttons["Conversations"].isHittable)
    }

    func testTheSheetOpensTallAndPassesTheAuditAtTheLargestSize() throws {
        let app = launch(
            "device-request", "-UIPreferredContentSizeCategoryName",
            "UICTContentSizeCategoryAccessibilityXXXL")
        XCTAssertTrue(
            app.staticTexts["Sam’s MacBook Pro wants to use your account"]
                .waitForExistence(timeout: 15))
        XCTAssertFalse(app.staticTexts["Juniper"].isHittable)

        try auditTheSheet(app, overTheList: false)
    }
}
