import XCTest

@MainActor
final class ConversationsAccessibilityTests: XCTestCase {
    static let truncatedPreviews: Set<String> = [
        "The release notes are drafted, they’re waiting for your read.",
        "You: Can you split the onboarding ticket in two?",
        "All checks passed, the pull request is ready to merge.",
        "Here are three directions for the settings sheet.",
        "Morning digest: two new issues, nothing urgent.",
        "Juniper: The changelog is merged, I’m tagging 0.42 next.",
        "You: Let’s keep the grouped inset list for settings.",
    ]

    static let hiveCounters: Set<String> = ["+3"]

    override func setUp() async throws {
        continueAfterFailure = true
    }

    func waitForThePushToEnd(_ app: XCUIApplication) {
        let listRow = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Atlas'"))
            .firstMatch
        XCTAssertTrue(listRow.waitForNonExistence(timeout: 10))
    }

    func testTheCompanionListPassesTheAudit() throws {
        let app = launch("3.1")
        let juniper = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Juniper'"))
            .firstMatch
        XCTAssertTrue(juniper.waitForExistence(timeout: 10))
        let tabBar = app.tabBars.firstMatch.frame

        try audit(app) { issue in
            let label = issue.element?.label ?? ""
            let isUnderTheTabBar = issue.element.map { $0.frame.intersects(tabBar) } ?? false
            return switch issue.auditType {
            case .textClipped: Self.truncatedPreviews.contains(label)
            case .contrast: Self.hiveCounters.contains(label) || isUnderTheTabBar
            default: false
            }
        }
    }

    func testAGroupRowReadsItsMembersAndOpensItsThread() throws {
        let app = launch("3.1")
        let release = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Release crew'"))
            .firstMatch
        XCTAssertTrue(release.waitForExistence(timeout: 10))
        XCTAssertEqual(release.value as? String, "Juniper and Atlas")
        let design = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Design review'"))
            .firstMatch
        XCTAssertEqual(design.value as? String, "Mira, Pico, Shoto, Otto, and Atlas")

        release.tap()

        XCTAssertTrue(
            app.staticTexts["The changelog is merged, I’m tagging 0.42 next."]
                .waitForExistence(timeout: 10))
        XCTAssertTrue(app.navigationBars["Release crew"].exists)
    }

    func testAnOpenGroupFollowsItsRenameThenGoesBackToTheListWhenDeleted() {
        let app = launch("conversations-live")
        let launchPlan = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Launch plan'"))
            .firstMatch
        XCTAssertTrue(launchPlan.waitForExistence(timeout: 15))

        launchPlan.tap()

        XCTAssertTrue(app.navigationBars["Launch plan"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.navigationBars["Launch checklist"].waitForExistence(timeout: 10))
        let releaseCrew = app.buttons.matching(
            NSPredicate(format: "label BEGINSWITH 'Release crew'")
        ).firstMatch
        XCTAssertTrue(releaseCrew.waitForExistence(timeout: 10))
        XCTAssertFalse(app.navigationBars["Launch checklist"].exists)
    }

    func testTheThreadPassesTheAudit() throws {
        let app = launch("3.2")
        XCTAssertTrue(
            app.staticTexts["They’re waiting for your read."].waitForExistence(timeout: 10))
        waitForThePushToEnd(app)

        try audit(app)
    }

    func testTheWorkingThreadPassesTheAudit() throws {
        let app = launch("3.8")
        XCTAssertTrue(app.staticTexts["Juniper is working…"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["Stop"].waitForExistence(timeout: 10))
        waitForThePushToEnd(app)

        try audit(app)
    }
}
