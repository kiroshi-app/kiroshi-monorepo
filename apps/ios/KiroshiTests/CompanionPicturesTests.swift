import Foundation
import Observation
import Testing
import UIKit

@testable import Kiroshi

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct CompanionPicturesTests {
    let transport = TestRelayTransport()
    let clock = TestRelayClock()

    struct PictureArgs: Decodable {
        let file: String
    }

    var png: String {
        UIGraphicsImageRenderer(size: CGSize(width: 1, height: 1)).pngData { _ in }
            .base64EncodedString()
    }

    func connect(to host: TestHost) async -> (RelayConnection, AsyncStream<RelayUpdate>) {
        let connection = RelayConnection(
            baseURL: KiroshiCloud.productionURL, instanceId: "instance-1", bearer: "fixture-bearer",
            environment: RelayEnvironment(transport: transport, clock: clock),
            backoff: Backoff(jitter: { $0 }))
        let updates = await connection.updates()
        await connection.start()
        await transport.nextOpening().accept(host.socket)
        await waitFor(.online(sharedSpaceId: "s-1"), in: updates)
        return (connection, updates)
    }

    func waitFor(_ expected: RelayState, in updates: AsyncStream<RelayUpdate>) async {
        for await update in updates {
            if case .state(let state) = update, state == expected { return }
        }
    }

    func waitForPicture(_ file: String, in pictures: CompanionPictures) async {
        while pictures.pictures[file] == nil {
            await withCheckedContinuation { continuation in
                withObservationTracking {
                    _ = pictures.pictures[file]
                } onChange: {
                    continuation.resume()
                }
            }
        }
    }

    @Test func anAvatarThatComesBackWhileItsPictureIsAskedSharesTheOneRequest() async throws {
        let host = TestHost(holding: ["relay_avatar"])
        let (connection, _) = await connect(to: host)
        let pictures = CompanionPictures(connection: connection)
        let leftTheScreen = Task { await pictures.load("owl-1.png") }
        let asked = try #require(await host.nextCall("relay_avatar"))

        leftTheScreen.cancel()
        _ = await leftTheScreen.ending
        try #require(await connection.heldCallCount == 1)
        let cameBack = Task { await pictures.load("owl-1.png") }
        let other = Task { await pictures.load("fox-2.png") }
        let next = try #require(await host.nextCall("relay_avatar"))
        host.reply(TestHost.refused(next, status: 404, #""no avatar""#))
        host.reply(TestHost.ok(asked, #"{"base64":"\#(png)"}"#))
        await cameBack.value
        await other.value

        #expect(try next.args(as: PictureArgs.self).file == "fox-2.png")
        #expect(pictures.pictures["owl-1.png"] != nil)
        #expect(await connection.heldCallCount == 0)
        await connection.stop()
    }

    @Test func aPictureAnsweredOnceItsAvatarLeftIsKeptWithNothingLeftWaiting() async throws {
        let host = TestHost(holding: ["relay_avatar"])
        let (connection, _) = await connect(to: host)
        let pictures = CompanionPictures(connection: connection)
        let leftTheScreen = Task { await pictures.load("owl-1.png") }
        let asked = try #require(await host.nextCall("relay_avatar"))
        leftTheScreen.cancel()
        _ = await leftTheScreen.ending
        try #require(await connection.heldCallCount == 1)

        host.reply(TestHost.ok(asked, #"{"base64":"\#(png)"}"#))
        await waitForPicture("owl-1.png", in: pictures)
        await pictures.load("owl-1.png")
        let other = Task { await pictures.load("fox-2.png") }
        let next = try #require(await host.nextCall("relay_avatar"))
        host.reply(TestHost.refused(next, status: 404, #""no avatar""#))
        await other.value

        #expect(try next.args(as: PictureArgs.self).file == "fox-2.png")
        #expect(await connection.heldCallCount == 0)
        await connection.stop()
    }

    @Test func aPictureWhoseRequestEndedWithItsSocketIsAskedForAgainNextTime() async throws {
        let host = TestHost(holding: ["relay_avatar"])
        let (connection, updates) = await connect(to: host)
        let pictures = CompanionPictures(connection: connection)
        let leftTheScreen = Task { await pictures.load("owl-1.png") }
        _ = try #require(await host.nextCall("relay_avatar"))
        leftTheScreen.cancel()
        _ = await leftTheScreen.ending

        host.socket.push(.close(1006))
        await waitFor(.unreachable, in: updates)
        #expect(await connection.heldCallCount == 0)
        await clock.wakeNextSleep(of: .seconds(1))
        let reopened = TestHost(holding: ["relay_avatar"])
        await transport.nextOpening().accept(reopened.socket)
        await waitFor(.online(sharedSpaceId: "s-1"), in: updates)
        async let shownAgain: Void = pictures.load("owl-1.png")
        let askedAgain = try #require(await reopened.nextCall("relay_avatar"))
        reopened.reply(TestHost.ok(askedAgain, #"{"base64":"\#(png)"}"#))
        await shownAgain

        #expect(pictures.pictures["owl-1.png"] != nil)
        await connection.stop()
    }
}
