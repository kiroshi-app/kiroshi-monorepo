import XCTest

extension XCTestCase {
    @MainActor func launch(_ fixture: String, _ arguments: String...) -> XCUIApplication {
        launch(fixture, arguments: arguments)
    }

    @MainActor func launchInEnglish(_ fixture: String, _ arguments: String...) -> XCUIApplication {
        launch(
            fixture, arguments: ["-AppleLocale", "en_US", "-AppleLanguages", "(en)"] + arguments)
    }

    @MainActor func launch(_ fixture: String, arguments: [String]) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-disablesAnimations", "YES", "-fixture", fixture] + arguments
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

    @MainActor func settingsBars(in app: XCUIApplication) -> [CGRect] {
        let versionBar = app.staticTexts.matching(
            NSPredicate(format: "label BEGINSWITH 'Kiroshi '")
        ).firstMatch
        return [app.navigationBars.firstMatch.frame, versionBar.frame]
    }

    @MainActor func assertNoDaySeparatorWhile(
        _ loading: XCUIElement, in app: XCUIApplication,
        file: StaticString = #filePath, line: UInt = #line
    ) {
        let isSeparatorShown = ["Today", "Yesterday"].contains { app.staticTexts[$0].exists }
        XCTAssertFalse(isSeparatorShown && loading.exists, file: file, line: line)
    }

    @MainActor func titleBottom(in app: XCUIApplication) -> CGFloat {
        let bar = app.navigationBars.firstMatch
        return bar.staticTexts.allElementsBoundByIndex.map(\.frame.maxY).reduce(
            bar.frame.maxY, max)
    }

    @MainActor func composer(in app: XCUIApplication) -> XCUIElement {
        let field = app.textViews.firstMatch
        return field.exists ? field : app.textFields.firstMatch
    }

    @MainActor func labelsFullyOnScreenAtTheLargestSize(of fixture: String) -> Set<String> {
        let app = launch(
            fixture, "-UIPreferredContentSizeCategoryName",
            "UICTContentSizeCategoryAccessibilityXXXL")
        let transcript = app.scrollViews.firstMatch
        XCTAssertTrue(composer(in: app).waitForExistence(timeout: 10))
        XCTAssertTrue(
            app.descendants(matching: .any)["Loading the conversation"]
                .waitForNonExistence(timeout: 10))
        XCTAssertTrue(
            app.descendants(matching: .any)["Loading the mission"]
                .waitForNonExistence(timeout: 10))
        let top = titleBottom(in: app)
        let pickerTop = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Mention '"))
            .allElementsBoundByIndex.map(\.frame.minY).min()
        let visible = CGRect(
            x: transcript.frame.minX, y: top, width: transcript.frame.width,
            height: min(pickerTop ?? .infinity, composer(in: app).frame.minY) - top)
        let shown = transcript.descendants(matching: .any).allElementsBoundByIndex
            .filter { visible.contains($0.frame) }
            .map(\.label)
        app.terminate()
        return Set(shown)
    }
}

extension XCUIAccessibilityAuditIssue {
    @MainActor func isUnderABar(_ bars: [CGRect]) -> Bool {
        guard [.contrast, .dynamicType].contains(auditType), let frame = element?.frame else {
            return false
        }
        return bars.contains { $0.intersects(frame) }
    }
}
