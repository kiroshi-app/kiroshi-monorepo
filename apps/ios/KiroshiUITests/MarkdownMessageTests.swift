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
    static let fittingCode = "flowchart LR\n  pr --> main\n  main --> tag"
    static let builds =
        "Platform\tSize\tStatus\nmacOS\t48 MB\tSigned\nWindows\t52 MB\tSigned\nLinux\t61 MB\tBuilding"

    static let buildTimes =
        "Build\tSize\tTime\n4.2.0\t38 MB\t6 min\n4.1.3\t37 MB\t5 min\n4.1.2\t41 MB\t9 min"

    override func setUp() async throws {
        continueAfterFailure = false
    }

    func testCopyOnACodeBlockCopiesTheCodeThenSaysCopied() {
        let app = launch("markdown", "-artboard", "6")
        let copy = app.buttons["Copy code"]
        XCTAssertTrue(copy.waitForExistence(timeout: 10))

        copy.tap()

        let copied = app.buttons["Copied"]
        XCTAssertTrue(copied.waitForExistence(timeout: 5))
        XCTAssertFalse(copied.isSelected)
        XCTAssertTrue(app.buttons["Copy code"].waitForExistence(timeout: 10))
        XCTAssertEqual(pasted(in: app), Self.swiftCode)
    }

    func testEveryReplyReadsItsAuthorOnceOnItsFirstBlock() {
        for (artboard, openings) in [
            ("1", ["Juniper, Release notes, 4.2"]),
            ("8", ["Juniper, @Atlas can you take the desktop half?"]),
            ("group-openings", ["Juniper, Done, Changelog drafted", "Juniper, swift"]),
        ] {
            let app = launch("markdown", "-artboard", artboard)
            let opening = app.staticTexts.matching(
                NSPredicate(format: "label BEGINSWITH %@", openings[0])
            ).firstMatch
            XCTAssertTrue(opening.waitForExistence(timeout: 10), artboard)
            let read = authoredLabels(in: app)
            XCTAssertEqual(read.count, openings.count, "\(artboard) \(read)")
            for (label, start) in zip(read, openings) {
                XCTAssertTrue(label.hasPrefix(start), "\(artboard) \(label)")
            }
            let name = app.staticTexts["Juniper"]
            XCTAssertTrue(app.windows.firstMatch.frame.contains(name.frame), artboard)
            XCTAssertFalse(name.isHittable, artboard)
            XCTAssertTrue(opening.isHittable, artboard)
        }
    }

    func testAReplyOpeningWithAListCarriesTheTimeOnItsFirstItem() {
        let app = launchInEnglish("markdown", "-artboard", "3")
        let firstTask = app.staticTexts["Done, Changelog drafted"]
        XCTAssertTrue(firstTask.waitForExistence(timeout: 10))

        XCTAssertEqual(firstTask.value as? String, "9:41\u{202F}AM")
        XCTAssertEqual(app.staticTexts["Done, Screenshots updated"].value as? String ?? "", "")
    }

    func testACodeCardReadsItsLanguageBeforeCopyCode() {
        for (artboard, header) in [
            ("6", ["swift", "Copy code"]), ("all", ["swift", "Copy code", "mermaid", "Copy code"]),
        ] {
            let app = launch("markdown", "-artboard", artboard)
            XCTAssertTrue(app.buttons["Copy code"].firstMatch.waitForExistence(timeout: 10))

            let read = labels(in: app).filter { ["swift", "mermaid", "Copy code"].contains($0) }
            XCTAssertEqual(read, header, artboard)
        }
    }

    func testCopyOnATableCopiesTheTableThenSaysCopied() {
        let app = launch("markdown", "-artboard", "tables")
        XCTAssertTrue(app.staticTexts["The last three builds:"].waitForExistence(timeout: 10))
        let copy = app.buttons.matching(identifier: "Copy table").firstMatch
        XCTAssertTrue(copy.exists)

        copy.tap()

        XCTAssertTrue(app.buttons["Copied"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Copied"].waitForNonExistence(timeout: 10))
        XCTAssertEqual(app.buttons.matching(identifier: "Copy table").count, 2)
        XCTAssertEqual(pasted(in: app), Self.buildTimes)
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

    func testCopyMessageFromALaterBubbleCopiesTheWholeMessage() {
        let app = launch("markdown", "-artboard", "all")
        let header = app.staticTexts["Status"]
        XCTAssertTrue(header.waitForExistence(timeout: 10))

        header.press(forDuration: 1)

        let copyMessage = app.buttons["Copy Message"]
        XCTAssertTrue(copyMessage.waitForExistence(timeout: 5))
        copyMessage.tap()
        let pasted = pasted(in: app) ?? ""
        XCTAssertTrue(pasted.hasPrefix("## Release 4.2\nThe build is **green**"), pasted)
        XCTAssertTrue(pasted.hasSuffix("main --> tag[Tag v4.2]\n```"), pasted)
    }

    func testInlineCodeReadsTheHyphensTheCompanionWroteAndKeepsTheLinkBesideIt() {
        for size in ["UICTContentSizeCategoryL", "UICTContentSizeCategoryAccessibilityXXXL"] {
            let app = launch(
                "markdown", "-artboard", "copied-code", "-UIPreferredContentSizeCategoryName", size)
            let linked = app.staticTexts["Read the push guide before --force-with-lease."]
            XCTAssertTrue(linked.waitForExistence(timeout: 10), size)

            XCTAssertTrue(linked.links["push guide"].exists, size)
            XCTAssertTrue(app.staticTexts["Push it with --force-with-lease."].exists, size)
            XCTAssertTrue(app.staticTexts["--force-with-lease"].exists, size)
        }
    }

    func testAReplyWithEveryFamilyReadsBlockByBlockAndPassesTheAudit() throws {
        let app = launch("markdown", "-artboard", "all")
        XCTAssertTrue(app.staticTexts["Juniper, Release 4.2"].waitForExistence(timeout: 10))
        XCTAssertEqual(authoredLabels(in: app), ["Juniper, Release 4.2"])
        XCTAssertTrue(app.staticTexts["What changed in the thread:"].exists)
        XCTAssertFalse(app.staticTexts["Juniper, What changed in the thread:"].exists)
        XCTAssertTrue(app.staticTexts["•, Replies stream word by word"].exists)
        XCTAssertTrue(app.staticTexts["Done, Changelog drafted"].exists)
        XCTAssertFalse(app.staticTexts["Done, Changelog drafted"].isSelected)
        XCTAssertTrue(app.staticTexts["To do, App Store text reviewed"].exists)
        XCTAssertTrue(app.staticTexts["Secrets sorting"].exists)
        XCTAssertTrue(app.buttons["Copy code"].exists)
        XCTAssertEqual(app.staticTexts.matching(identifier: "3 rows").count, 2)
        XCTAssertEqual(app.buttons.matching(identifier: "Copy table").count, 2)

        try auditTheReply(app)
    }

    func testACodeCardWhoseLinesFitPassesTheContrastAudit() throws {
        let app = launch("markdown", "-artboard", "fitting-code")
        let code = app.staticTexts[Self.fittingCode]
        XCTAssertTrue(code.waitForExistence(timeout: 10))
        XCTAssertLessThanOrEqual(code.frame.maxX, app.buttons["Copy code"].frame.maxX)

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

    func testAReplyWithEveryFamilyKeepsItsCardsInsideTheThreadAtTheLargestTextSize() {
        let app = launch(
            "markdown", "-artboard", "all", "-UIPreferredContentSizeCategoryName",
            "UICTContentSizeCategoryAccessibilityXXXL")
        let transcript = app.scrollViews.firstMatch
        let heading = transcript.staticTexts["Juniper, Release 4.2"]
        XCTAssertTrue(heading.waitForExistence(timeout: 10))
        let name = transcript.staticTexts.matching(identifier: "Juniper").firstMatch

        XCTAssertEqual(heading.frame.minY, name.frame.maxY, accuracy: 20)
        let thread = app.windows.firstMatch.frame.insetBy(dx: 16, dy: 0)
        let cards = transcript.scrollViews.allElementsBoundByIndex
        XCTAssertEqual(cards.count, 4)
        for card in cards {
            XCTAssertGreaterThanOrEqual(card.frame.minX, thread.minX, "\(card.frame)")
            XCTAssertLessThanOrEqual(card.frame.maxX, thread.maxX, "\(card.frame)")
        }
    }

    func labels(in app: XCUIApplication) -> [String] {
        guard let transcript = try? app.scrollViews.firstMatch.snapshot() else { return [] }
        return readingOrder(of: transcript)
    }

    func authoredLabels(in app: XCUIApplication) -> [String] {
        labels(in: app).filter { $0.hasPrefix("Juniper, ") }
    }

    func readingOrder(of element: XCUIElementSnapshot) -> [String] {
        let label = element.label.isEmpty ? [] : [element.label]
        return label + element.children.flatMap(readingOrder)
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
            // SwiftUI samples a horizontally scrolling Text at its natural width, beyond the clip.
            let runsPastTheTranscript =
                element.frame.minX < transcript.minX || element.frame.maxX > transcript.maxX
            let isAccepted =
                switch issue.auditType {
                case .textClipped, .dynamicType: !isFullyShown
                case .contrast: element.frame.minY < top || runsPastTheTranscript
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
