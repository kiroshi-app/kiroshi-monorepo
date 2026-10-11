import XCTest

@MainActor
final class GroupThreadTests: XCTestCase {
    static let transcriptScrolledAwayAtLargerSizes: Set<String> = [
        "Today 9:02",
        "Can you two get 0.42 out today?",
        "Juniper, The changelog is merged.",
        "Juniper, I’m tagging 0.42 next.",
    ]

    override func setUp() async throws {
        continueAfterFailure = false
    }

    func element(_ label: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", label))
            .firstMatch
    }

    func composer(in app: XCUIApplication) -> XCUIElement {
        let field = app.textViews.firstMatch
        return field.exists ? field : app.textFields.firstMatch
    }

    func auditTheGroup(_ app: XCUIApplication) throws {
        let navigationBar = app.navigationBars["Release crew"].frame
        try audit(app) { issue in
            guard issue.auditType == .dynamicType, let element = issue.element else {
                return false
            }
            return element.frame.intersects(navigationBar)
                || Self.transcriptScrolledAwayAtLargerSizes.contains(element.label)
        }
    }

    func testAGroupNamesEachAuthorAndSendsAMentionToThePickedCompanion() throws {
        let app = launch("group-thread")
        XCTAssertTrue(
            element("Juniper, The changelog is merged.", in: app).waitForExistence(timeout: 10))
        XCTAssertTrue(element("Juniper, I’m tagging 0.42 next.", in: app).exists)
        XCTAssertTrue(
            element("Atlas, I’ll split the onboarding ticket once the tag is out.", in: app).exists)
        XCTAssertTrue(element("Atlas, @Juniper ping me when it’s tagged.", in: app).exists)
        XCTAssertTrue(app.navigationBars["Release crew"].exists)
        try auditTheGroup(app)

        let field = composer(in: app)
        field.tap()
        field.typeText("@at")
        let atlas = app.buttons["Mention Atlas"]
        XCTAssertTrue(atlas.waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["Mention Juniper"].exists)
        atlas.tap()
        XCTAssertEqual(field.value as? String, "@Atlas ")
        field.typeText("is the tag out?")
        app.buttons["Send"].tap()

        XCTAssertTrue(element("@Atlas is the tag out?", in: app).waitForExistence(timeout: 5))
        XCTAssertTrue(element("Atlas, On it.", in: app).waitForExistence(timeout: 10))
        XCTAssertFalse(element("Juniper, On it.", in: app).exists)
    }

    func testTheMentionPickerPassesTheAudit() throws {
        let app = launch("group-mention")
        XCTAssertTrue(app.buttons["Mention Juniper"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["Mention Atlas"].exists)

        try auditTheGroup(app)
    }

    func testTwoCompanionsAtWorkAreBothNamed() throws {
        let app = launch("group-working")
        XCTAssertTrue(
            app.staticTexts["Juniper and Atlas are working…"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["Stop"].exists)

        try auditTheGroup(app)
    }
}
