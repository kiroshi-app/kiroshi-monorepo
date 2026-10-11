import XCTest

@MainActor
final class SignInAccessibilityTests: XCTestCase {
    static let shownText = [
        "1.1": "Your companions, away from your Mac.",
        "1.2": "No account yet? This creates one.",
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

    static func isScrollingTextField(_ issue: XCUIAccessibilityAuditIssue) -> Bool {
        issue.auditType == .textClipped && issue.element?.elementType == .textField
    }

    override func setUp() async throws {
        continueAfterFailure = true
    }

    func testTheOpeningShowsTheKiroshiMark() {
        let app = launch("1.1")
        XCTAssertTrue(app.images["Kiroshi"].waitForExistence(timeout: 10))
    }

    func testEverySignInStatePassesTheAudit() throws {
        for (fixture, text) in Self.shownText.sorted(by: { $0.key < $1.key }) {
            try XCTContext.runActivity(named: fixture) { _ in
                let app = launch(fixture)
                let shown = app.descendants(matching: .any)
                    .matching(NSPredicate(format: "label CONTAINS %@", text)).firstMatch
                XCTAssertTrue(shown.waitForExistence(timeout: 10), "\(fixture) shows “\(text)”")
                try audit(app) { issue in
                    Self.isDimmedWhileSigningIn(issue) || Self.isScrollingTextField(issue)
                }
            }
        }
    }
}
