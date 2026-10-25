import XCTest

@MainActor
final class PhotoSendingTests: XCTestCase {
    let caption = "Here’s the flow."

    override func setUp() async throws {
        continueAfterFailure = false
    }

    func problem(_ prefix: String, in app: XCUIApplication) -> XCUIElement {
        app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", prefix)).firstMatch
    }

    func sendThePickedPhotos(_ app: XCUIApplication) {
        XCTAssertTrue(app.buttons["Remove Photo 1.jpg"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.buttons["Send"].waitForExistence(timeout: 15))
        app.buttons["Send"].tap()
    }

    func testAPhotoSendsAsBase64AndShowsUnderTheMessage() {
        let app = launch("3.1", "-photos", "3", "-draft", caption)
        sendThePickedPhotos(app)

        XCTAssertTrue(app.staticTexts["Photo 1.jpg"].waitForExistence(timeout: 30))
        XCTAssertTrue(app.staticTexts[caption].exists)
        XCTAssertFalse(app.buttons["Remove Photo 1.jpg"].exists)
        XCTAssertFalse(problem("Couldn’t", in: app).exists)
    }

    func testPhotosOverTheHostLimitsAreRefusedOnTheIPhoneAndPassTheAudit() throws {
        let app = launch("3.1", "-photos", "10,10,10,1", "-draft", caption)
        sendThePickedPhotos(app)

        let tooLarge = problem("Couldn’t send your files, they’re too large.", in: app)
        XCTAssertTrue(tooLarge.waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["Remove Photo 4.jpg"].exists)
        XCTAssertFalse(app.staticTexts[caption].exists)
        try auditTheProblem(tooLarge, in: app)
    }

    func testARelayCutSaysTheSpaceCouldNotBeReachedAndPassesTheAudit() throws {
        let app = launch("3.1", "-photos", "1", "-storeAnswer", "cut")
        sendThePickedPhotos(app)

        let unreachable = problem("Couldn’t send, the Space couldn’t be reached.", in: app)
        XCTAssertTrue(unreachable.waitForExistence(timeout: 30))
        XCTAssertFalse(problem("Couldn’t send, the computer hosting this Space", in: app).exists)
        XCTAssertTrue(app.buttons["Remove Photo 1.jpg"].exists)
        try auditTheProblem(unreachable, in: app)
    }

    func auditTheProblem(_ problem: XCUIElement, in app: XCUIApplication) throws {
        let titleBottom = titleBottom(in: app)
        let composerTop = problem.frame.minY
        try audit(app) { issue in
            guard let element = issue.element else { return issue.auditType == .textClipped }
            let isInTheTitle = element.frame.minY < titleBottom
            let isATranscriptRowAboveTheComposer = element.frame.maxY <= composerTop
            return switch issue.auditType {
            case .contrast: isInTheTitle
            case .textClipped, .dynamicType: isInTheTitle || isATranscriptRowAboveTheComposer
            default: false
            }
        }
    }
}
