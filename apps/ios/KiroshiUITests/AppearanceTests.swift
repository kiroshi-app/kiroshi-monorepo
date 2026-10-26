import XCTest

@MainActor
final class AppearanceTests: XCTestCase {
    func testAScreenLaunchedInDarkFailsWhenAskedToBeLight() throws {
        _ = try launch("3.1", in: .dark)

        XCTExpectFailure("A dark screen asked to be light fails")
        try assertShown(.light)
    }
}
