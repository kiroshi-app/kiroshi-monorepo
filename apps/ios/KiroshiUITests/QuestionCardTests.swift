import XCTest

@MainActor
final class QuestionCardTests: XCTestCase {
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

    func lowestSend(in app: XCUIApplication) -> XCUIElement? {
        app.buttons.matching(NSPredicate(format: "label == 'Send'")).allElementsBoundByIndex
            .max { $0.frame.minY < $1.frame.minY }
    }

    static let artboardOrange: Set<String> = ["Now", "Needs you"]

    func auditTheCard(_ app: XCUIApplication, atTheLargestSize: Bool = false) throws {
        let titleBottom = titleBottom(in: app)
        let navigationBar = app.navigationBars.firstMatch.frame
        let tabBar = app.tabBars.firstMatch.exists ? app.tabBars.firstMatch.frame : .null
        let field = composer(in: app)
        let composerTop = field.exists ? field.frame.minY : .infinity
        try audit(app) { issue in
            guard let element = issue.element else { return issue.auditType == .textClipped }
            let isInTheTitle =
                element.frame.minY < titleBottom + GroupThreadTests.softScrollEdgeDepth
            let isInTheNavigationBar = navigationBar.contains(element.frame)
            let isUnderTheTabBar = element.frame.intersects(tabBar)
            let isTheComposer = element.frame.midY > composerTop
            let isOffScreen = element.frame.maxY > composerTop || isInTheTitle
            return switch issue.auditType {
            case .contrast:
                isInTheTitle || isUnderTheTabBar || isTheComposer || !element.isEnabled
                    || Self.artboardOrange.contains(element.label)
            case .dynamicType:
                isInTheTitle || isInTheNavigationBar || atTheLargestSize && isOffScreen
            case .textClipped: isInTheTitle || atTheLargestSize && isOffScreen
            default: false
            }
        }
    }

    func testAPickedOptionIsSentAndTheCardCollapsesToTheAnswer() throws {
        let app = launchInEnglish("questions-3.1")
        let summary = option("Summary", in: app)
        XCTAssertTrue(summary.waitForExistence(timeout: 10))
        XCTAssertTrue(text("Which format should the release notes take?", in: app).exists)
        XCTAssertFalse(app.buttons["Send"].isEnabled)
        XCTAssertTrue(app.buttons["Skip"].isEnabled)
        XCTAssertFalse(text("working…", in: app).exists)
        XCTAssertFalse(app.buttons["Stop"].exists)
        keep("3.1 Card · single select, empty", of: app)
        try auditTheCard(app)

        summary.tap()
        XCTAssertTrue(summary.isSelected)
        XCTAssertTrue(app.buttons["Send"].isEnabled)
        keep("3.2 Card · option chosen", of: app)
        try auditTheCard(app)

        app.buttons["Send"].tap()

        XCTAssertTrue(text("You answered", in: app).waitForExistence(timeout: 10))
        XCTAssertTrue(text("Summary", in: app).exists)
        XCTAssertFalse(app.buttons["Skip"].exists)
        XCTAssertTrue(app.buttons["Stop"].waitForExistence(timeout: 10))
        keep("3.6 Card · collapsed after Send", of: app)
        try auditTheCard(app)
    }

    func testOtherTypedReplacesThePickedOption() throws {
        let app = launchInEnglish("questions-3.1")
        let summary = option("Summary", in: app)
        XCTAssertTrue(summary.waitForExistence(timeout: 10))
        summary.tap()

        let other =
            app.textFields["Other answer"].exists
            ? app.textFields["Other answer"] : app.textViews["Other answer"]
        other.tap()
        other.typeText("Changelog, user-facing only")

        XCTAssertFalse(summary.isSelected)
        XCTAssertTrue(app.buttons["Send"].isEnabled)
        keep("3.4 Card · Other open, keyboard", of: app)
        try auditTheCard(app)
    }

    func testAMultiSelectHoldsSeveralOptions() throws {
        let app = launchInEnglish("questions-3.3")
        let features = option("New features", in: app)
        XCTAssertTrue(features.waitForExistence(timeout: 10))
        XCTAssertTrue(text("Choose any that apply.", in: app).exists)

        features.tap()
        option("Fixes", in: app).tap()

        XCTAssertTrue(features.isSelected)
        XCTAssertTrue(option("Fixes", in: app).isSelected)
        XCTAssertFalse(option("Breaking changes", in: app).isSelected)
        keep("3.3 Card · multi-select", of: app)
        try auditTheCard(app)
    }

    func testSeveralQuestionsGoOneByOneThenSendTogether() throws {
        let app = launchInEnglish("questions-3.5")
        XCTAssertTrue(option("Summary", in: app).waitForExistence(timeout: 10))
        option("Summary", in: app).tap()
        app.buttons["Next"].tap()

        XCTAssertTrue(text("Who reads these notes first?", in: app).waitForExistence(timeout: 5))
        option("People using the app", in: app).tap()
        keep("3.5 Card · 3 questions, 2 active, 1 answered", of: app)
        try auditTheCard(app)
        app.buttons["Next"].tap()

        XCTAssertTrue(text("How long should the notes run?", in: app).waitForExistence(timeout: 5))
        option("Under a page", in: app).tap()
        app.buttons["Send"].tap()

        XCTAssertTrue(text("You answered", in: app).waitForExistence(timeout: 10))
        XCTAssertTrue(text("People using the app", in: app).exists)
        XCTAssertTrue(text("Under a page", in: app).exists)
        keep("3.6 Card · three answers", of: app)
    }

    func testAnAnswerFromAnotherDeviceCollapsesTheCard() throws {
        let app = launchInEnglish("questions-3.7")

        XCTAssertTrue(text("Answered on another device", in: app).waitForExistence(timeout: 15))
        XCTAssertTrue(text("Full changelog", in: app).waitForExistence(timeout: 5))
        XCTAssertFalse(option("Summary", in: app).exists)
        keep("3.7 Card · answered on another device", of: app)
        try auditTheCard(app)
    }

    func testAMessageSentWhileTheQuestionWaitsIsItsAnswer() throws {
        let answer = "A summary for users, with breaking changes at the top."
        let app = launchInEnglish("questions-3.1", "-draft", answer)
        XCTAssertTrue(option("Summary", in: app).waitForExistence(timeout: 10))

        try XCTUnwrap(lowestSend(in: app)).tap()

        XCTAssertTrue(text("You answered", in: app).waitForExistence(timeout: 10))
        XCTAssertTrue(text(answer, in: app).exists)
        let card = text("You answered", in: app).frame
        let holdingTheAnswer = app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", answer)
        ).allElementsBoundByIndex
        XCTAssertTrue(holdingTheAnswer.allSatisfy { card.contains($0.frame) })
        keep("3.8 Card · answered from the composer", of: app)
        try auditTheCard(app)
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
        try auditTheCard(app)

        row.tap()

        XCTAssertTrue(option("Summary", in: app).waitForExistence(timeout: 10))
    }

    func testTheWholeQuestionShowsAtTheLargestTextSize() throws {
        let app = launchInEnglish(
            "questions-3.1", "-UIPreferredContentSizeCategoryName",
            "UICTContentSizeCategoryAccessibilityXXXL")
        let question = text("Which format should the release notes take?", in: app)
        XCTAssertTrue(question.waitForExistence(timeout: 10))
        let transcript = app.scrollViews.firstMatch
        for _ in 0..<6 where !question.isHittable {
            transcript.swipeDown()
        }
        XCTAssertTrue(question.isHittable)
        keep("3.1 Card · largest text", of: app)
        try auditTheCard(app, atTheLargestSize: true)
    }
}
