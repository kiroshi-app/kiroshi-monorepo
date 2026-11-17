import Foundation
import Testing
import UIKit

@testable import Kiroshi

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct CompanionPicturesTests {
    let transport = TestRelayTransport()

    var png: String {
        UIGraphicsImageRenderer(size: CGSize(width: 1, height: 1)).pngData { _ in }
            .base64EncodedString()
    }

    @Test func aPictureWhoseAvatarLeftTheScreenIsAskedForAgainNextTime() async throws {
        let host = TestHost(holding: ["relay_avatar"])
        let connection = RelayConnection(
            baseURL: KiroshiCloud.productionURL, instanceId: "instance-1", bearer: "fixture-bearer",
            environment: RelayEnvironment(transport: transport, clock: TestRelayClock()),
            backoff: Backoff(jitter: { $0 }))
        let updates = await connection.updates()
        await connection.start()
        await transport.nextOpening().accept(host.socket)
        for await update in updates {
            if case .state(let state) = update, state == .online(sharedSpaceId: "s-1") { break }
        }
        let pictures = CompanionPictures(connection: connection)
        let leftTheScreen = Task { await pictures.load("owl-1.png") }
        _ = try #require(await host.nextCall("relay_avatar"))

        leftTheScreen.cancel()
        _ = await leftTheScreen.ending
        async let shownAgain: Void = pictures.load("owl-1.png")
        let askedAgain = try #require(await host.nextCall("relay_avatar"))
        host.reply(TestHost.ok(askedAgain, #"{"base64":"\#(png)"}"#))
        await shownAgain

        #expect(pictures.pictures["owl-1.png"] != nil)
        await connection.stop()
    }
}
