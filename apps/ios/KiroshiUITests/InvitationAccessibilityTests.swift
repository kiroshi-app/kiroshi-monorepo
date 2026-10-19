import XCTest

@MainActor
final class InvitationAccessibilityTests: XCTestCase {
    override func setUp() async throws {
        continueAfterFailure = true
    }

    static let sheetLabels: Set<String> = [
        "Studio", "Invited by noa@example.com", "Accept", "Decline", "Joining…", "Try again",
        "Expires", "October 25", "Host", "Offline", "Invitation", "Withdrawn", "Expired",
        "For another email",
        "What you share in Studio can be read by its members and their devices, and by nobody else.",
        "noa@example.com’s computer is offline. You can accept once it’s back.",
        "Couldn’t accept. Kiroshi’s servers didn’t answer.",
        "noa@example.com withdrew this invitation. Ask them to invite you again.",
        "This invitation expired. Ask noa@example.com to invite you again.",
        "This invitation is for another email. Sign in with the email noa@example.com invited, then accept it again.",
    ]

    func auditTheSheet(_ app: XCUIApplication) throws {
        try audit(app) { issue in
            let label = issue.element?.label ?? ""
            let isDisabled = issue.element?.isEnabled == false
            let isTheListDimmedBehindTheSheet =
                issue.auditType == .elementDetection && issue.element == nil
            let isTheSheetsOwnText = Self.sheetLabels.contains(label)
            return issue.auditType == .textClipped && (issue.element == nil || isTheSheetsOwnText)
                || issue.auditType == .contrast && isDisabled
                || isTheListDimmedBehindTheSheet
                || self.isTheBadgedSpaceButton(issue, in: app)
        }
    }

    func isTheBadgedSpaceButton(_ issue: XCUIAccessibilityAuditIssue, in app: XCUIApplication)
        -> Bool
    {
        let navigationBar = app.navigationBars.firstMatch.frame
        let isInTheNavigationBar = issue.element.map { navigationBar.contains($0.frame) } ?? false
        return [.dynamicType, .textClipped].contains(issue.auditType) && isInTheNavigationBar
    }

    func testTheSpaceMenuListsTheInvitationAndOpensItsSheet() throws {
        let app = launchInEnglish("4")
        let space = app.navigationBars["Personal"].buttons["Space"]
        XCTAssertTrue(space.waitForExistence(timeout: 10))
        let announcesTheInvitation = NSPredicate(
            format: "value == 'Personal, online, 1 invitation'")
        XCTAssertEqual(
            XCTWaiter().wait(
                for: [expectation(for: announcesTheInvitation, evaluatedWith: space)], timeout: 10),
            .completed)
        try audit(app) { [self] issue in
            issue.auditType == .textClipped && issue.element == nil
                || self.isTheBadgedSpaceButton(issue, in: app)
        }

        space.tap()
        let invited = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Studio'"))
            .firstMatch
        XCTAssertTrue(invited.waitForExistence(timeout: 5))
        invited.tap()

        XCTAssertTrue(app.buttons["Accept"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Studio"].exists)
        XCTAssertTrue(app.buttons["Decline"].exists)
        try auditTheSheet(app)
    }

    func testEachStateOfTheSheetPassesTheAudit() throws {
        let states = [
            ("4.2", "Accept"),
            ("4.3", "Joining…"),
            ("4.4", "noa@example.com’s computer is offline. You can accept once it’s back."),
            ("4.5", "Couldn’t accept. Kiroshi’s servers didn’t answer."),
            ("4.6", "noa@example.com withdrew this invitation. Ask them to invite you again."),
            (
                "invitation-expired",
                "This invitation expired. Ask noa@example.com to invite you again."
            ),
            (
                "invitation-other-email",
                "This invitation is for another email. Sign in with the email noa@example.com invited, then accept it again."
            ),
        ]
        for (fixture, shown) in states {
            let app = launchInEnglish(fixture)
            XCTAssertTrue(
                app.descendants(matching: .any)[shown].waitForExistence(timeout: 15), fixture)
            try auditTheSheet(app)
            app.terminate()
        }
    }

    func testTheSheetOpensTallAndPassesTheAuditAtTheLargestSize() throws {
        let app = launch(
            "4.2", "-UIPreferredContentSizeCategoryName",
            "UICTContentSizeCategoryAccessibilityXXXL")
        XCTAssertTrue(app.staticTexts["Studio"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.buttons["Accept"].isHittable)
        XCTAssertFalse(app.staticTexts["Juniper"].isHittable)

        try auditTheSheet(app)
    }

    func testAcceptingLandsOnTheJoinedSpace() throws {
        let app = launch("4.7")
        let space = app.navigationBars["Studio"].buttons["Space"]

        XCTAssertTrue(space.waitForExistence(timeout: 15))
        XCTAssertEqual(space.value as? String, "Studio, online")
        XCTAssertFalse(app.buttons["Accept"].exists)
        XCTAssertTrue(app.staticTexts["Juniper"].waitForExistence(timeout: 10))
    }
}
