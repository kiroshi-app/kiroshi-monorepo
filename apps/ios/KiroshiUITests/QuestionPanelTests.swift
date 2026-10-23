import XCTest

@MainActor
final class QuestionPanelTests: XCTestCase {
    override func setUp() async throws {
        continueAfterFailure = false
    }

    func keep(_ name: String, of app: XCUIApplication) {
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }

    func option(_ label: String, in app: XCUIApplication) -> XCUIElement {
        app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", label)).firstMatch
    }

    func text(_ text: String, in app: XCUIApplication) -> XCUIElement {
        app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", text)).firstMatch
    }

    func attach(in app: XCUIApplication) -> XCUIElement {
        app.buttons["Attach"]
    }

    func other(in app: XCUIApplication) -> XCUIElement {
        app.textFields["Other answer"].exists
            ? app.textFields["Other answer"] : app.textViews["Other answer"]
    }

    static let artboardOrange = ["Now", "Needs you"]

    func panelTop(under question: String?, in app: XCUIApplication) -> CGFloat {
        let segments = app.segmentedControls.firstMatch
        if segments.exists {
            return segments.frame.minY
        }
        guard let question else { return .infinity }
        return text(question, in: app).frame.minY
    }

    func auditThePanel(
        _ app: XCUIApplication, under question: String? = nil, atTheLargestSize: Bool = false,
        withTheKeyboard: Bool = false, isScrolledUp: Bool = false
    ) throws {
        let titleBottom = titleBottom(in: app)
        let navigationBar = app.navigationBars.firstMatch.frame
        let tabBar = app.tabBars.firstMatch.exists ? app.tabBars.firstMatch.frame : .null
        let attach = attach(in: app)
        let composerTop = attach.exists ? attach.frame.minY : .infinity
        let panelTop = panelTop(under: question, in: app)
        let latest = app.buttons["Latest message"]
        let latestFrame = latest.exists ? latest.frame : .null
        let send = app.buttons["Send"]
        let keyboardTop = withTheKeyboard && send.exists ? send.frame.maxY : .infinity
        try audit(app) { issue in
            guard let element = issue.element else {
                return issue.auditType == .textClipped
                    || withTheKeyboard && issue.auditType == .elementDetection
                    || isScrolledUp && issue.auditType == .dynamicType
            }
            let isInTheTitle =
                element.frame.minY < titleBottom + GroupThreadTests.softScrollEdgeDepth
            let isInTheNavigationBar = navigationBar.contains(element.frame)
            let isUnderTheTabBar = element.frame.intersects(tabBar)
            let isTheComposer = element.frame.midY > composerTop
            let isAboveThePanel = element.frame.maxY <= panelTop
            let isBehindThePanel = element.frame.maxY > panelTop && !element.isHittable
            let isOffScreen = isInTheTitle || element.frame.maxY > composerTop
            let isTheThreadUnderThePanel = isScrolledUp && element.frame.midY > panelTop
            let isUnderTheLatestButton =
                element.label != "Latest message" && element.frame.intersects(latestFrame)
            let isInTheKeyboard = element.frame.minY >= keyboardTop
            return switch issue.auditType {
            case .contrast:
                isInTheTitle || isUnderTheTabBar || isTheComposer || isBehindThePanel
                    || isTheThreadUnderThePanel || isUnderTheLatestButton || !element.isEnabled
                    || Self.artboardOrange.contains { element.label.hasSuffix($0) }
            case .dynamicType:
                isInTheTitle || isInTheNavigationBar || isAboveThePanel || isBehindThePanel
                    || atTheLargestSize && isOffScreen
            case .textClipped:
                isInTheTitle || isBehindThePanel || atTheLargestSize && isOffScreen
            case .sufficientElementDescription: isInTheKeyboard
            default: false
            }
        }
    }

    static let format = "Which format should the release notes take?"

    func testThePanelTakesThePlaceOfTheComposerUntilSendGivesItBack() throws {
        let app = launchInEnglish("questions-4.1")
        let summary = option("Summary", in: app)
        XCTAssertTrue(summary.waitForExistence(timeout: 10))
        XCTAssertTrue(text(Self.format, in: app).exists)
        XCTAssertFalse(attach(in: app).exists)
        XCTAssertFalse(app.buttons["Send"].isEnabled)
        XCTAssertTrue(app.buttons["Skip"].isEnabled)
        XCTAssertFalse(text("working…", in: app).exists)
        XCTAssertFalse(app.buttons["Stop"].exists)
        XCTAssertGreaterThan(summary.frame.minY, app.frame.midY - 100)
        keep("4.1 Sticky · single select, empty", of: app)
        try auditThePanel(app, under: Self.format)

        summary.tap()
        XCTAssertTrue(summary.isSelected)
        XCTAssertTrue(app.buttons["Send"].isEnabled)
        keep("4.2 Sticky · option chosen", of: app)
        try auditThePanel(app, under: Self.format)

        app.buttons["Send"].tap()

        XCTAssertTrue(text("You answered", in: app).waitForExistence(timeout: 10))
        XCTAssertTrue(attach(in: app).waitForExistence(timeout: 10))
        XCTAssertTrue(text("Summary", in: app).exists)
        XCTAssertFalse(app.buttons["Skip"].exists)
        XCTAssertFalse(other(in: app).exists)
        XCTAssertTrue(app.buttons["Stop"].waitForExistence(timeout: 10))
        keep("4.6 Sticky · after Send, composer back", of: app)
        try auditThePanel(app)
    }

    func testOtherTypedSitsOnTheKeyboardAndReplacesThePickedOption() throws {
        let app = launchInEnglish("questions-4.1")
        let summary = option("Summary", in: app)
        XCTAssertTrue(summary.waitForExistence(timeout: 10))
        summary.tap()

        other(in: app).tap()
        other(in: app).typeText("Changelog, user-facing only")

        XCTAssertFalse(summary.isSelected)
        let send = app.buttons["Send"]
        XCTAssertTrue(send.isEnabled)
        XCTAssertTrue(send.isHittable)
        XCTAssertLessThanOrEqual(send.frame.maxY, app.keyboards.firstMatch.frame.minY)
        keep("4.4 Sticky · Other open, keyboard", of: app)
        try auditThePanel(app, under: Self.format, withTheKeyboard: true)
    }

    func testAMultiSelectHoldsSeveralOptions() throws {
        let app = launchInEnglish("questions-4.3")
        let features = option("New features", in: app)
        XCTAssertTrue(features.waitForExistence(timeout: 10))
        XCTAssertTrue(text("Choose any that apply.", in: app).exists)

        features.tap()
        option("Fixes", in: app).tap()

        XCTAssertTrue(features.isSelected)
        XCTAssertTrue(option("Fixes", in: app).isSelected)
        XCTAssertFalse(option("Breaking changes", in: app).isSelected)
        keep("4.3 Sticky · multi-select", of: app)
        try auditThePanel(app, under: "Which sections should the notes include?")
    }

    func testSeveralQuestionsGoOneByOneThenSendTogether() throws {
        let app = launchInEnglish("questions-4.5")
        XCTAssertTrue(option("Summary", in: app).waitForExistence(timeout: 10))
        option("Summary", in: app).tap()
        app.buttons["Next"].tap()

        XCTAssertTrue(text("Who reads these notes first?", in: app).waitForExistence(timeout: 5))
        option("People using the app", in: app).tap()
        keep("4.5 Sticky · 3 questions, segment 2 active", of: app)
        try auditThePanel(app)
        app.buttons["Next"].tap()

        XCTAssertTrue(text("How long should the notes run?", in: app).waitForExistence(timeout: 5))
        option("Under a page", in: app).tap()
        app.buttons["Send"].tap()

        XCTAssertTrue(text("You answered", in: app).waitForExistence(timeout: 10))
        XCTAssertTrue(text("People using the app", in: app).exists)
        XCTAssertTrue(text("Under a page", in: app).exists)
        XCTAssertTrue(attach(in: app).exists)
        keep("4.6 Sticky · three answers", of: app)
    }

    func testSkipGivesTheComposerBack() throws {
        let app = launchInEnglish("questions-4.1")
        XCTAssertTrue(app.buttons["Skip"].waitForExistence(timeout: 10))

        app.buttons["Skip"].tap()

        XCTAssertTrue(text("You skipped", in: app).waitForExistence(timeout: 10))
        XCTAssertTrue(attach(in: app).waitForExistence(timeout: 10))
        XCTAssertFalse(option("Summary", in: app).exists)
    }

    func testAnAnswerFromAnotherDeviceGivesTheComposerBack() throws {
        let app = launchInEnglish("questions-4.7")
        XCTAssertTrue(option("Summary", in: app).waitForExistence(timeout: 10))
        XCTAssertFalse(attach(in: app).exists)

        XCTAssertTrue(text("Answered on another device", in: app).waitForExistence(timeout: 15))
        XCTAssertTrue(text("Full changelog", in: app).waitForExistence(timeout: 5))
        XCTAssertTrue(attach(in: app).waitForExistence(timeout: 5))
        XCTAssertFalse(option("Summary", in: app).exists)
        keep("4.7 Sticky · answered on another device", of: app)
        try auditThePanel(app)
    }

    func testTheLatestMessageButtonBringsTheThreadBackDown() throws {
        let app = launchInEnglish("questions-4.1", "-history", "YES")
        XCTAssertTrue(option("Summary", in: app).waitForExistence(timeout: 10))
        let latest = app.buttons["Latest message"]
        XCTAssertFalse(latest.exists)

        app.scrollViews.firstMatch.swipeDown()

        XCTAssertTrue(latest.waitForExistence(timeout: 5))
        XCTAssertLessThan(latest.frame.maxY, option("Summary", in: app).frame.minY)
        keep("4.8 Sticky · long thread scrolled, panel fixed", of: app)
        try auditThePanel(app, under: Self.format, isScrolledUp: true)

        latest.tap()

        XCTAssertTrue(latest.waitForNonExistence(timeout: 5))
        XCTAssertTrue(text("One thing before I write.", in: app).isHittable)
    }

    func testTheConversationRowSaysItNeedsYou() throws {
        let app = launchInEnglish("questions-2.1")
        let row = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Juniper'"))
            .firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 10))
        XCTAssertTrue(
            NSPredicate(format: "label CONTAINS 'Needs you'").evaluate(with: row)
                || text("Needs you", in: app).waitForExistence(timeout: 10))
        keep("2.1 Conversations · needs you", of: app)
        try auditThePanel(app)

        row.tap()

        XCTAssertTrue(option("Summary", in: app).waitForExistence(timeout: 10))
    }

    func testThePanelStaysUsableAtTheLargestTextSize() throws {
        let app = launchInEnglish(
            "questions-4.1", "-UIPreferredContentSizeCategoryName",
            "UICTContentSizeCategoryAccessibilityXXXL")
        let question = text(Self.format, in: app)
        XCTAssertTrue(question.waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["Skip"].isHittable)
        XCTAssertTrue(app.buttons["Send"].exists)
        XCTAssertTrue(question.isHittable)
        keep("4.1 Sticky · largest text", of: app)
        try auditThePanel(app, under: Self.format, atTheLargestSize: true)

        let panel = question.firstMatch
        let blogPost = option("Blog post", in: app)
        for _ in 0..<6 where !blogPost.isHittable {
            panel.swipeUp()
        }
        blogPost.tap()
        XCTAssertTrue(app.buttons["Send"].isEnabled)
        XCTAssertTrue(app.buttons["Send"].isHittable)
    }
}
