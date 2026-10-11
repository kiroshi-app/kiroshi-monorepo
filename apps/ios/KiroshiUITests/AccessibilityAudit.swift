import XCTest

extension XCTestCase {
    @MainActor func launch(_ fixture: String) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-fixture", fixture]
        app.launch()
        return app
    }

    @MainActor func audit(
        _ app: XCUIApplication,
        accepting isAccepted: @escaping (XCUIAccessibilityAuditIssue) -> Bool = { _ in false }
    ) throws {
        let handle: (XCUIAccessibilityAuditIssue) -> Bool = { issue in
            let isSecondaryLabelNearlyPassing =
                issue.auditType == .contrast && issue.compactDescription == "Contrast nearly passed"
            let accepted = isSecondaryLabelNearlyPassing || isAccepted(issue)
            print(
                "audit:", accepted ? "accepted" : "failed", "|", issue.compactDescription, "|",
                issue.element?.label ?? "no element", "|",
                issue.element.map { "\($0.frame)" } ?? "")
            return accepted
        }
        try app.performAccessibilityAudit(for: .contrast, handle)
        try app.performAccessibilityAudit(for: .all.subtracting(.contrast), handle)
    }

    @MainActor func composer(in app: XCUIApplication) -> XCUIElement {
        let field = app.textViews.firstMatch
        return field.exists ? field : app.textFields.firstMatch
    }

    @MainActor func labelsFullyOnScreenAtTheLargestSize(of fixture: String) -> Set<String> {
        let app = XCUIApplication()
        app.launchArguments = [
            "-fixture", fixture,
            "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL",
        ]
        app.launch()
        let transcript = app.scrollViews.firstMatch
        XCTAssertTrue(composer(in: app).waitForExistence(timeout: 10))
        let pickerTop = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Mention '"))
            .allElementsBoundByIndex.map(\.frame.minY).min()
        let visible = CGRect(
            x: transcript.frame.minX, y: app.navigationBars.firstMatch.frame.maxY,
            width: transcript.frame.width,
            height: min(pickerTop ?? .infinity, composer(in: app).frame.minY)
                - app.navigationBars.firstMatch.frame.maxY)
        let shown = transcript.descendants(matching: .any).allElementsBoundByIndex
            .filter { visible.contains($0.frame) }
            .map(\.label)
        app.terminate()
        return Set(shown)
    }
}
