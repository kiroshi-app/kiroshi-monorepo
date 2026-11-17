import XCTest

@MainActor
final class ThreadSendingTests: XCTestCase {
    let sent = "Ship the notes for 0.43."

    override func setUp() async throws {
        continueAfterFailure = false
    }

    func text(_ label: String, in app: XCUIApplication) -> XCUIElement {
        app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", label)).firstMatch
    }

    func drag(_ app: XCUIApplication, down points: CGFloat) {
        let start = app.windows.firstMatch.coordinate(
            withNormalizedOffset: CGVector(dx: 0.5, dy: 0.3))
        start.press(
            forDuration: 0.1, thenDragTo: start.withOffset(CGVector(dx: 0, dy: points)),
            withVelocity: .slow, thenHoldForDuration: 0.5)
    }

    func assertInView(
        _ bubble: XCUIElement, in app: XCUIApplication,
        file: StaticString = #filePath, line: UInt = #line
    ) {
        XCTAssertTrue(bubble.isHittable, file: file, line: line)
        XCTAssertGreaterThanOrEqual(bubble.frame.minY, titleBottom(in: app), file: file, line: line)
        XCTAssertLessThanOrEqual(
            bubble.frame.maxY, composer(in: app).frame.minY, file: file, line: line)
    }

    func staticTexts(in snapshot: any XCUIElementSnapshot) -> [any XCUIElementSnapshot] {
        (snapshot.elementType == .staticText ? [snapshot] : [])
            + snapshot.children.flatMap(staticTexts)
    }

    func waitForTheReplyToEnd(below sent: String, in app: XCUIApplication) {
        let isTheReplyWhole = NSPredicate { [self] _, _ in
            let texts = (try? app.snapshot()).map(staticTexts) ?? []
            guard let bubble = texts.last(where: { $0.label.contains(sent) }) else { return false }
            return texts.contains {
                $0.label.contains("Section 12 of the notes") && $0.frame.minY > bubble.frame.maxY
            }
        }
        wait(for: [expectation(for: isTheReplyWhole, evaluatedWith: nil)], timeout: 30)
        XCTAssertTrue(app.buttons["Stop"].waitForNonExistence(timeout: 30))
    }

    func sectionsShown(in app: XCUIApplication) throws -> Int {
        try staticTexts(in: app.snapshot()).reduce(0) {
            $0 + $1.label.components(separatedBy: " of the notes ").count - 1
        }
    }

    func waitForTheReplyToGrow(beyond shown: Int, in app: XCUIApplication) {
        let hasGrown = NSPredicate { [self] _, _ in
            ((try? sectionsShown(in: app)) ?? 0) > shown
        }
        wait(for: [expectation(for: hasGrown, evaluatedWith: nil)], timeout: 30)
    }

    func waitForTheReplyToRunBelowTheComposer(in app: XCUIApplication) {
        let isBelow = NSPredicate { [self] _, _ in
            let composerTop = composer(in: app).frame.minY
            let texts = (try? app.snapshot()).map(staticTexts) ?? []
            return texts.contains {
                $0.label.contains(" of the notes ") && $0.frame.minY > composerTop
            }
        }
        wait(for: [expectation(for: isBelow, evaluatedWith: nil)], timeout: 30)
    }

    func sendAndReadTheLongReply(raisingTheKeyboard isKeyboardUp: Bool) {
        let app = launch("long-reply", "-draft", sent)
        XCTAssertTrue(text("That’s the whole checklist", in: app).waitForExistence(timeout: 10))
        if isKeyboardUp {
            composer(in: app).tap()
            XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 10))
        }

        app.buttons["Send"].tap()

        let lastSection = text("Section 12 of the notes", in: app)
        XCTAssertTrue(lastSection.waitForExistence(timeout: 30))
        XCTAssertTrue(app.buttons["Stop"].waitForNonExistence(timeout: 30))
        let firstSection = text("Section 1 of the notes", in: app)
        XCTAssertGreaterThan(
            lastSection.frame.maxY - firstSection.frame.minY, app.windows.firstMatch.frame.height)
        assertInView(text(sent, in: app), in: app)
    }

    func testTheSentBubbleStaysInViewWhileALongReplyStreamsWithTheKeyboardDown() {
        sendAndReadTheLongReply(raisingTheKeyboard: false)
    }

    func testTheSentBubbleStaysInViewWhileALongReplyStreamsWithTheKeyboardUp() {
        sendAndReadTheLongReply(raisingTheKeyboard: true)
    }

    func testSomeoneWhoScrollsUpWhileTheReplyStreamsStaysWhereTheyAre() throws {
        let app = launch("long-reply", "-draft", sent, "-replyUntilStopped", "YES")
        XCTAssertTrue(text("That’s the whole checklist", in: app).waitForExistence(timeout: 10))
        app.buttons["Send"].tap()
        waitForTheReplyToRunBelowTheComposer(in: app)
        let bubble = text(sent, in: app)
        XCTAssertTrue(bubble.isHittable)
        let heldAt = bubble.frame

        drag(app, down: 150)

        XCTAssertTrue(app.buttons["Stop"].exists)
        XCTAssertTrue(bubble.isHittable)
        let readAt = bubble.frame
        XCTAssertGreaterThan(readAt.minY, heldAt.minY)
        waitForTheReplyToGrow(beyond: try sectionsShown(in: app), in: app)
        XCTAssertEqual(bubble.frame, readAt)

        app.buttons["Stop"].tap()

        XCTAssertTrue(app.buttons["Stop"].waitForNonExistence(timeout: 30))
        XCTAssertEqual(bubble.frame, readAt)
    }

    func testSendingWhileReadingOlderMessagesBringsTheSentBubbleIntoView() {
        let app = launch("long-reply", "-draft", sent)
        XCTAssertTrue(text("That’s the whole checklist", in: app).waitForExistence(timeout: 10))
        drag(app, down: 400)
        drag(app, down: 400)
        let last = text("That’s the whole checklist", in: app)
        XCTAssertFalse(last.exists && last.isHittable)

        app.buttons["Send"].tap()

        let bubble = text(sent, in: app)
        XCTAssertTrue(bubble.waitForExistence(timeout: 10))
        assertInView(bubble, in: app)
        waitForTheReplyToEnd(below: sent, in: app)
        assertInView(bubble, in: app)
    }

    func testTheNextSendAfterAHeldReplyBringsTheThreadBackToTheBottom() {
        let app = launch("long-reply", "-draft", sent)
        XCTAssertTrue(text("That’s the whole checklist", in: app).waitForExistence(timeout: 10))
        app.buttons["Send"].tap()
        waitForTheReplyToEnd(below: sent, in: app)
        assertInView(text(sent, in: app), in: app)
        let closing = text("They’re waiting for your read.", in: app)
        XCTAssertFalse(closing.exists && closing.isHittable)

        composer(in: app).tap()
        composer(in: app).typeText("And the tag?")
        app.buttons["Send"].tap()

        let next = text("And the tag?", in: app)
        XCTAssertTrue(next.waitForExistence(timeout: 10))
        assertInView(next, in: app)
        waitForTheReplyToEnd(below: "And the tag?", in: app)
        assertInView(next, in: app)
    }
}
