import Foundation
import Security
import Testing

@testable import Kiroshi

@MainActor
struct DeviceRegistrationTests {
    let transport = ScriptedTransport([CloudFixture.spacesPath: CloudFixture.threeSpaces])

    var cloud: KiroshiCloud {
        KiroshiCloud(baseURL: KiroshiCloud.productionURL, transport: transport)
    }

    func makeModel(relay: RelayEnvironment) -> SignInModel {
        SignInModel(
            cloud: cloud, sessions: InMemorySessionStore(CloudFixture.session),
            lastSpace: InMemoryLastSpaceStore(), agreements: CloudFixture.agreements(),
            relay: relay)
    }

    func registrations() async -> Int {
        await transport.requests.filter { $0.url?.path() == FixtureKeys.devicesPath }.count
    }

    @Test func registersBothPublicKeysWithTheBearer() async throws {
        let answer = try await cloud.registerDevice(FixtureKeys.member, bearer: "fixture-bearer")

        #expect(answer == .registered(relayId: FixtureKeys.memberRelayId))
        let request = try #require(await transport.requests.last)
        #expect(request.httpMethod == "POST")
        #expect(request.url?.absoluteString == "https://api.kiroshi.app/devices")
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer fixture-bearer")
        let body = try JSONDecoder().decode(
            [String: String].self, from: try #require(request.httpBody))
        #expect(body.keys.sorted() == ["ed25519PublicKey", "x25519PublicKey"])
        #expect(
            body["ed25519PublicKey"]
                == base64URL(FixtureKeys.member.signing.publicKey.rawRepresentation))
        #expect(
            body["x25519PublicKey"]
                == base64URL(FixtureKeys.member.agreement.publicKey.rawRepresentation))
        #expect(body.values.allSatisfy { $0.count == 43 })
    }

    @Test(
        arguments: [
            (
                ScriptedTransport.Answer.status(
                    200, #"{"id":"existing-id","createdAt":"2026-10-17T09:00:00.000Z"}"#),
                DeviceRegistrationAnswer.registered(relayId: "existing-id")
            ),
            (
                CloudFixture.error(409, code: "DEVICE_KEY_TAKEN", message: "Taken"),
                DeviceRegistrationAnswer.keyTaken
            ),
            (
                CloudFixture.error(409, code: "ALREADY_MEMBER", message: "Other"),
                DeviceRegistrationAnswer.unreachable
            ),
            (CloudFixture.refused("Authentication required"), .unauthenticated),
            (ScriptedTransport.Answer.offline, .unreachable),
        ])
    func readsEveryAnswer(answer: ScriptedTransport.Answer, expected: DeviceRegistrationAnswer)
        async throws
    {
        await transport.answer(FixtureKeys.devicesPath, with: answer)

        #expect(try await cloud.registerDevice(FixtureKeys.member, bearer: "b") == expected)
    }

    @Test func theFirstLoadRegistersOnceAndKeepsTheRelayIdOfTheAccount() async {
        let relay = RelayEnvironment(transport: TestRelayTransport(), clock: TestRelayClock())
        let model = makeModel(relay: relay)

        await model.loadSpaces()
        model.checkAgain()
        await model.loadSpaces()

        #expect(model.shell != nil)
        #expect(await registrations() == 1)
        #expect(
            await relay.relayDevices.relayId(for: CloudFixture.userId) == FixtureKeys.memberRelayId)
    }

    @Test func keysTakenByAnotherAccountLandInTheStage() async {
        await transport.answer(
            FixtureKeys.devicesPath,
            with: CloudFixture.error(409, code: "DEVICE_KEY_TAKEN", message: "Taken"))
        let relay = RelayEnvironment(transport: TestRelayTransport(), clock: TestRelayClock())
        let model = makeModel(relay: relay)

        await model.loadSpaces()

        #expect(model.stage == .deviceRefused(.keyTaken))
        #expect(model.shell == nil)
        #expect(await relay.relayDevices.relayId(for: CloudFixture.userId) == nil)
    }

    @Test func unreadableDeviceKeysLandInTheStageWithoutRegistering() async {
        let keychain = InMemoryKeychain()
        await keychain.fail(DeviceKeyStore.signingAccount, with: errSecInteractionNotAllowed)
        let model = makeModel(
            relay: RelayEnvironment(
                transport: TestRelayTransport(), clock: TestRelayClock(), keychain: keychain,
                spaceKeys: FixtureSpaceKeys()))

        await model.loadSpaces()

        #expect(model.stage == .deviceRefused(.keysUnreadable))
        #expect(await registrations() == 0)
    }

    @Test func deletingTheAccountForgetsItsRelayDevice() async {
        await transport.answer(CloudFixture.accountPath, with: CloudFixture.accountDeleted)
        let relay = RelayEnvironment(transport: TestRelayTransport(), clock: TestRelayClock())
        let model = makeModel(relay: relay)
        await model.loadSpaces()

        model.deleteAccount()
        await model.deletion?.value

        #expect(model.stage == .signedOut)
        #expect(await relay.relayDevices.relayId(for: CloudFixture.userId) == nil)
    }

    private func base64URL(_ bytes: Data) -> String {
        bytes.base64EncodedString().replacing("+", with: "-").replacing("/", with: "_")
            .replacing("=", with: "")
    }
}
