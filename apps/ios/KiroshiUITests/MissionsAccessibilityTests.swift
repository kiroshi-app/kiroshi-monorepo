import XCTest

@MainActor
final class MissionsAccessibilityTests: XCTestCase {
    override func setUp() async throws {
        continueAfterFailure = true
    }

    func row(_ objective: String, in app: XCUIApplication) -> XCUIElement {
        app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", objective)).firstMatch
    }

    func textsOnScreenAtTheLargestSize(of fixture: String, waitingFor label: String) -> Set<
        String
    > {
        let app = launch(
            fixture, "-UIPreferredContentSizeCategoryName",
            "UICTContentSizeCategoryAccessibilityXXXL")
        XCTAssertTrue(
            app.descendants(matching: .any).matching(
                NSPredicate(format: "label BEGINSWITH %@", label)
            ).firstMatch.waitForExistence(timeout: 15))
        let top = app.navigationBars.firstMatch.frame.maxY
        let bottom =
            app.tabBars.firstMatch.exists ? app.tabBars.firstMatch.frame.minY : app.frame.maxY
        let visible = CGRect(x: 0, y: top, width: app.frame.width, height: bottom - top)
        let shown = app.staticTexts.allElementsBoundByIndex
            .filter { visible.contains($0.frame) }
            .map(\.label)
        app.terminate()
        return Set(shown)
    }

    func auditTheList(_ app: XCUIApplication, onScreenAtTheLargestSize: Set<String>) throws {
        let tabBar = app.tabBars.firstMatch.frame
        try audit(app) { issue in
            let label = issue.element?.label ?? ""
            let isUnderTheTabBar = issue.element.map { $0.frame.intersects(tabBar) } ?? false
            let hasScrolledOutOfTheList = issue.element == nil
            let isScrolledOffScreenAtTheLargestSize =
                !hasScrolledOutOfTheList && !onScreenAtTheLargestSize.contains(label)
            return switch issue.auditType {
            case .textClipped: hasScrolledOutOfTheList
            case .contrast: isUnderTheTabBar
            case .dynamicType: isScrolledOffScreenAtTheLargestSize
            default: false
            }
        }
    }

    func auditTheThread(_ app: XCUIApplication, onScreenAtTheLargestSize: Set<String>) throws {
        let titleBottom = titleBottom(in: app)
        try audit(app) { issue in
            guard let element = issue.element else { return false }
            let isInTheTitle = element.frame.minY < titleBottom
            let isScrolledOffScreenAtTheLargestSize = !onScreenAtTheLargestSize.contains(
                element.label)
            return switch issue.auditType {
            case .contrast, .textClipped: isInTheTitle
            case .dynamicType: isInTheTitle || isScrolledOffScreenAtTheLargestSize
            default: false
            }
        }
    }

    func testTheListGroupsEachMissionWithItsCompanionAndPassesTheAudit() throws {
        let onScreen = textsOnScreenAtTheLargestSize(
            of: "5.1", waitingFor: "Split the onboarding flow")
        let app = launch("5.1")
        let split = row("Split the onboarding flow", in: app)
        XCTAssertTrue(split.waitForExistence(timeout: 10))
        XCTAssertTrue(split.label.hasPrefix("Split the onboarding flow, OPE-212"), split.label)
        XCTAssertTrue(
            split.label.hasSuffix("Atlas · Asked you which screen goes first."), split.label)
        XCTAssertTrue(row("Settings sheet on iPhone", in: app).exists)
        XCTAssertTrue(app.buttons["Settings"].exists)
        XCTAssertTrue(app.tabBars.buttons["Missions"].isSelected)

        try auditTheList(app, onScreenAtTheLargestSize: onScreen)
    }

    func testAnOpenedMissionPassesTheAuditThenSwipingLeftShowsEachMessagesTime() throws {
        let onScreen = labelsFullyOnScreenAtTheLargestSize(of: "5.2")
        let app = launchInEnglish("5.1", "-holdsTimes", "YES")
        app.tabBars.buttons["Missions"].tap()
        let split = row("Split the onboarding flow", in: app)
        XCTAssertTrue(split.waitForExistence(timeout: 10))
        split.tap()
        let opened = app.staticTexts["Mission opened by Atlas"]
        XCTAssertTrue(opened.waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Today"].exists)
        XCTAssertTrue(app.buttons["Attach"].exists)
        let question = app.staticTexts.matching(
            NSPredicate(format: "label BEGINSWITH %@", "Done. OPE")
        ).firstMatch
        XCTAssertTrue(question.waitForExistence(timeout: 10))
        XCTAssertTrue(split.waitForNonExistence(timeout: 10))

        try auditTheThread(app, onScreenAtTheLargestSize: onScreen)

        let time = app.staticTexts.matching(
            NSPredicate(format: "label == %@", question.value as? String ?? "")
        ).firstMatch
        XCTAssertFalse(time.exists)
        let restingX = question.frame.minX

        question.swipeLeft()

        XCTAssertTrue(time.waitForExistence(timeout: 5))
        XCTAssertTrue(app.frame.contains(time.frame))
        XCTAssertLessThan(question.frame.minX, restingX)
    }

    func testNoMissionsSaysWhereTheyComeFromAndPassesTheAudit() throws {
        let onScreen = textsOnScreenAtTheLargestSize(of: "5.3", waitingFor: "No missions yet")
        let app = launch("5.3")
        XCTAssertTrue(app.staticTexts["No missions yet"].waitForExistence(timeout: 10))
        XCTAssertTrue(
            app.staticTexts["Missions your companions open in this space show up here."].exists)

        try auditTheList(app, onScreenAtTheLargestSize: onScreen)
    }

    func testAnOfflineHostKeepsTheListAndSaysWhenYouCanWriteAgain() throws {
        let onScreen = textsOnScreenAtTheLargestSize(
            of: "5.4", waitingFor: "Split the onboarding flow")
        let app = launch("5.4")
        XCTAssertTrue(
            app.staticTexts[
                "Side project is offline. You can write again once sam@example.com’s computer is back."
            ].waitForExistence(timeout: 15))
        XCTAssertTrue(row("Split the onboarding flow", in: app).exists)

        try auditTheList(app, onScreenAtTheLargestSize: onScreen)
    }
}
