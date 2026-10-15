import XCTest

@MainActor
final class MessageConsentTests: XCTestCase {
    static let title = "Where your messages go"
    static let draft = "Tighten the intro of the launch post, two sentences max."
    static let note = "Not sent. Your draft stays here."
    static let emptyThread = "Nothing here yet. Your first message starts the conversation."
    static let disclosure =
        "Messages you send here go to your Mac through Kiroshi’s relay. Your Mac passes them to the agent, which sends them to the model provider your Mac uses."
    static let sheetLabels = [
        title, disclosure, "Privacy Policy", "Agree and send", "Not now",
    ]
    static let emptyThreadLabels = ["Juniper", "Writer", emptyThread]

    override func setUp() async throws {
        continueAfterFailure = false
    }

    func sheetTitle(_ app: XCUIApplication) -> XCUIElement {
        app.staticTexts[Self.title]
    }

    func bubbles(_ text: String, in app: XCUIApplication) -> XCUIElementQuery {
        app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", text))
    }

    func messages(_ text: String, in app: XCUIApplication) -> Int {
        let frames = bubbles(text, in: app).allElementsBoundByIndex.map(\.frame)
        return frames.filter { frame in
            !frames.contains { $0 != frame && $0.contains(frame) }
        }.count
    }

    func draft(in app: XCUIApplication) -> String? {
        composer(in: app).value as? String
    }

    func auditTheThread(_ app: XCUIApplication) throws {
        let titleBottom = titleBottom(in: app)
        try audit(app) { issue in
            let isInTheTitle = (issue.element?.frame.minY ?? .infinity) < titleBottom
            let isTheEmptyThreadAboveTheDraft =
                [.dynamicType, .textClipped].contains(issue.auditType)
                && Self.emptyThreadLabels.contains(issue.element?.label ?? "")
            return [.contrast, .dynamicType, .textClipped].contains(issue.auditType)
                && isInTheTitle || isTheEmptyThreadAboveTheDraft
        }
    }

    func auditTheSheet(_ app: XCUIApplication) throws {
        try audit(app) { issue in
            issue.auditType == .textClipped
                && Self.sheetLabels.contains(issue.element?.label ?? "")
        }
    }

    func openTheSheet(_ app: XCUIApplication) {
        XCTAssertTrue(app.buttons["Send"].waitForExistence(timeout: 15))
        app.buttons["Send"].tap()
        XCTAssertTrue(sheetTitle(app).waitForExistence(timeout: 10))
    }

    func testTheFirstSendOpensTheSheetAndSendsNothing() throws {
        let app = launch("agreement")
        XCTAssertFalse(sheetTitle(app).exists)

        openTheSheet(app)

        XCTAssertTrue(app.buttons["Agree and send"].isHittable)
        XCTAssertTrue(app.buttons["Not now"].isHittable)
        XCTAssertTrue(app.buttons["Privacy Policy"].exists)
        XCTAssertEqual(bubbles(Self.draft, in: app).count, 0)
        XCTAssertTrue(app.staticTexts[Self.emptyThread].exists)
        try auditTheSheet(app)
    }

    func testAgreeAndSendSendsOnceAndTheNextSendDoesNotAsk() {
        let app = launch("agreement")
        openTheSheet(app)

        app.buttons["Agree and send"].tap()

        XCTAssertTrue(sheetTitle(app).waitForNonExistence(timeout: 10))
        XCTAssertTrue(bubbles(Self.draft, in: app).firstMatch.waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["Stop"].waitForNonExistence(timeout: 30))
        XCTAssertEqual(messages(Self.draft, in: app), 1)

        let next = "One more pass on the title."
        composer(in: app).tap()
        composer(in: app).typeText(next)
        app.buttons["Send"].tap()

        XCTAssertTrue(bubbles(next, in: app).firstMatch.waitForExistence(timeout: 10))
        XCTAssertFalse(sheetTitle(app).exists)
        XCTAssertEqual(messages(Self.draft, in: app), 1)
    }

    func testNotNowKeepsTheDraftAndTheSessionAndSaysSo() throws {
        let app = launch("agreement")
        openTheSheet(app)

        app.buttons["Not now"].tap()

        XCTAssertTrue(sheetTitle(app).waitForNonExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts[Self.note].waitForExistence(timeout: 5))
        XCTAssertEqual(draft(in: app), Self.draft)
        XCTAssertEqual(bubbles(Self.draft, in: app).count, 0)
        XCTAssertTrue(app.navigationBars.buttons["BackButton"].exists)
        try auditTheThread(app)

        openTheSheet(app)
        app.swipeDown(velocity: .fast)

        XCTAssertTrue(sheetTitle(app).waitForNonExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts[Self.note].exists)
        XCTAssertEqual(draft(in: app), Self.draft)
        XCTAssertEqual(bubbles(Self.draft, in: app).count, 0)
    }

    func testTurningTheSettingOffMakesTheNextSendAsk() {
        let app = launch("3.2", "-draft", Self.draft)
        XCTAssertTrue(app.buttons["Send"].waitForExistence(timeout: 15))
        app.navigationBars.buttons["BackButton"].tap()
        app.buttons["Settings"].tap()
        let toggle = app.switches["Send messages to the agent"]
        XCTAssertTrue(toggle.waitForExistence(timeout: 5))
        XCTAssertEqual(toggle.value as? String, "1")

        toggle.switches.firstMatch.tap()

        XCTAssertEqual(toggle.value as? String, "0")
        XCTAssertFalse(toggle.isEnabled)
        app.buttons["Close"].tap()
        let juniper = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Juniper'"))
            .firstMatch
        XCTAssertTrue(juniper.waitForExistence(timeout: 10))
        juniper.tap()
        openTheSheet(app)
        XCTAssertEqual(bubbles(Self.draft, in: app).count, 0)
    }

    func testTheSheetAtTheLargestTextKeepsBothActionsAndPassesTheAudit() throws {
        let app = launch(
            "agreement", "-UIPreferredContentSizeCategoryName",
            "UICTContentSizeCategoryAccessibilityXXXL")
        openTheSheet(app)

        XCTAssertTrue(app.buttons["Agree and send"].isHittable)
        XCTAssertTrue(app.buttons["Not now"].isHittable)
        add(XCTAttachment(screenshot: app.screenshot()))
        try auditTheSheet(app)
    }
}
