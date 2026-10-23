import UIKit
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
        let segments = app.otherElements["Questions"]
        if segments.exists {
            return segments.frame.minY
        }
        guard let question else { return .infinity }
        return text(question, in: app).frame.minY
    }

    func auditThePanel(
        _ app: XCUIApplication, under question: String? = nil, atTheLargestSize: Bool = false,
        withTheKeyboard: Bool = false, isScrolledUp: Bool = false, neverClipping: [String] = []
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
        let actionsTop =
            ["Skip", "Next", "Send"].map { app.buttons[$0] }.filter(\.exists).map(\.frame.minY)
            .min() ?? .infinity
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
            let isCutByTheActions =
                element.frame.minY < actionsTop && element.frame.maxY > actionsTop
            if issue.auditType == .textClipped && neverClipping.contains(element.label) {
                return false
            }
            return switch issue.auditType {
            case .contrast:
                isInTheTitle || isUnderTheTabBar || isTheComposer || isBehindThePanel
                    || isTheThreadUnderThePanel || isUnderTheLatestButton || !element.isEnabled
                    || atTheLargestSize && isCutByTheActions
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

    func panelTop(above firstOption: XCUIElement) -> CGFloat {
        firstOption.frame.minY - Self.headingHeight
    }

    static let headingHeight: CGFloat = 20 + 18 + 2 + 22 + 12
    static let artboardPanelTop: CGFloat = 445

    func assertThePanelSitsOnTheArtboard(_ app: XCUIApplication, _ artboard: String) {
        let top = Self.artboardPanelTop
        let options: CGFloat = 3 * 65 + 2 * 8
        XCTAssertEqual(
            panelTop(above: option("Summary", in: app)), top, accuracy: 0.5, artboard)
        XCTAssertEqual(
            app.staticTexts["Format"].frame.midY, top + 20 + 9, accuracy: 0.5, artboard)
        XCTAssertEqual(
            text(Self.format, in: app).frame.midY, top + 20 + 18 + 2 + 11, accuracy: 0.5,
            artboard)
        XCTAssertEqual(
            other(in: app).frame.midY, top + Self.headingHeight + options + 12 + 45 / 2,
            accuracy: 0.5, artboard)
    }
    static let format = "Which format should the release notes take?"
    static let suggestionBar: CGFloat = 44

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

    func testPickingOptionsAfterATextSizeChangeLeavesTheThreadWhereItWas() throws {
        let app = launchInEnglish("questions-4.1")
        let summary = option("Summary", in: app)
        XCTAssertTrue(summary.waitForExistence(timeout: 10))
        let lastMessage = text("One thing before I write.", in: app)
        let shown = lastMessage.frame
        let field = other(in: app).frame.height
        try auditThePanel(app, under: Self.format)

        summary.tap()
        XCTAssertEqual(lastMessage.frame, shown)
        XCTAssertEqual(other(in: app).frame.height, field)

        option("Full changelog", in: app).tap()
        XCTAssertEqual(lastMessage.frame, shown)
        XCTAssertEqual(other(in: app).frame.height, field)
    }

    func testThePanelKeepsTheArtboardMetrics() throws {
        let app = launchInEnglish("questions-4.1")
        let summary = option("Summary", in: app)
        XCTAssertTrue(summary.waitForExistence(timeout: 10))
        let send = app.buttons["Send"].frame

        assertThePanelSitsOnTheArtboard(app, "4.1")
        XCTAssertEqual(summary.frame.height, 65, accuracy: 0.5)
        XCTAssertEqual(other(in: app).frame.height, 22, accuracy: 0.5)
        XCTAssertEqual(send.height, 44, accuracy: 0.5)
        XCTAssertEqual(send.width, 85, accuracy: 1)
        XCTAssertEqual(app.frame.maxY - send.maxY, 29, accuracy: 0.5)

        summary.tap()

        XCTAssertTrue(summary.isSelected)
        assertThePanelSitsOnTheArtboard(app, "4.2")
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
        let keyboardTop = app.keyboards.firstMatch.frame.minY - Self.suggestionBar
        XCTAssertEqual(keyboardTop - send.frame.maxY, 14, accuracy: 0.5)
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
        let format = app.buttons["Format"]
        XCTAssertEqual(format.value as? String, "Answered")
        XCTAssertFalse(format.isSelected)
        XCTAssertTrue(app.buttons["Audience"].isSelected)
        XCTAssertEqual(app.otherElements["Questions"].frame.height, 36, accuracy: 0.5)
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

    static let headers = ["Format", "Audience", "Length"]

    func oneLineWidth(of label: String, at category: UIContentSizeCategory) -> CGFloat {
        let traits = UITraitCollection(preferredContentSizeCategory: category)
        let size = UIFont.preferredFont(forTextStyle: .subheadline, compatibleWith: traits)
            .pointSize
        let font = UIFont.systemFont(ofSize: size, weight: .semibold)
        return (label as NSString).size(withAttributes: [.font: font]).width
    }

    func dragThePanel(by distance: CGFloat, in app: XCUIApplication) {
        let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.6))
        start.press(forDuration: 0.1, thenDragTo: start.withOffset(CGVector(dx: 0, dy: distance)))
    }

    func testTheSegmentLabelsStayWholeAtTheLargestTextSize() throws {
        let app = launchInEnglish(
            "questions-4.5", "-UIPreferredContentSizeCategoryName",
            "UICTContentSizeCategoryAccessibilityXXXL")
        let question = text(Self.format, in: app)
        XCTAssertTrue(question.waitForExistence(timeout: 10))
        let summary = option("Summary", in: app)
        let actionsTop = app.buttons["Skip"].frame.minY
        for _ in 0..<6 where summary.frame.maxY > actionsTop {
            dragThePanel(by: -200, in: app)
        }
        summary.tap()
        app.buttons["Next"].tap()
        XCTAssertTrue(text("Who reads these notes first?", in: app).waitForExistence(timeout: 5))
        let segments = app.otherElements["Questions"]
        var segmentsTop = -CGFloat.infinity
        for _ in 0..<6 where segments.frame.minY != segmentsTop {
            segmentsTop = segments.frame.minY
            dragThePanel(by: 300, in: app)
        }

        XCTAssertTrue(app.buttons["Audience"].isSelected)
        XCTAssertEqual(app.buttons["Format"].value as? String, "Answered")
        for header in Self.headers {
            let segment = app.buttons[header].frame
            XCTAssertTrue(segments.frame.contains(segment), header)
            XCTAssertGreaterThanOrEqual(
                segment.width - 2 * 8,
                oneLineWidth(of: header, at: .accessibilityExtraExtraLarge), header)
        }
        keep("4.5 Sticky · largest text", of: app)
        try auditThePanel(app, atTheLargestSize: true, neverClipping: Self.headers)
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
        XCTAssertEqual(latest.frame.size, CGSize(width: 44, height: 44))
        let panelTop = panelTop(above: option("Summary", in: app))
        XCTAssertEqual(panelTop - latest.frame.maxY, 10, accuracy: 1)
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
