import Foundation
import Security
import Testing

@testable import Kiroshi

@MainActor
struct DeviceRegistrationTests {
    static let otherUserId = "7d3f1c2a-0000-4000-8000-000000000002"
    static let otherSession = Session(
        bearer: "other-bearer", email: "kai@example.com", userId: otherUserId)

    let transport = ScriptedTransport([CloudFixture.spacesPath: CloudFixture.threeSpaces])
    let relay = RelayEnvironment(transport: TestRelayTransport(), clock: TestRelayClock())

    var cloud: KiroshiCloud {
        KiroshiCloud(baseURL: KiroshiCloud.productionURL, transport: transport)
    }

    func fakeRelay() -> FakeRelayDevices {
        FakeRelayDevices(
            accounts: [
                CloudFixture.session.bearer: CloudFixture.userId,
                Self.otherSession.bearer: Self.otherUserId,
            ],
            others: transport)
    }

    func makeModel(
        transport: any HTTPTransport, session: Session? = CloudFixture.session,
        sessions: InMemorySessionStore? = nil
    ) -> SignInModel {
        SignInModel(
            cloud: KiroshiCloud(baseURL: KiroshiCloud.productionURL, transport: transport),
            sessions: sessions ?? InMemorySessionStore(session),
            lastSpace: InMemoryLastSpaceStore(),
            agreements: InMemoryAgreementStore(
                [CloudFixture.userId, Self.otherUserId]),
            relay: relay)
    }

    func signIn(_ model: SignInModel, as session: Session) async {
        await transport.answer(CloudFixture.signInPath, with: Self.signedIn(session))
        model.email = session.email
        model.code = "482913"
        await model.signIn()
    }

    func registrations() async -> Int {
        await transport.requests.filter { $0.url?.path() == FixtureKeys.devicesPath }.count
    }

    @Test func aFreshKeyIsProvenWithAChallengeAndRegistered() async throws {
        let relay = fakeRelay()
        let cloud = KiroshiCloud(baseURL: KiroshiCloud.productionURL, transport: relay)

        let answer = try await cloud.registerDevice(
            FixtureKeys.member, userId: CloudFixture.userId, bearer: CloudFixture.session.bearer)

        #expect(answer == .registered(relayId: "device-1", transferred: false))
        let requests = await relay.requests
        #expect(
            requests.map { "\($0.httpMethod ?? "") \($0.url?.absoluteString ?? "")" }
                == [
                    "POST https://api.kiroshi.app/devices/challenge",
                    "POST https://api.kiroshi.app/devices",
                ])
        #expect(
            requests.allSatisfy {
                $0.value(forHTTPHeaderField: "Authorization") == "Bearer fixture-bearer"
            })
        let body = try JSONDecoder().decode(
            [String: String].self, from: try #require(requests.last?.httpBody))
        #expect(
            body.keys.sorted() == ["ed25519PublicKey", "nonce", "signature", "x25519PublicKey"])
        #expect(
            body["ed25519PublicKey"]
                == FixtureKeys.member.signing.publicKey.rawRepresentation.unpaddedBase64URL)
        #expect(
            body["x25519PublicKey"]
                == FixtureKeys.member.agreement.publicKey.rawRepresentation.unpaddedBase64URL)
        #expect(await relay.devices(of: CloudFixture.userId) == ["device-1"])
    }

    @Test func theSameKeyOnTheSameAccountKeepsItsDevice() async throws {
        let relay = fakeRelay()
        let cloud = KiroshiCloud(baseURL: KiroshiCloud.productionURL, transport: relay)
        _ = try await cloud.registerDevice(
            FixtureKeys.member, userId: CloudFixture.userId, bearer: CloudFixture.session.bearer)

        let again = try await cloud.registerDevice(
            FixtureKeys.member, userId: CloudFixture.userId, bearer: CloudFixture.session.bearer)

        #expect(again == .registered(relayId: "device-1", transferred: false))
        #expect(await relay.devices(of: CloudFixture.userId) == ["device-1"])
    }

    @Test func theSameKeyOnAnotherAccountMovesTheDevice() async throws {
        let relay = fakeRelay()
        let cloud = KiroshiCloud(baseURL: KiroshiCloud.productionURL, transport: relay)
        _ = try await cloud.registerDevice(
            FixtureKeys.member, userId: CloudFixture.userId, bearer: CloudFixture.session.bearer)

        let moved = try await cloud.registerDevice(
            FixtureKeys.member, userId: Self.otherUserId, bearer: Self.otherSession.bearer)

        #expect(moved == .registered(relayId: "device-1", transferred: true))
        #expect(await relay.devices(of: Self.otherUserId) == ["device-1"])
        #expect(await relay.devices(of: CloudFixture.userId).isEmpty)
    }

    @Test func aTamperedSignatureIsRefusedAndThePersonStaysSignedIn() async {
        let relay = fakeRelay()
        await relay.tamperSignatures()
        let sessions = InMemorySessionStore(CloudFixture.session)
        let model = makeModel(transport: relay, sessions: sessions)

        await model.loadSpaces()

        #expect(model.stage == .deviceRefused(.notAdded))
        #expect(sessions.saved == CloudFixture.session)
        #expect(model.signedInEmail == CloudFixture.email)
        #expect(model.revocation == nil)
        #expect(await relay.count("POST", CloudFixture.signOutPath) == 0)
        #expect(await relay.devices(of: CloudFixture.userId).isEmpty)
    }

    @Test func anExpiredNonceIsRetriedOnceWithAFreshChallenge() async throws {
        let relay = fakeRelay()
        await relay.expireChallenges(1)
        let model = makeModel(transport: relay)

        await model.loadSpaces()

        #expect(model.shell != nil)
        #expect(await relay.count("POST", FixtureKeys.challengePath) == 2)
        #expect(await relay.count("POST", FixtureKeys.devicesPath) == 2)
        #expect(await relay.devices(of: CloudFixture.userId) == ["device-1"])
    }

    @Test func aSecondExpiredNonceIsAnErrorThePersonReads() async {
        let relay = fakeRelay()
        await relay.expireChallenges(2)
        let sessions = InMemorySessionStore(CloudFixture.session)
        let model = makeModel(transport: relay, sessions: sessions)

        await model.loadSpaces()

        #expect(model.stage == .deviceRefused(.notAdded))
        #expect(sessions.saved == CloudFixture.session)
        #expect(await relay.count("POST", FixtureKeys.challengePath) == 2)
        #expect(await relay.count("POST", FixtureKeys.devicesPath) == 2)
    }

    @Test func checkingAgainAfterARefusalProvesTheKeyAgain() async {
        let relay = fakeRelay()
        await relay.expireChallenges(2)
        let model = makeModel(transport: relay)
        await model.loadSpaces()

        model.checkAgain()
        await model.loadSpaces()

        #expect(model.shell != nil)
        #expect(await relay.count("POST", FixtureKeys.challengePath) == 3)
    }

    @Test func signingOutOfOneAccountAndIntoAnotherRegistersThePhoneToTheOther() async throws {
        let relay = fakeRelay()
        let model = makeModel(transport: relay)
        await model.loadSpaces()
        #expect(await relay.devices(of: CloudFixture.userId) == ["device-1"])

        model.signOut()
        await model.revocation?.value
        await signIn(model, as: Self.otherSession)
        await model.loadSpaces()

        #expect(model.shell != nil)
        #expect(await relay.devices(of: CloudFixture.userId).isEmpty)
        #expect(await relay.devices(of: Self.otherUserId) == ["device-2"])
        #expect(await self.relay.relayDevices.relayId(for: Self.otherUserId) == "device-2")
    }

    @Test func aDeletionThatNeverArrivedIsCoveredByTheMove() async throws {
        let relay = fakeRelay()
        await relay.dropDeletions()
        let model = makeModel(transport: relay)
        await model.loadSpaces()

        model.signOut()
        await model.revocation?.value
        await signIn(model, as: Self.otherSession)
        await model.loadSpaces()

        #expect(model.shell != nil)
        #expect(await relay.devices(of: CloudFixture.userId).isEmpty)
        #expect(await relay.devices(of: Self.otherUserId) == ["device-1"])
    }

    @Test func aFreshSignInProvesTheKeyEvenWithARememberedRelayId() async throws {
        let relay = fakeRelay()
        try await self.relay.relayDevices.save("stale-id", for: CloudFixture.userId)
        let model = makeModel(transport: relay, session: nil)

        await signIn(model, as: CloudFixture.session)
        await model.loadSpaces()

        #expect(model.shell != nil)
        #expect(await relay.count("POST", FixtureKeys.devicesPath) == 1)
        #expect(await self.relay.relayDevices.relayId(for: CloudFixture.userId) == "device-1")
    }

    @Test func theFirstLoadOfARestoredSessionRegistersOnceAndKeepsTheRelayId() async {
        let model = makeModel(transport: transport)

        await model.loadSpaces()
        model.checkAgain()
        await model.loadSpaces()

        #expect(model.shell != nil)
        #expect(await registrations() == 1)
        #expect(
            await relay.relayDevices.relayId(for: CloudFixture.userId) == FixtureKeys.memberRelayId)
    }

    @Test(
        arguments: [
            (
                FixtureKeys.registered,
                DeviceRegistrationAnswer.registered(
                    relayId: FixtureKeys.memberRelayId, transferred: false)
            ),
            (
                FixtureKeys.registered(200, transferred: false),
                .registered(relayId: FixtureKeys.memberRelayId, transferred: false)
            ),
            (
                FixtureKeys.registered(200, transferred: true),
                .registered(relayId: FixtureKeys.memberRelayId, transferred: true)
            ),
            (
                CloudFixture.error(
                    400, code: "VALIDATION_ERROR", message: "Invalid device keys or proof"),
                .keyRefused
            ),
            (
                CloudFixture.error(403, code: "DEVICE_PROOF_INVALID", message: "Bad proof"),
                .proofRefused
            ),
            (CloudFixture.error(409, code: "DEVICE_KEY_TAKEN", message: "Taken"), .refused),
            (
                CloudFixture.error(429, code: "TOO_MANY_REQUESTS", message: "Too many requests"),
                .refused
            ),
            (CloudFixture.refused("Authentication required"), .unauthenticated),
            (
                CloudFixture.error(500, code: "INTERNAL_ERROR", message: "Internal server error"),
                .unreachable
            ),
            (ScriptedTransport.Answer.offline, .unreachable),
        ])
    func readsEveryRegistrationAnswer(
        answer: ScriptedTransport.Answer, expected: DeviceRegistrationAnswer
    ) async throws {
        await transport.answer(FixtureKeys.devicesPath, with: answer)

        #expect(
            try await cloud.registerDevice(
                FixtureKeys.member, userId: CloudFixture.userId, bearer: "b")
                == expected)
        #expect(await registrations() == 1)
    }

    @Test func aChallengeRefusedTwiceStopsAfterTheRetry() async throws {
        await transport.answer(
            FixtureKeys.devicesPath,
            with: CloudFixture.error(400, code: "DEVICE_CHALLENGE_INVALID", message: "Expired"))

        let answer = try await cloud.registerDevice(
            FixtureKeys.member, userId: CloudFixture.userId, bearer: "b")

        #expect(answer == .challengeRefused)
        #expect(await registrations() == 2)
    }

    @Test(
        arguments: [
            (
                CloudFixture.refused("Authentication required"),
                DeviceRegistrationAnswer.unauthenticated
            ),
            (
                ScriptedTransport.Answer.status(
                    201, #"{"nonce":"short","expiresAt":"2026-10-18T09:01:00.000Z"}"#), .unreachable
            ),
            (ScriptedTransport.Answer.offline, .unreachable),
        ])
    func aChallengeThatFailsSendsNoRegistration(
        answer: ScriptedTransport.Answer, expected: DeviceRegistrationAnswer
    ) async throws {
        await transport.answer(FixtureKeys.challengePath, with: answer)

        #expect(
            try await cloud.registerDevice(
                FixtureKeys.member, userId: CloudFixture.userId, bearer: "b")
                == expected)
        #expect(await registrations() == 0)
    }

    @Test(arguments: [FixtureKeys.challengePath, FixtureKeys.devicesPath, CloudFixture.spacesPath])
    func aTransportThatThrowsLandsOnSpacesUnreachable(path: String) async {
        await transport.answer(path, with: .offline)
        let model = makeModel(transport: transport)

        await model.loadSpaces()

        #expect(model.stage == .spacesUnreachable)
        #expect(model.shell == nil)
    }

    @Test(arguments: [FixtureKeys.challengePath, FixtureKeys.devicesPath, CloudFixture.spacesPath])
    func aCancelledLoadIsNotShownAsAFailure(path: String) async {
        await transport.answer(path, with: .pending)
        let model = makeModel(transport: transport)
        let loading = Task { await model.loadSpaces() }
        while await !transport.requests.contains(where: { $0.url?.path() == path }) {
            await Task.yield()
        }

        loading.cancel()
        await loading.value

        #expect(model.stage == .loadingSpaces)
    }

    @Test func aRefusedRegistrationLandsInTheStageAndKeepsNoRelayId() async {
        await transport.answer(
            FixtureKeys.devicesPath,
            with: CloudFixture.error(409, code: "DEVICE_KEY_TAKEN", message: "Taken"))
        let model = makeModel(transport: transport)

        await model.loadSpaces()

        #expect(model.stage == .deviceRefused(.notAdded))
        #expect(model.shell == nil)
        #expect(await relay.relayDevices.relayId(for: CloudFixture.userId) == nil)
    }

    @Test func unreadableDeviceKeysLandInTheStageWithoutRegistering() async {
        let keychain = InMemoryKeychain()
        await keychain.fail(DeviceKeyStore.account, with: errSecInteractionNotAllowed)
        let model = SignInModel(
            cloud: cloud, sessions: InMemorySessionStore(CloudFixture.session),
            lastSpace: InMemoryLastSpaceStore(), agreements: CloudFixture.agreements(),
            relay: RelayEnvironment(
                transport: TestRelayTransport(), clock: TestRelayClock(), keychain: keychain,
                spaceKeys: FixtureSpaceKeys()))

        await model.loadSpaces()

        #expect(model.stage == .deviceRefused(.keysUnreadable))
        #expect(await registrations() == 0)
    }

    @Test func deletingTheAccountForgetsItsRelayDevice() async {
        await transport.answer(CloudFixture.accountPath, with: CloudFixture.accountDeleted)
        let model = makeModel(transport: transport)
        await model.loadSpaces()

        model.deleteAccount()
        await model.deletion?.value

        #expect(model.stage == .signedOut)
        #expect(await relay.relayDevices.relayId(for: CloudFixture.userId) == nil)
    }

    private static func signedIn(_ session: Session) -> ScriptedTransport.Answer {
        .status(
            200,
            #"{"token":"\#(session.bearer)","user":{"id":"\#(session.userId ?? "")","email":"\#(session.email)"},"session":null}"#
        )
    }
}
