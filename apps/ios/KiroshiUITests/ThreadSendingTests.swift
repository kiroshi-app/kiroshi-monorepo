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
        let bubble = text(sent, in: app)
        let firstSection = text("Section 1 of the notes", in: app)
        XCTAssertGreaterThan(
            lastSection.frame.maxY - firstSection.frame.minY, app.windows.firstMatch.frame.height)
        XCTAssertTrue(bubble.isHittable)
        XCTAssertGreaterThanOrEqual(bubble.frame.minY, titleBottom(in: app))
        XCTAssertLessThanOrEqual(bubble.frame.maxY, composer(in: app).frame.minY)
    }

    func testTheSentBubbleStaysInViewWhileALongReplyStreamsWithTheKeyboardDown() {
        sendAndReadTheLongReply(raisingTheKeyboard: false)
    }

    func testTheSentBubbleStaysInViewWhileALongReplyStreamsWithTheKeyboardUp() {
        sendAndReadTheLongReply(raisingTheKeyboard: true)
    }

    func testSomeoneReadingOlderMessagesStaysWhereTheyAreWhileTheReplyStreams() {
        let app = launch("long-reply", "-draft", sent)
        XCTAssertTrue(text("That’s the whole checklist", in: app).waitForExistence(timeout: 10))
        app.scrollViews.firstMatch.swipeDown()
        let read = text("Step 20 ", in: app)
        XCTAssertTrue(read.isHittable)
        let readAt = read.frame

        app.buttons["Send"].tap()

        XCTAssertTrue(app.buttons["Stop"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["Stop"].waitForNonExistence(timeout: 30))
        XCTAssertEqual(read.frame, readAt)
    }
}
