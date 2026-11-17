import Foundation
import Testing

@testable import Kiroshi

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct CitedImageTests {
    let transport = TestRelayTransport()

    struct FileArgs: Decodable {
        let file: String
    }

    @Test func aCitedImageThatComesBackWhileItLoadsSharesTheOneRequest() async throws {
        let chart = CitedAttachment(path: CitedFixture.chart, name: "chart.png", kind: .image)
        let missing = CitedAttachment(path: CitedFixture.missing, name: "missing.png", kind: .image)
        let host = TestHost(holding: ["relay_attachment"])
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
        let files = CitedFiles(connection: connection)
        let leftTheScreen = Task { await files.loadImage(chart) }
        let asked = try #require(await host.nextCall("relay_attachment"))

        leftTheScreen.cancel()
        _ = await leftTheScreen.ending
        try #require(await connection.heldCallCount == 1)
        let cameBack = Task { await files.loadImage(chart) }
        let other = Task { await files.loadImage(missing) }
        let next = try #require(await host.nextCall("relay_attachment"))
        host.reply(TestHost.refused(next, status: 404, #""no file answers this path""#))
        host.reply(TestHost.ok(asked, try #require(CitedFixture.answer(for: chart.file))))
        await cameBack.value
        await other.value

        #expect(try next.args(as: FileArgs.self).file == missing.file)
        #expect(files.images[chart.path] != nil)
        #expect(await connection.heldCallCount == 0)
        await connection.stop()
    }
}
