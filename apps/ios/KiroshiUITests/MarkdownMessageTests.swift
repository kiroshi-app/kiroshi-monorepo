import XCTest

@MainActor
final class MarkdownMessageTests: XCTestCase {
    static let swiftCode = """
        struct Release {
            let version = "4.2"
            // Ship once the queue is green, never on a Friday afternoon
            func notes() -> String { "Thirty-one changes since 4.1" }
        }
        """
    static let builds =
        "Platform\tSize\tStatus\nmacOS\t48 MB\tSigned\nWindows\t52 MB\tSigned\nLinux\t61 MB\tBuilding"

    override func setUp() async throws {
        continueAfterFailure = false
    }

    func testCopyOnACodeBlockCopiesTheCodeThenSaysCopied() {
        let app = launch("markdown", "-artboard", "6")
        let copy = app.buttons["Copy code"]
        XCTAssertTrue(copy.waitForExistence(timeout: 10))

        copy.tap()

        XCTAssertTrue(app.buttons["Copied"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Copy code"].waitForExistence(timeout: 10))
        XCTAssertEqual(pasted(in: app), Self.swiftCode)
    }

    func testCopyTableFromTheLongPressMenuCopiesTheTableAsTabSeparatedText() {
        let app = launch("markdown", "-artboard", "7")
        let header = app.staticTexts["Status"]
        XCTAssertTrue(header.waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Building"].exists)

        header.press(forDuration: 1)

        let copyTable = app.buttons["Copy Table"]
        XCTAssertTrue(copyTable.waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Copy Message"].exists)
        copyTable.tap()
        XCTAssertEqual(pasted(in: app), Self.builds)
    }

    func testAReplyWithEveryFamilyReadsBlockByBlockAndPassesTheAudit() throws {
        let app = launch("markdown", "-artboard", "all")
        XCTAssertTrue(app.staticTexts["Juniper, Release 4.2"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["•, Replies stream word by word"].exists)
        XCTAssertTrue(app.staticTexts["Done, Changelog drafted"].exists)
        XCTAssertFalse(app.staticTexts["Done, Changelog drafted"].isSelected)
        XCTAssertTrue(app.staticTexts["To do, App Store text reviewed"].exists)
        XCTAssertTrue(app.staticTexts["Secrets sorting"].exists)
        XCTAssertTrue(app.buttons["Copy code"].exists)

        try auditTheReply(app)
    }

    func testAReplyWithEveryFamilyHoldsAtTheLargestTextSize() throws {
        let app = launch(
            "markdown", "-artboard", "all", "-UIPreferredContentSizeCategoryName",
            "UICTContentSizeCategoryAccessibilityXXXL")
        let mermaid = app.staticTexts["mermaid"]
        XCTAssertTrue(mermaid.waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Secrets sorting"].exists)

        try auditTheReply(app)
    }

    func pasted(in app: XCUIApplication) -> String? {
        let field = composer(in: app)
        field.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 10))
        field.tap()
        let paste = app.menuItems["Paste"]
        XCTAssertTrue(paste.waitForExistence(timeout: 10))
        paste.tap()
        return field.value as? String
    }

    func auditTheReply(_ app: XCUIApplication) throws {
        let transcript = app.scrollViews.firstMatch.frame
        let top = titleBottom(in: app)
        let bottom = composer(in: app).frame.minY
        var refused: [String] = []
        try audit(app) { issue in
            guard let element = issue.element else { return issue.auditType == .textClipped }
            let isFullyShown =
                element.frame.minY >= top && element.frame.maxY <= bottom
                && transcript.contains(element.frame)
            let isAccepted =
                switch issue.auditType {
                case .textClipped, .dynamicType: !isFullyShown
                case .contrast: element.frame.minY < top
                default: false
                }
            if !isAccepted {
                refused.append("\(issue.compactDescription): \(element.label) \(element.frame)")
            }
            return true
        }
        XCTAssertEqual(refused, [])
    }
}
