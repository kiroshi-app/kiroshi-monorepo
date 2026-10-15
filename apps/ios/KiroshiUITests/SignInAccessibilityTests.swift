import XCTest

@MainActor
final class SignInAccessibilityTests: XCTestCase {
    static let shownText = [
        "1.1": "Your companions, away from your computer.",
        "1.1b": "Signing in with Apple…",
        "1.1c": "Signing in with Google…",
        "1.1d": "Couldn’t sign in with Apple. Try again, or use your email.",
        "1.2": "Continue with Google",
        "1.3": "The code works for 5 minutes.",
        "1.4": "Signing in…",
        "1.5": "Loading your spaces…",
        "1.6": "Couldn’t reach Kiroshi. Check your connection and try again.",
        "1.7": "That code didn’t work. Check it and try again.",
        "1.7b": "That code didn’t work three times",
        "1.8": "That code has expired. Send a new code to sign in.",
        "1.9": "Couldn’t send a new code, you’ve asked for too many.",
        "1.10": "No spaces yet",
    ]

    static func isDimmedWhileSigningIn(_ issue: XCUIAccessibilityAuditIssue) -> Bool {
        issue.auditType == .contrast && issue.element?.isEnabled == false
    }

    static func isAppleButtonWithoutItsDimmedTrait(_ issue: XCUIAccessibilityAuditIssue) -> Bool {
        issue.auditType == .trait && issue.element?.isEnabled == false
            && issue.element?.label.contains("with Apple") == true
    }

    static func isScrollingTextField(_ issue: XCUIAccessibilityAuditIssue) -> Bool {
        issue.auditType == .textClipped && issue.element?.elementType == .textField
    }

    override func setUp() async throws {
        continueAfterFailure = true
    }

    func testEverySignInStatePassesTheAuditAndWelcomeKeepsEveryActionAboveTheKeyboard() throws {
        for (fixture, text) in Self.shownText.sorted(by: { $0.key < $1.key }) {
            try XCTContext.runActivity(named: fixture) { _ in
                let app = launch(fixture)
                let shown = app.descendants(matching: .any)
                    .matching(NSPredicate(format: "label CONTAINS %@", text)).firstMatch
                XCTAssertTrue(shown.waitForExistence(timeout: 10), "\(fixture) shows “\(text)”")
                if fixture == "1.1" {
                    XCTAssertTrue(app.images["Kiroshi"].exists)
                    XCTAssertTrue(app.buttons["Sign in with Apple"].exists)
                    XCTAssertTrue(app.buttons["Continue with Google"].exists)
                }
                try audit(app) { issue in
                    Self.isDimmedWhileSigningIn(issue) || Self.isScrollingTextField(issue)
                        || Self.isAppleButtonWithoutItsDimmedTrait(issue)
                }
                if fixture == "1.1" {
                    try tapTheEmailFieldThenCheckEveryActionStaysAboveTheKeyboard(app)
                }
            }
        }
    }

    func tapTheEmailFieldThenCheckEveryActionStaysAboveTheKeyboard(_ app: XCUIApplication) throws {
        let email = app.textFields["Email"]
        XCTAssertTrue(email.waitForExistence(timeout: 10))

        email.tap()

        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 10))
        XCTAssertTrue(app.images["Kiroshi"].waitForNonExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Continue"].isHittable)
        add(XCTAttachment(screenshot: app.screenshot()))
        try audit(app) { issue in Self.isScrollingTextField(issue) }
    }

    func testWelcomeAtTheLargestTextScrollsToEveryAction() throws {
        let app = launch(
            "1.1", "-UIPreferredContentSizeCategoryName",
            "UICTContentSizeCategoryAccessibilityXXXL")
        XCTAssertTrue(app.textFields["Email"].waitForExistence(timeout: 10))
        try audit(app) { issue in
            Self.isScrollingTextField(issue) || Self.isScrolledOffScreen(issue, in: app)
        }

        app.swipeUp()

        XCTAssertTrue(app.buttons["Continue with Google"].isHittable)
        add(XCTAttachment(screenshot: app.screenshot()))
    }

    static func isScrolledOffScreen(_ issue: XCUIAccessibilityAuditIssue, in app: XCUIApplication)
        -> Bool
    {
        guard issue.auditType == .dynamicType, let element = issue.element else { return false }
        return !app.windows.firstMatch.frame.contains(element.frame)
    }
}
