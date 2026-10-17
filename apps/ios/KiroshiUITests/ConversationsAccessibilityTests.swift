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
        "Pico: All checks passed, the pull request is ready.",
        "All checks passed, the pull request is ready for review.",
    ]

    static let pileCounters: Set<String> = ["+2", "+3"]

    override func setUp() async throws {
        continueAfterFailure = true
    }

    func row(_ name: String, in app: XCUIApplication) -> XCUIElement {
        app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", name)).firstMatch
    }

    func auditTheHome(_ app: XCUIApplication) throws {
        let tabBar = app.tabBars.firstMatch.frame
        let navigationBar = app.navigationBars.firstMatch.frame
        try audit(app) { issue in
            let label = issue.element?.label ?? ""
            let isUnderTheTabBar = issue.element.map { $0.frame.intersects(tabBar) } ?? false
            let isInTheNavigationBar =
                issue.element.map { navigationBar.contains($0.frame) } ?? false
            return switch issue.auditType {
            case .textClipped: Self.truncatedPreviews.contains(label)
            case .contrast: isUnderTheTabBar
            case .dynamicType: isInTheNavigationBar
            default: false
            }
        }
    }

    func testTheHomeListsEachCompanionPassesTheAuditAndItsSpaceButtonOpensTheMenuOfSpaces() throws {
        let app = launch("2.1")
        let juniper = row("Juniper", in: app)
        XCTAssertTrue(juniper.waitForExistence(timeout: 10))
        XCTAssertTrue(juniper.label.hasPrefix("Juniper, Writer"), juniper.label)
        XCTAssertEqual(row("Release 0.42", in: app).value as? String, "Juniper, Pico, and Mira")
        XCTAssertTrue(app.navigationBars["Studio"].exists)
        XCTAssertTrue(app.buttons["Settings"].exists)

        try auditTheHome(app)

        app.navigationBars["Studio"].buttons["Space"].tap()

        let sideProject = app.buttons.matching(
            NSPredicate(format: "label BEGINSWITH 'Side project'")
        ).firstMatch
        XCTAssertTrue(sideProject.waitForExistence(timeout: 5))
        XCTAssertTrue(
            app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Home lab'")).firstMatch
                .exists)
    }

    func testNoCompanionSaysWhereToAddOneAndPassesTheAudit() throws {
        let app = launch("2.3")
        XCTAssertTrue(app.staticTexts["No companions yet"].waitForExistence(timeout: 10))
        XCTAssertTrue(
            app.staticTexts["Add one to Studio on your computer. It shows up here."].exists)

        try auditTheHome(app)
    }

    func testLoadingShowsPlaceholderRowsAndPassesTheAudit() throws {
        let app = launch("2.4")
        XCTAssertTrue(
            app.descendants(matching: .any)["Loading companions"].waitForExistence(timeout: 10))

        try auditTheHome(app)
    }

    func testAnOfflineHostKeepsTheListAndSaysWhenYouCanWriteAgain() throws {
        let app = launch("2.5")
        XCTAssertTrue(
            app.staticTexts[
                "Side project is offline. You can write again once sam@example.com’s computer is back."
            ].waitForExistence(timeout: 15))
        XCTAssertTrue(row("Juniper", in: app).exists)

        try auditTheHome(app)
    }

    func testAWorkingCompanionReadsWorkingInItsRowAndPassesTheAudit() throws {
        let app = launch("2.6")
        let juniper = app.buttons.matching(
            NSPredicate(format: "label BEGINSWITH 'Juniper' AND label CONTAINS 'working…'")
        ).firstMatch
        XCTAssertTrue(juniper.waitForExistence(timeout: 10))
        XCTAssertTrue(juniper.label.contains("Now"), juniper.label)

        try auditTheHome(app)
    }

    func testTheCompanionListPassesTheAuditAndAGroupRowReadsItsMembersAndOpensItsThread() throws {
        let app = launch("conversations")
        let juniper = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Juniper'"))
            .firstMatch
        XCTAssertTrue(juniper.waitForExistence(timeout: 10))
        let tabBar = app.tabBars.firstMatch.frame
        let navigationBar = app.navigationBars.firstMatch.frame

        try audit(app) { issue in
            let label = issue.element?.label ?? ""
            let isUnderTheTabBar = issue.element.map { $0.frame.intersects(tabBar) } ?? false
            let isInTheNavigationBar =
                issue.element.map { navigationBar.contains($0.frame) } ?? false
            return switch issue.auditType {
            case .textClipped: Self.truncatedPreviews.contains(label)
            case .contrast: Self.pileCounters.contains(label) || isUnderTheTabBar
            case .dynamicType: isInTheNavigationBar
            default: false
            }
        }

        let release = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Release crew'"))
            .firstMatch
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

    func testSubjectIconsAndBotPilesPassTheAuditAndEachRowReadsItsMembers() throws {
        let app = launch("conversation-icons")
        let relay = row("Relay audit: session tokens", in: app)
        XCTAssertTrue(relay.waitForExistence(timeout: 10))
        XCTAssertEqual(relay.value as? String, "Pico, Juniper, and Otto")
        XCTAssertEqual(
            row("Storybook baseline drift", in: app).value as? String,
            "Shoto, Juniper, Atlas, Pico, and Mira")
        let tabBar = app.tabBars.firstMatch.frame
        let navigationBar = app.navigationBars.firstMatch.frame

        try audit(app) { issue in
            let label = issue.element?.label ?? ""
            let isUnderTheTabBar = issue.element.map { $0.frame.intersects(tabBar) } ?? false
            let isInTheNavigationBar =
                issue.element.map { navigationBar.contains($0.frame) } ?? false
            return switch issue.auditType {
            case .contrast: Self.pileCounters.contains(label) || isUnderTheTabBar
            case .dynamicType: isInTheNavigationBar
            default: false
            }
        }
    }

    func testAnOpenGroupFollowsItsRenameThenGoesBackToTheListWhenDeleted() {
        let app = launch("conversations-live")
        let launchPlan = row("Launch plan", in: app)
        XCTAssertTrue(launchPlan.waitForExistence(timeout: 15))
        let isHittable = expectation(
            for: NSPredicate(format: "isHittable == true"), evaluatedWith: launchPlan)
        wait(for: [isHittable], timeout: 15)

        launchPlan.tap()

        XCTAssertTrue(app.navigationBars["Launch plan"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.navigationBars["Launch checklist"].waitForExistence(timeout: 10))
        let releaseCrew = app.buttons.matching(
            NSPredicate(format: "label BEGINSWITH 'Release crew'")
        ).firstMatch
        XCTAssertTrue(releaseCrew.waitForExistence(timeout: 10))
        XCTAssertFalse(app.navigationBars["Launch checklist"].exists)
    }
}
