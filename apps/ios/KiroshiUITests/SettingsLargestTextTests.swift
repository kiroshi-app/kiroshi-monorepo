import XCTest

@MainActor
final class SettingsLargestTextTests: XCTestCase {
    static let lines: Set<String> = [
        "sam@example.com", "Send messages to the agent", "Privacy Policy", "Terms of Use",
        "Support", "Sign out", "Delete account", DeleteAccountTests.failure,
    ]

    override func setUp() async throws {
        continueAfterFailure = false
    }

    func testEveryRowAndTheFailureLineShowWholeAndNeverUnderTheVersion() throws {
        let app = launch(
            "delete-account-failed", "-UIPreferredContentSizeCategoryName",
            "UICTContentSizeCategoryAccessibilityXXXL")
        let list = app.collectionViews.firstMatch
        let version = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Kiroshi '"))
            .firstMatch
        XCTAssertTrue(app.staticTexts["sam@example.com"].waitForExistence(timeout: 10))
        var shownWhole: Set<String> = []
        var isVersionShownWhole = false

        for _ in 0..<20 {
            let top = app.navigationBars.firstMatch.frame.maxY
            let screen = CGRect(
                x: 0, y: top, width: app.frame.width, height: app.frame.maxY - top)
            let lines = list.descendants(matching: .any)
                .matching(NSPredicate(format: "label IN %@", Self.lines))
                .allElementsBoundByIndex
            for line in lines where screen.contains(line.frame) {
                XCTAssertFalse(
                    version.exists && line.frame.intersects(version.frame),
                    "\(line.label) is under the version")
                shownWhole.insert(line.label)
            }
            isVersionShownWhole = version.exists && screen.contains(version.frame)
            if shownWhole == Self.lines && isVersionShownWhole { break }
            scrollAThirdOfTheScreen(list)
        }

        XCTAssertEqual(shownWhole, Self.lines)
        XCTAssertTrue(isVersionShownWhole)
        try audit(app)
    }

    func scrollAThirdOfTheScreen(_ list: XCUIElement) {
        let margin = list.coordinate(withNormalizedOffset: CGVector(dx: 0.02, dy: 0.7))
        margin.press(
            forDuration: 0.1,
            thenDragTo: margin.withOffset(CGVector(dx: 0, dy: -list.frame.height / 3)),
            withVelocity: .slow, thenHoldForDuration: 0.3)
    }
}
