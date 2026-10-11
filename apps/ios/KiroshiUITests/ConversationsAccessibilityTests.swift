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

    static let hiveCounters: Set<String> = ["+3"]

    override func setUp() async throws {
        continueAfterFailure = true
    }

    func waitForThePushToEnd(_ app: XCUIApplication) {
        let listRow = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Atlas'"))
            .firstMatch
        XCTAssertTrue(listRow.waitForNonExistence(timeout: 10))
    }

    func row(_ name: String, in app: XCUIApplication) -> XCUIElement {
        app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", name)).firstMatch
    }

    func auditTheHome(_ app: XCUIApplication) throws {
        let tabBar = app.tabBars.firstMatch.frame
        try audit(app) { issue in
            let label = issue.element?.label ?? ""
            let isUnderTheTabBar = issue.element.map { $0.frame.intersects(tabBar) } ?? false
            return switch issue.auditType {
            case .textClipped: Self.truncatedPreviews.contains(label)
            case .contrast: isUnderTheTabBar
            default: false
            }
        }
    }

    func testTheHomeListsEachCompanionWithItsRoleAndPassesTheAudit() throws {
        let app = launch("2.1")
        let juniper = row("Juniper", in: app)
        XCTAssertTrue(juniper.waitForExistence(timeout: 10))
        XCTAssertTrue(juniper.label.hasPrefix("Juniper, Writer"), juniper.label)
        XCTAssertEqual(row("Release 0.42", in: app).value as? String, "Juniper, Pico, and Mira")
        XCTAssertTrue(app.navigationBars["Studio"].exists)
        XCTAssertTrue(app.buttons["Settings"].exists)

        try auditTheHome(app)
    }

    func testTheSpaceTitleOpensTheMenuOfSpaces() throws {
        let app = launch("2.2")
        XCTAssertTrue(row("Juniper", in: app).waitForExistence(timeout: 10))

        app.navigationBars["Studio"].buttons.matching(
            NSPredicate(format: "label BEGINSWITH 'Studio'")
        ).firstMatch.tap()

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
        XCTAssertTrue(app.staticTexts["Add one to Studio on your Mac. It shows up here."].exists)

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
                "Side project is offline. You can write again once sam@example.com’s Mac is back."
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

    func testTheCompanionListPassesTheAudit() throws {
        let app = launch("conversations")
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
        let app = launch("conversations")
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
        let launchPlan = row("Launch plan", in: app)
        XCTAssertTrue(launchPlan.waitForExistence(timeout: 15))
        let isHittable = expectation(
            for: NSPredicate(format: "isHittable == true"), evaluatedWith: launchPlan)
        wait(for: [isHittable], timeout: 5)

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
        let app = launch("3.1")
        XCTAssertTrue(
            app.staticTexts["They’re waiting for your read."].waitForExistence(timeout: 10))
        waitForThePushToEnd(app)

        try auditTheThread(app)
    }

    func testTheWorkingThreadPassesTheAudit() throws {
        let app = launch("3.3")
        XCTAssertTrue(app.staticTexts["Juniper is working…"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["Stop"].waitForExistence(timeout: 10))
        waitForThePushToEnd(app)

        try auditTheThread(app)
    }

    func testAnEmptyThreadInvitesTheFirstMessageAndPassesTheAudit() throws {
        let app = launch("3.2")
        XCTAssertTrue(
            app.staticTexts["Nothing here yet. Your first message starts the conversation."]
                .waitForExistence(timeout: 10))
        waitForThePushToEnd(app)

        try auditTheThread(app)
    }

    func testAnOfflineHostKeepsTheThreadAndPassesTheAudit() throws {
        let onScreen = labelsFullyOnScreenAtTheLargestSize(of: "3.4")
        let app = launch("3.4")
        XCTAssertTrue(
            app.staticTexts[
                "Side project is offline. You can write again once sam@example.com’s Mac is back."
            ].waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["They’re waiting for your read."].exists)
        XCTAssertFalse(composer(in: app).isEnabled)

        try auditTheThread(app, onScreenAtTheLargestSize: onScreen)
    }

    func testTheShownTimesPassTheAudit() throws {
        let app = launchInEnglish("3.5")
        XCTAssertTrue(
            app.staticTexts.matching(NSPredicate(format: "label == %@", "9:40\u{202F}AM"))
                .firstMatch.waitForExistence(timeout: 10))
        waitForThePushToEnd(app)

        try auditTheThread(app)
    }

    func testSwipingLeftSlidesTheThreadToShowEachMessagesTime() {
        let app = launchInEnglish("3.1", "-holdsTimes", "YES")
        let waiting = app.staticTexts.matching(
            NSPredicate(
                format: "label == %@ AND value == %@", "They’re waiting for your read.",
                "9:40\u{202F}AM")
        ).firstMatch
        XCTAssertTrue(waiting.waitForExistence(timeout: 10))
        waitForThePushToEnd(app)
        let time = app.staticTexts.matching(
            NSPredicate(format: "label == %@", "9:40\u{202F}AM")
        ).firstMatch
        XCTAssertFalse(time.exists)
        let restingX = waiting.frame.minX

        waiting.swipeLeft()

        XCTAssertTrue(time.waitForExistence(timeout: 5))
        XCTAssertTrue(app.frame.contains(time.frame))
        XCTAssertLessThan(waiting.frame.minX, restingX)
    }

    func testTheThreadStillScrollsUpAtTheLargestSize() {
        let app = XCUIApplication()
        app.launchArguments = [
            "-fixture", "3.1",
            "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL",
        ]
        app.launch()
        let today = app.staticTexts["Today"]
        XCTAssertTrue(
            app.staticTexts["They’re waiting for your read."].waitForExistence(timeout: 10))
        XCTAssertFalse(today.isHittable)

        for _ in 1...3 where !today.isHittable {
            app.scrollViews.firstMatch.swipeDown()
        }

        XCTAssertTrue(today.isHittable)
    }

    func auditTheThread(
        _ app: XCUIApplication, onScreenAtTheLargestSize: Set<String>? = nil
    ) throws {
        let navigationBar = app.navigationBars.firstMatch.frame
        let transcript = app.scrollViews.firstMatch.frame
        try audit(app) { issue in
            guard let element = issue.element else { return false }
            let isInTheTitle = element.frame.minY < navigationBar.maxY
            let isScrolledOffScreenAtTheLargestSize =
                onScreenAtTheLargestSize.map {
                    transcript.contains(element.frame) && !$0.contains(element.label)
                } ?? false
            return switch issue.auditType {
            case .contrast: isInTheTitle
            case .dynamicType: isInTheTitle || isScrolledOffScreenAtTheLargestSize
            default: false
            }
        }
    }

    func launchInEnglish(_ fixture: String, _ arguments: String...) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments =
            ["-fixture", fixture, "-AppleLocale", "en_US", "-AppleLanguages", "(en)"] + arguments
        app.launch()
        return app
    }
}
