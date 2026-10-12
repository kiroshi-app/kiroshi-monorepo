import XCTest

@MainActor
final class ThreadHeaderTests: XCTestCase {
    static let longCompanion = "Juniper Wilhelmina Fitzgerald-Montgomery"
    static let longGroup = "Release crew for 0.42, the onboarding split and the settings sheet"

    func header(_ label: String, in app: XCUIApplication) -> XCUIElement {
        app.navigationBars.staticTexts.matching(NSPredicate(format: "label == %@", label))
            .firstMatch
    }

    func open(_ name: String, in app: XCUIApplication) {
        let row = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", name))
            .firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 15))
        row.tap()
    }

    func titleFrame(of fixture: String, titled title: String) -> (
        title: CGRect, back: CGRect, screen: CGRect
    ) {
        let app = launch(fixture)
        let lines = app.navigationBars.staticTexts.matching(
            NSPredicate(format: "label == %@", title))
        XCTAssertTrue(lines.firstMatch.waitForExistence(timeout: 15), fixture)
        let innermost = lines.allElementsBoundByIndex.last ?? lines.firstMatch
        let frames = (innermost.frame, app.navigationBars.buttons["BackButton"].frame, app.frame)
        app.terminate()
        return frames
    }

    func testAConversationHeaderShowsTheCompanionsNameThenItsTitle() {
        let app = launch("conversations")

        open("Juniper", in: app)

        XCTAssertTrue(header("Juniper, Writer", in: app).waitForExistence(timeout: 10))
        app.navigationBars.buttons["BackButton"].tap()
        open("Shoto", in: app)
        XCTAssertTrue(header("Shoto", in: app).waitForExistence(timeout: 10))
        XCTAssertFalse(
            app.navigationBars.staticTexts.matching(
                NSPredicate(format: "label BEGINSWITH 'Shoto,'")
            )
            .firstMatch.exists)
        app.navigationBars.buttons["BackButton"].tap()
        open("Release crew", in: app)
        XCTAssertTrue(header("Release crew", in: app).waitForExistence(timeout: 10))
    }

    func testAMissionHeaderShowsTheTicketCompanionAndTitleOverTheMission() {
        let app = launch("5.1")
        app.tabBars.buttons["Missions"].tap()

        open("Split the onboarding flow", in: app)

        XCTAssertTrue(
            header("OPE-212 · Atlas · Planner, Split the onboarding flow", in: app)
                .waitForExistence(timeout: 10))
    }

    func testASoloAGroupAndAMissionOpenTheSameHeaderAndComposer() {
        let subjects = [
            ("3.1", "Juniper, Writer", "Message Juniper"),
            ("group-thread", "Release crew", "Message Release crew"),
            ("5.2", "OPE-212 · Atlas · Planner, Split the onboarding flow", "Answer this mission…"),
        ]
        for (fixture, label, placeholder) in subjects {
            let app = launch(fixture)
            let header = header(label, in: app)
            XCTAssertTrue(header.waitForExistence(timeout: 15), fixture)
            XCTAssertEqual(header.frame.midX, app.frame.midX, accuracy: 1, fixture)
            XCTAssertTrue(app.navigationBars.buttons["BackButton"].exists, fixture)
            XCTAssertFalse(app.tabBars.firstMatch.isHittable, fixture)

            let field = composer(in: app)
            XCTAssertTrue(field.exists, fixture)
            XCTAssertEqual(field.placeholderValue, placeholder, fixture)
            let attach = app.buttons["Attach"]
            XCTAssertTrue(attach.isEnabled, fixture)
            XCTAssertLessThan(attach.frame.maxX, field.frame.minX, fixture)
            attach.tap()
            XCTAssertTrue(app.buttons["Photo Library"].waitForExistence(timeout: 5), fixture)
            XCTAssertTrue(app.buttons["Choose File"].exists, fixture)
            app.terminate()
        }
    }

    func testALongNameStaysOnOneLineCentredInTheBar() {
        let names = [
            ("3.1", "Juniper", "long-name", Self.longCompanion),
            ("group-thread", "Release crew", "long-group", Self.longGroup),
        ]
        for (shortFixture, shortTitle, longFixture, longTitle) in names {
            let short = titleFrame(of: shortFixture, titled: shortTitle)
            let long = titleFrame(of: longFixture, titled: longTitle)

            XCTAssertEqual(long.title.height, short.title.height, accuracy: 0.5, longFixture)
            XCTAssertEqual(long.title.midX, long.screen.midX, accuracy: 1, longFixture)
            XCTAssertEqual(short.title.midX, short.screen.midX, accuracy: 1, shortFixture)
            XCTAssertGreaterThan(long.title.minX, long.back.maxX, longFixture)
            XCTAssertGreaterThan(long.title.width, short.title.width, longFixture)
        }
    }
}
