import Foundation
import Testing

@testable import Kiroshi

@MainActor
struct SignOutTests {
    let transport = ScriptedTransport()
    let sessions = InMemorySessionStore(CloudFixture.session)

    func makeModel(sessions: any SessionStore) -> SignInModel {
        SignInModel(
            cloud: KiroshiCloud(baseURL: KiroshiCloud.productionURL, transport: transport),
            sessions: sessions, lastSpace: InMemoryLastSpaceStore(),
            agreements: CloudFixture.agreements(), relay: CloudFixture.relay)
    }

    @Test func signOutAsksForConfirmationFirst() async {
        let model = makeModel(sessions: sessions)

        model.signOutTapped()

        #expect(model.isConfirmingSignOut)
        #expect(sessions.saved == CloudFixture.session)
        #expect(await transport.requests.isEmpty)
    }

    @Test func cancellingTheConfirmationKeepsTheSession() async {
        let model = makeModel(sessions: sessions)
        model.signOutTapped()

        model.isConfirmingSignOut = false

        #expect(sessions.saved == CloudFixture.session)
        #expect(model.stage == .loadingSpaces)
        #expect(model.signedInEmail == CloudFixture.email)
        #expect(await transport.requests.isEmpty)
    }

    @Test func confirmingLeavesNoSessionAndOpensSignIn() async {
        await transport.answer(CloudFixture.signOutPath, with: CloudFixture.signedOut)
        let model = makeModel(sessions: sessions)
        model.signOutTapped()

        model.signOut()

        #expect(sessions.saved == nil)
        #expect(model.stage == .signedOut)
        #expect(model.path.isEmpty)
        #expect(model.signedInEmail.isEmpty)
        #expect(!model.isConfirmingSignOut)
        await model.revocation?.value
    }

    @Test func signingOutRevokesTheBearerOnTheCloud() async throws {
        await transport.answer(CloudFixture.signOutPath, with: CloudFixture.signedOut)
        let model = makeModel(sessions: sessions)

        model.signOut()
        await model.revocation?.value

        let request = try #require(await transport.requests.last)
        #expect(request.url?.absoluteString == "https://api.kiroshi.app/api/auth/sign-out")
        #expect(request.httpMethod == "POST")
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer fixture-bearer")
    }

    @Test func signingOutNeverWaitsForTheCloud() async {
        await transport.answer(CloudFixture.signOutPath, with: .pending)
        let model = makeModel(sessions: sessions)

        model.signOut()

        #expect(sessions.saved == nil)
        #expect(model.stage == .signedOut)
        model.revocation?.cancel()
    }

    @Test func anUnreachableCloudStillSignsOut() async {
        let model = makeModel(sessions: sessions)

        model.signOut()
        await model.revocation?.value

        #expect(sessions.saved == nil)
        #expect(model.stage == .signedOut)
    }

    @Test func signingOutTellsTheShell() {
        let model = makeModel(sessions: sessions)
        var signOuts = 0
        model.onSignOut = { signOuts += 1 }

        model.signOut()

        #expect(signOuts == 1)
        model.revocation?.cancel()
    }

    @Test(.timeLimit(.minutes(1))) func signingOutFromSettingsDisconnectsTheRelay() async throws {
        await transport.answer(CloudFixture.spacesPath, with: CloudFixture.threeSpaces)
        await transport.answer(CloudFixture.signOutPath, with: CloudFixture.signedOut)
        let relay = TestRelayTransport()
        let model = SignInModel(
            cloud: KiroshiCloud(baseURL: KiroshiCloud.productionURL, transport: transport),
            sessions: sessions, lastSpace: InMemoryLastSpaceStore(),
            agreements: CloudFixture.agreements(),
            relay: RelayEnvironment(transport: relay, clock: TestRelayClock()))
        await model.loadSpaces()
        let shell = try #require(model.shell)
        let following = Task { await shell.follow() }
        await relay.nextOpening().accept(ScriptedRelaySocket(sharedSpaceId: "s-1"))
        let connection = try #require(shell.connection)
        for await update in await connection.updates() {
            if case .state(.online) = update { break }
        }

        model.signOutTapped()
        model.signOut()
        await following.value
        await model.revocation?.value

        #expect(await connection.state == .paused)
        #expect(await connection.isRunning == false)
        #expect(model.shell == nil)
        #expect(model.stage == .signedOut)
    }

    @Test func relaunchAfterSignOutOpensSignIn() async {
        let keychain = KeychainSessionStore(service: "com.kiroshi.app.ios.tests.sign-out")
        keychain.clear()
        try? keychain.save(CloudFixture.session)
        let model = makeModel(sessions: keychain)
        #expect(model.stage == .loadingSpaces)

        model.signOut()
        await model.revocation?.value

        #expect(keychain.load() == nil)
        let relaunched = makeModel(sessions: KeychainSessionStore(service: keychain.service))
        #expect(relaunched.stage == .signedOut)
        #expect(relaunched.path.isEmpty)
    }

    @Test(
        arguments: [
            (
                CloudFixture.artboardSpaces,
                "Studio, Home lab and Side project leave this iPhone until you sign in again."
            ),
            (
                Array(CloudFixture.artboardSpaces.prefix(2)),
                "Studio and Home lab leave this iPhone until you sign in again."
            ),
            (
                Array(CloudFixture.artboardSpaces.prefix(1)),
                "Studio leaves this iPhone until you sign in again."
            ),
            ([], "Your spaces leave this iPhone until you sign in again."),
        ])
    func theConfirmationNamesTheSpacesLeaving(spaces: [Space], message: String) {
        #expect(SettingsView.signOutMessage(for: spaces) == message)
    }
}
