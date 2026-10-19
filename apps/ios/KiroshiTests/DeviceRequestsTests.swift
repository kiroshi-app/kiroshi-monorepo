import CryptoKit
import Foundation
import Testing

@testable import Kiroshi

@MainActor
struct DeviceRequestsTests {
    static let now = Date(timeIntervalSince1970: 1_792_000_000)
    static let asking = AccountDevice(
        id: "5d2c0000-0000-4000-8000-0000000000c1", name: "Noa’s MacBook Air", kind: .computer,
        isPending: true, approvalExpiresAt: now.addingTimeInterval(600), isCurrent: false,
        signingKey: FixtureKeys.host.signing.publicKey.rawRepresentation)
    static let approvePath = "/devices/\(asking.id)/approve"
    static let rejectPath = "/devices/\(asking.id)/reject"

    let transport = ScriptedTransport()
    let clock = TestRelayClock()

    func makeRequests(_ devices: [AccountDevice]) -> DeviceRequests {
        DeviceRequests(
            bearer: CloudFixture.session.bearer,
            cloud: KiroshiCloud(baseURL: KiroshiCloud.productionURL, transport: transport),
            states: FixtureDeviceStates(devices: .devices(devices)), clock: clock,
            now: { [now = Self.now] in now })
    }

    func readOnce(_ requests: DeviceRequests) async {
        let watching = Task { await requests.watch() }
        _ = await clock.nextSleep(of: DeviceRequests.checkInterval)
        watching.cancel()
        await watching.value
    }

    func count(_ path: String) async -> Int {
        await transport.requests.filter { $0.httpMethod == "POST" && $0.url?.path() == path }.count
    }

    @Test func anotherDeviceAskingShowsItsNameAndTheFingerprintOfItsKey() async throws {
        let requests = makeRequests([Self.asking])

        await readOnce(requests)

        let asking = try #require(requests.asking)
        let words = try #require(Fingerprint.bundledWords())
        #expect(asking.device.name == "Noa’s MacBook Air")
        #expect(
            asking.fingerprint == Fingerprint.of(FixtureKeys.host.signing.publicKey, words: words))
        #expect(asking.askedAt == Self.now.addingTimeInterval(600 - DeviceRequest.approvalWindow))
    }

    @Test func thisDeviceApprovedDevicesAndExpiredRequestsAreNotAsked() async {
        let current = AccountDevice(
            id: "current", name: "Sam’s iPhone", kind: .phone, isPending: true,
            approvalExpiresAt: Self.now.addingTimeInterval(600), isCurrent: true,
            signingKey: Self.asking.signingKey)
        let approved = AccountDevice(
            id: "approved", name: "Studio Mac", kind: .computer, isPending: false,
            approvalExpiresAt: nil, isCurrent: false, signingKey: Self.asking.signingKey)
        let expired = AccountDevice(
            id: "expired", name: "Old Mac", kind: .computer, isPending: true,
            approvalExpiresAt: Self.now.addingTimeInterval(-1), isCurrent: false,
            signingKey: Self.asking.signingKey)
        let requests = makeRequests([current, approved, expired])

        await readOnce(requests)

        #expect(requests.asking == nil)
    }

    @Test func approvingSendsTheApprovalAndClosesTheSheet() async throws {
        await transport.answer(Self.approvePath, with: .status(204, ""))
        let requests = makeRequests([Self.asking])
        await readOnce(requests)

        requests.approve()
        await requests.decision?.value

        #expect(requests.asking == nil)
        #expect(await count(Self.approvePath) == 1)
    }

    @Test func notMeRefusesTheDeviceAndClosesTheSheet() async throws {
        await transport.answer(Self.rejectPath, with: .status(204, ""))
        let requests = makeRequests([Self.asking])
        await readOnce(requests)

        requests.refuse()
        await requests.decision?.value

        #expect(requests.asking == nil)
        #expect(await count(Self.rejectPath) == 1)
    }

    @Test func anAnsweredDeviceIsNotAskedAgainOnTheNextRead() async {
        await transport.answer(Self.approvePath, with: .status(204, ""))
        let requests = makeRequests([Self.asking])
        await readOnce(requests)
        requests.approve()
        await requests.decision?.value

        await readOnce(requests)

        #expect(requests.asking == nil)
    }

    @Test func aDismissedSheetIsNotShownAgain() async {
        let requests = makeRequests([Self.asking])
        await readOnce(requests)

        requests.dismiss()
        await readOnce(requests)

        #expect(requests.asking == nil)
    }

    @Test(
        arguments: [
            (ScriptedTransport.Answer.offline, DeviceRequestProblem.couldNotApprove),
            (
                CloudFixture.error(410, code: "DEVICE_APPROVAL_EXPIRED", message: "Expired"),
                .expired
            ),
        ])
    func anApprovalThatFailsKeepsTheSheetWithTheReason(
        answer: ScriptedTransport.Answer, problem: DeviceRequestProblem
    ) async {
        await transport.answer(Self.approvePath, with: answer)
        let requests = makeRequests([Self.asking])
        await readOnce(requests)

        requests.approve()
        await requests.decision?.value

        #expect(requests.asking?.id == Self.asking.id)
        #expect(requests.problem == problem)
        #expect(!requests.isDeciding)
    }

    @Test func theDeviceListDecodesEachKeyAndTheRefusals() async throws {
        let key = FixtureKeys.host.signing.publicKey.rawRepresentation
        let body = #"""
            [{"id":"d1","name":"Noa’s MacBook Air","kind":"computer","status":"pending","approvalExpiresAt":"2026-10-18T09:30:00.000Z","lastActiveAt":"2026-10-18T09:00:00.000Z","createdAt":"2026-10-18T09:00:00.000Z","current":false,"ed25519PublicKey":"\#(key.unpaddedBase64URL)"}]
            """#
        await transport.answer("/devices", with: .status(200, body))
        let states = CloudDeviceStates(baseURL: KiroshiCloud.productionURL, transport: transport)

        let answer = try await states.devices(bearer: "b")

        guard case .devices(let devices) = answer else {
            Issue.record("Expected devices, got \(answer)")
            return
        }
        #expect(devices.map(\.id) == ["d1"])
        #expect(devices.first?.signingKey == key)
        #expect(devices.first?.isPending == true)
        #expect(devices.first?.approvalExpiresAt == Date(timeIntervalSince1970: 1_792_315_800))

        await transport.answer(
            "/devices", with: CloudFixture.error(403, code: "DEVICE_NOT_APPROVED", message: "No"))
        #expect(try await states.devices(bearer: "b") == .notApproved)
    }

    @Test(
        arguments: [
            (
                ScriptedTransport.Answer.status(200, #"{"status":"approved"}"#),
                OwnDeviceState.approved
            ),
            (.status(200, #"{"status":"pending"}"#), .pending),
            (.status(200, #"{"status":"expired"}"#), .expired),
            (CloudFixture.refused("Authentication required"), .refused),
            (.offline, .unreachable),
        ])
    func theOwnStateReadsEveryAnswer(answer: ScriptedTransport.Answer, state: OwnDeviceState)
        async throws
    {
        await transport.answer("/devices/current", with: answer)
        let states = CloudDeviceStates(baseURL: KiroshiCloud.productionURL, transport: transport)

        #expect(try await states.ownState(bearer: "b") == state)
    }
}
