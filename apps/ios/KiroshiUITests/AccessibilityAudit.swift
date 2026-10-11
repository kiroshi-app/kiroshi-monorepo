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
}
