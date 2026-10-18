import Foundation
import Testing

@testable import Kiroshi

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct SessionEndingTests {
    let transport = ScriptedTransport()
    let relay = TestRelayTransport()

    func signedIn(_ service: String) -> (SignInModel, KeychainSessionStore) {
        let keychain = KeychainSessionStore(service: "com.kiroshi.app.ios.tests.\(service)")
        keychain.clear()
        try? keychain.save(CloudFixture.session)
        let model = SignInModel(
            cloud: KiroshiCloud(baseURL: KiroshiCloud.productionURL, transport: transport),
            sessions: keychain, lastSpace: InMemoryLastSpaceStore(),
            agreements: CloudFixture.agreements(),
            relay: RelayEnvironment(transport: relay, clock: TestRelayClock()))
        return (model, keychain)
    }

    func expectSignedOutWithoutRevoking(_ model: SignInModel, _ keychain: KeychainSessionStore)
        async
    {
        #expect(model.stage == .signedOut)
        #expect(model.shell == nil)
        #expect(model.path.isEmpty)
        #expect(keychain.load() == nil)
        #expect(model.revocation == nil)
        let paths = await transport.requests.compactMap { $0.url?.path() }
        #expect(!paths.contains(CloudFixture.signOutPath))
    }

    @Test func aRefusedBearerAtLaunchSignsOut() async {
        await transport.answer(
            CloudFixture.spacesPath, with: CloudFixture.refused("Authentication required"))
        let (model, keychain) = signedIn("launch-401")

        await model.loadSpaces()

        await expectSignedOutWithoutRevoking(model, keychain)
    }

    @Test func aRefusedSpacesRefreshSignsOut() async throws {
        await transport.answer(CloudFixture.spacesPath, with: CloudFixture.threeSpaces)
        let (model, keychain) = signedIn("refresh-401")
        await model.loadSpaces()
        let shell = try #require(model.shell)
        await transport.answer(
            CloudFixture.spacesPath, with: CloudFixture.refused("Authentication required"))

        await shell.refreshSpaces()

        await expectSignedOutWithoutRevoking(model, keychain)
    }

    @Test func aRefusedRelayHandshakeSignsOut() async throws {
        await transport.answer(CloudFixture.spacesPath, with: CloudFixture.threeSpaces)
        let (model, keychain) = signedIn("handshake-401")
        await model.loadSpaces()
        let shell = try #require(model.shell)
        let following = Task { await shell.follow() }

        await relay.nextOpening().refuse(401)
        await following.value

        await expectSignedOutWithoutRevoking(model, keychain)
    }

    @Test(arguments: [false, true])
    func aRevokedSessionClosesTheRelayAndSignsOut(duringUpgrade: Bool) async throws {
        await transport.answer(CloudFixture.spacesPath, with: CloudFixture.threeSpaces)
        let (model, keychain) = signedIn("revoked-\(duringUpgrade)")
        await model.loadSpaces()
        let shell = try #require(model.shell)
        let following = Task { await shell.follow() }
        let opening = await relay.nextOpening()
        let connection = try #require(shell.connection)

        if duringUpgrade {
            opening.close(RelayClosure.sessionRevoked)
        } else {
            let socket = ScriptedRelaySocket(sharedSpaceId: "s-1")
            opening.accept(socket)
            for await update in await connection.updates() {
                if case .state(.online) = update { break }
            }
            socket.push(.close(RelayClosure.sessionRevoked))
        }
        await following.value

        await expectSignedOutWithoutRevoking(model, keychain)
        #expect(await connection.isRunning == false)
    }

    @Test(arguments: [false, true])
    func aDeviceMovedToAnotherAccountSignsOutWithoutReconnecting(duringUpgrade: Bool) async throws {
        await transport.answer(CloudFixture.spacesPath, with: CloudFixture.threeSpaces)
        await transport.answer(CloudFixture.signOutPath, with: CloudFixture.signedOut)
        let (model, keychain) = signedIn("device-moved-\(duringUpgrade)")
        await model.loadSpaces()
        let shell = try #require(model.shell)
        let following = Task { await shell.follow() }
        let opening = await relay.nextOpening()
        let connection = try #require(shell.connection)

        if duringUpgrade {
            opening.close(RelayClosure.deviceRevoked)
        } else {
            let socket = ScriptedRelaySocket(sharedSpaceId: "s-1")
            opening.accept(socket)
            for await update in await connection.updates() {
                if case .state(.online) = update { break }
            }
            socket.push(.close(RelayClosure.deviceRevoked))
        }
        await following.value
        await model.revocation?.value

        #expect(model.stage == .signedOut)
        #expect(model.signOutNotice == .deviceMoved)
        #expect(model.shell == nil)
        #expect(keychain.load() == nil)
        #expect(await connection.isRunning == false)
        #expect(await connection.state == .paused)
        let paths = await transport.requests.compactMap { $0.url?.path() }
        #expect(paths.contains(CloudFixture.signOutPath))
        #expect(!paths.contains { $0.hasPrefix("/devices/") && $0 != FixtureKeys.challengePath })
    }

    @Test func signingInAgainClearsTheDeviceMovedNotice() async throws {
        await transport.answer(CloudFixture.spacesPath, with: CloudFixture.threeSpaces)
        await transport.answer(CloudFixture.codeRequestPath, with: CloudFixture.codeSent)
        let (model, _) = signedIn("device-moved-notice")
        await model.loadSpaces()
        let shell = try #require(model.shell)
        let following = Task { await shell.follow() }
        await relay.nextOpening().close(RelayClosure.deviceRevoked)
        await following.value
        #expect(model.signOutNotice == .deviceMoved)

        model.email = CloudFixture.email
        await model.requestCode()

        #expect(model.signOutNotice == nil)
        model.revocation?.cancel()
    }
}
