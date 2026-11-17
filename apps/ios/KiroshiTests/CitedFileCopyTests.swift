import Foundation
import Testing

@testable import Kiroshi

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct CitedFileCopyTests {
    let transport = TestRelayTransport()

    struct FileArgs: Decodable {
        let conversationId: String
        let file: String
    }

    func makeConnection() -> RelayConnection {
        RelayConnection(
            baseURL: KiroshiCloud.productionURL, instanceId: "instance-1", bearer: "fixture-bearer",
            environment: RelayEnvironment(transport: transport, clock: TestRelayClock()),
            backoff: Backoff(jitter: { $0 }))
    }

    @Test func aCitedFileIsHandedOnUnderItsNameWithTheBytesTheHostSent() async throws {
        let notes = CitedAttachment(
            path: CitedFixture.notes, name: "Release notes 4.2.pdf", kind: .file)
        let host = TestHost { call in
            guard call.command == "relay_attachment",
                let args = try? call.args(as: FileArgs.self),
                args.conversationId == "c-juniper",
                let answer = CitedFixture.answer(for: args.file)
            else { return nil }
            return TestHost.ok(call, answer)
        }
        let connection = makeConnection()
        let updates = await connection.updates()
        await connection.start()
        await transport.nextOpening().accept(host.socket)
        for await update in updates {
            if case .state(let state) = update, state == .online(sharedSpaceId: "s-1") { break }
        }

        let copy = try await CitedFiles(connection: connection).copy(of: notes)

        #expect(copy.lastPathComponent == "Release notes 4.2.pdf")
        #expect(try Data(contentsOf: copy) == CitedFixture.notesPDF)
        await connection.stop()
    }
}
