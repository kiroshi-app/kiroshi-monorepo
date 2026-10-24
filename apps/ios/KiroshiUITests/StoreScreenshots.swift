import XCTest

@MainActor
final class StoreScreenshots: XCTestCase {
    static let emailField = "Email"
    static let noSession = "No session on this simulator"

    override func setUp() async throws {
        continueAfterFailure = false
    }

    func setting(_ key: String) -> String? {
        ProcessInfo.processInfo.environment[key].flatMap { $0.isEmpty ? nil : $0 }
    }

    func launch() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = [
            "-disablesAnimations", "YES", "-AppleLocale", "en_US", "-AppleLanguages", "(en)",
        ]
        app.launch()
        return app
    }

    func testSignIn() {
        let app = launch()

        XCTAssertTrue(app.textFields[Self.emailField].waitForExistence(timeout: 30))
        capture("01-sign-in")
    }

    func testSignedInScreens() {
        let app = launch()
        let firstScreen = app.descendants(matching: .any).matching(
            NSPredicate(format: "label IN %@", ["Conversations", Self.emailField])
        ).firstMatch
        XCTAssertTrue(firstScreen.waitForExistence(timeout: 30))
        XCTAssertFalse(app.textFields[Self.emailField].exists, Self.noSession)
        if let space = setting("STORE_SPACE") {
            pick(space, in: app)
        }
        let conversation = conversationRow(in: app)
        XCTAssertTrue(conversation.waitForExistence(timeout: 60))
        capture("02-conversations")

        conversation.tap()
        XCTAssertTrue(app.navigationBars.buttons["BackButton"].waitForExistence(timeout: 10))
        XCTAssertTrue(
            app.descendants(matching: .any)["Loading the conversation"]
                .waitForNonExistence(timeout: 60))
        capture("03-thread")

        app.navigationBars.buttons["BackButton"].tap()
        let missionsTab = app.tabBars.buttons["Missions"]
        XCTAssertTrue(missionsTab.waitForExistence(timeout: 10))
        missionsTab.tap()
        XCTAssertTrue(missionsTab.wait(for: \.isSelected, toEqual: true, timeout: 10))
        XCTAssertTrue(
            app.staticTexts.matching(
                NSPredicate(format: "label IN %@", ["Needs you", "Working", "Review"])
            ).firstMatch.waitForExistence(timeout: 60))
        capture("04-missions")

        app.navigationBars.buttons["Settings"].tap()
        XCTAssertTrue(app.collectionViews.buttons["Sign out"].waitForExistence(timeout: 10))
        capture("05-settings")
    }

    func pick(_ space: String, in app: XCUIApplication) {
        let spaceButton = app.navigationBars.buttons["Space"]
        XCTAssertTrue(spaceButton.waitForExistence(timeout: 30))
        guard (spaceButton.value as? String)?.hasPrefix(space) != true else { return }
        spaceButton.tap()
        let choice = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", space))
            .firstMatch
        XCTAssertTrue(choice.waitForExistence(timeout: 10), "No Space named \(space)")
        choice.tap()
    }

    func conversationRow(in app: XCUIApplication) -> XCUIElement {
        let rows = app.collectionViews.buttons
        guard let name = setting("STORE_CONVERSATION") else {
            return rows.matching(NSPredicate(format: "value MATCHES '.+'")).firstMatch
        }
        return rows.matching(NSPredicate(format: "label BEGINSWITH %@", name)).firstMatch
    }

    func capture(_ name: String) {
        _ = XCTWaiter.wait(for: [XCTestExpectation(description: "settle")], timeout: 1)
        let screenshot = XCUIScreen.main.screenshot().pngRepresentation
        let attachment = XCTAttachment(data: screenshot, uniformTypeIdentifier: "public.png")
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
