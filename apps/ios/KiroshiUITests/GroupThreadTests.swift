import XCTest

@MainActor
final class GroupThreadTests: XCTestCase {
    static let softScrollEdgeDepth: CGFloat = 16

    override func setUp() async throws {
        continueAfterFailure = false
    }

    func element(_ label: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", label))
            .firstMatch
    }

    func auditTheGroup(_ app: XCUIApplication, onScreenAtTheLargestSize: Set<String>) throws {
        let headerBottom = titleBottom(in: app)
        let softEdgeBottom = headerBottom + Self.softScrollEdgeDepth
        let transcript = app.scrollViews.firstMatch.frame
        try audit(app) { issue in
            guard let element = issue.element else { return false }
            let isUnderTheHeader = element.frame.minY < headerBottom
            let isUnderTheSoftEdge = element.frame.minY < softEdgeBottom
            let isScrolledOffScreenAtTheLargestSize =
                transcript.contains(element.frame)
                && !onScreenAtTheLargestSize.contains(element.label)
            return switch issue.auditType {
            case .contrast: isUnderTheSoftEdge
            case .textClipped: isUnderTheHeader
            case .dynamicType: isUnderTheHeader || isScrolledOffScreenAtTheLargestSize
            default: false
            }
        }
    }

    func testAGroupNamesEachAuthorAndSendsAMentionToThePickedCompanion() throws {
        let onScreen = labelsFullyOnScreenAtTheLargestSize(of: "group-thread")
        let app = launch("group-thread")
        XCTAssertTrue(
            element("Juniper, The changelog is merged.", in: app).waitForExistence(timeout: 10))
        XCTAssertTrue(element("Juniper, I’m tagging 0.42 next.", in: app).exists)
        XCTAssertTrue(
            element("Atlas, I’ll split the onboarding ticket once the tag is out.", in: app).exists)
        XCTAssertTrue(element("Atlas, @Juniper ping me when it’s tagged.", in: app).exists)
        XCTAssertTrue(app.navigationBars["Release crew"].exists)
        try auditTheGroup(app, onScreenAtTheLargestSize: onScreen)

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
        let working = app.staticTexts["Atlas is working…"]
        XCTAssertTrue(working.waitForExistence(timeout: 5))
        XCTAssertTrue(element("Atlas, On it.", in: app).waitForExistence(timeout: 10))
        XCTAssertFalse(element("Juniper, On it.", in: app).exists)
        XCTAssertTrue(working.waitForNonExistence(timeout: 10))
    }

    func testTheMentionPickerPassesTheAudit() throws {
        let onScreen = labelsFullyOnScreenAtTheLargestSize(of: "group-mention")
        let app = launch("group-mention")
        XCTAssertTrue(app.buttons["Mention Juniper"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["Mention Atlas"].exists)

        try auditTheGroup(app, onScreenAtTheLargestSize: onScreen)
    }

    func testTwoCompanionsAtWorkAreBothNamed() throws {
        let onScreen = labelsFullyOnScreenAtTheLargestSize(of: "group-working")
        let app = launch("group-working")
        XCTAssertTrue(
            app.staticTexts["Juniper and Atlas are working…"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["Stop"].exists)

        try auditTheGroup(app, onScreenAtTheLargestSize: onScreen)
    }
}
