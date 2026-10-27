import XCTest

@MainActor
final class SpaceSelectorTests: XCTestCase {
    static let colours = ["-spaceColours", "blue,null,purple"]

    override func setUp() async throws {
        continueAfterFailure = false
    }

    func openTheMenu(of space: String, in app: XCUIApplication) {
        let button = app.navigationBars[space].buttons["Space"]
        XCTAssertTrue(button.waitForExistence(timeout: 10))
        button.tap()
    }

    func keep(_ name: String) {
        let screenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        screenshot.name = name
        screenshot.lifetime = .keepAlways
        add(screenshot)
    }

    func testEachRowNamesItsSpaceAndItsHost() throws {
        for appearance in [Appearance.light, .dark] {
            let app = try launch("2.1", in: appearance, Self.colours[0], Self.colours[1])
            openTheMenu(of: "Studio", in: app)

            XCTAssertTrue(app.buttons["Studio, Shared"].waitForExistence(timeout: 5))
            XCTAssertTrue(app.buttons["Home lab, Online"].exists)
            XCTAssertTrue(app.buttons["Side project, Not connected"].exists)
            keep("Space selector, \(appearance)")
            try audit(app)
            app.terminate()
        }
    }

    func testTheSpaceWhoseHostHasNotAnsweredIsConnecting() throws {
        for appearance in [Appearance.light, .dark] {
            let app = try launch(
                "5.1", in: appearance, Self.colours[0], Self.colours[1], "-hostSilent", "YES")
            openTheMenu(of: "Studio", in: app)

            XCTAssertTrue(app.buttons["Studio, Connecting…"].waitForExistence(timeout: 5))
            XCTAssertTrue(app.buttons["Home lab, Online"].exists)
            keep("Space selector connecting, \(appearance)")
            try audit(app)
            app.terminate()
        }
    }

    func testPersonalKeepsItsNoColourAvatarBesideTheInvitation() throws {
        for appearance in [Appearance.light, .dark] {
            let app = try launch("4", in: appearance, "-AppleLocale", "en_US")
            openTheMenu(of: "Personal", in: app)

            XCTAssertTrue(app.buttons["Personal, Shared"].waitForExistence(timeout: 5))
            XCTAssertTrue(
                app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Studio'")).firstMatch
                    .exists)
            keep("Space selector with Personal, \(appearance)")
            app.terminate()
        }
    }
}
