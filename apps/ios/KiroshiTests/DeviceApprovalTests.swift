import CryptoKit
import Foundation
import Testing

@testable import Kiroshi

@MainActor
struct DeviceApprovalTests {
    let transport = ScriptedTransport([
        CloudFixture.spacesPath: CloudFixture.threeSpaces,
        FixtureKeys.devicesPath: FixtureKeys.registeredPending,
        FixtureKeys.approvalCodePath: .status(204, ""),
    ])
    let clock = TestRelayClock()
    let sessions = InMemorySessionStore(CloudFixture.session)

    var relay: RelayEnvironment {
        RelayEnvironment(transport: TestRelayTransport(), clock: clock)
    }

    func makeModel(
        states: FixtureDeviceStates = FixtureDeviceStates(own: [.pending]),
        relay: RelayEnvironment? = nil
    ) -> SignInModel {
        SignInModel(
            cloud: KiroshiCloud(baseURL: KiroshiCloud.productionURL, transport: transport),
            sessions: sessions, lastSpace: InMemoryLastSpaceStore(),
            agreements: CloudFixture.agreements(), relay: relay ?? self.relay,
            deviceStates: states)
    }

    func count(_ method: String, _ path: String) async -> Int {
        await transport.requests.filter {
            $0.httpMethod ?? "GET" == method && $0.url?.path() == path
        }
        .count
    }

    func waitingModel(states: FixtureDeviceStates = FixtureDeviceStates(own: [.pending]))
        async
        throws -> (SignInModel, DeviceApproval)
    {
        let model = makeModel(states: states)
        await model.loadSpaces()
        return (model, try #require(model.approval))
    }

    @Test func aRestoredSessionRegistersAgainOnLaunchEvenWithARememberedDevice() async throws {
        await transport.answer(FixtureKeys.devicesPath, with: FixtureKeys.registered)
        let relay = self.relay
        try await relay.relayDevices.save(FixtureKeys.memberRelayId, for: CloudFixture.userId)
        let model = makeModel(relay: relay)

        await model.loadSpaces()

        #expect(model.shell != nil)
        #expect(await count("POST", FixtureKeys.devicesPath) == 1)
    }

    @Test func aPendingDeviceWaitsWithItsFingerprintAndReadsNoSpace() async throws {
        let (model, approval) = try await waitingModel()

        #expect(model.stage == .awaitingApproval)
        #expect(approval.stage == .waiting)
        #expect(approval.fingerprint.count == 6)
        #expect(model.fingerprint == approval.fingerprint)
        #expect(await count("GET", CloudFixture.spacesPath) == 0)
    }

    @Test func anApprovalShowsTheSpacesWithoutRegisteringAgain() async throws {
        let (model, approval) = try await waitingModel(
            states: FixtureDeviceStates(own: [.pending, .approved]))

        let watching = Task { await approval.watch() }
        await clock.wakeNextSleep(of: DeviceApproval.checkInterval)
        await watching.value
        #expect(approval.stage == .approved)

        await model.loadSpaces()

        #expect(model.shell != nil)
        #expect(model.approval == nil)
        #expect(await count("POST", FixtureKeys.devicesPath) == 1)
    }

    @Test func notMeFromAnotherDeviceSignsThisOneOutAtOnce() async throws {
        let (model, approval) = try await waitingModel(states: FixtureDeviceStates(own: [.refused]))

        await approval.watch()

        #expect(approval.stage == .refused)
        #expect(sessions.saved == nil)
        approval.signOut()
        #expect(model.stage == .signedOut)
        #expect(await count("POST", CloudFixture.signOutPath) == 0)
    }

    @Test func anExpiredRequestStopsCheckingUntilAskedAgain() async throws {
        let states = FixtureDeviceStates(own: [.expired])
        let (model, approval) = try await waitingModel(states: states)

        await approval.watch()

        #expect(approval.stage == .expired)
        #expect(await states.ownStateReads == 1)

        approval.askAgain()
        await model.askingAgain?.value

        #expect(await count("POST", FixtureKeys.devicesPath) == 2)
        #expect(model.stage == .awaitingApproval)
        #expect(model.approval?.stage == .waiting)
    }

    @Test func aStateThatCanNotBeReadKeepsWaiting() async throws {
        let states = FixtureDeviceStates(own: [.unreachable, .pending])
        let (_, approval) = try await waitingModel(states: states)

        let watching = Task { await approval.watch() }
        await clock.wakeNextSleep(of: DeviceApproval.checkInterval)
        _ = await clock.nextSleep(of: DeviceApproval.checkInterval)
        watching.cancel()
        await watching.value

        #expect(approval.stage == .waiting)
        #expect(await states.ownStateReads == 2)
    }

    @Test func noOtherDeviceEmailsACodeThatApprovesThisIPhone() async throws {
        let (_, approval) = try await waitingModel()

        await approval.requestCode(opening: true)
        #expect(approval.stage == .code)
        #expect(await count("POST", FixtureKeys.approvalCodePath) == 1)

        await transport.answer(FixtureKeys.approvalCodeVerifyPath, with: .status(204, ""))
        approval.code = "482913"
        await approval.verify()

        #expect(approval.stage == .approved)
        let body = try #require(await transport.requests.last?.httpBody)
        #expect(try JSONDecoder().decode([String: String].self, from: body) == ["code": "482913"])
    }

    @Test func threeWrongCodesAskForANewOne() async throws {
        let (_, approval) = try await waitingModel()
        await approval.requestCode(opening: true)
        await transport.answer(
            FixtureKeys.approvalCodeVerifyPath,
            with: CloudFixture.error(400, code: "DEVICE_CODE_INVALID", message: "Wrong"))

        for _ in 0..<2 {
            approval.code = "000000"
            await approval.verify()
            #expect(approval.codeProblem == .wrongCode)
        }
        await approval.verify()
        #expect(approval.codeProblem == .tooManyWrongCodes)
        #expect(approval.needsNewCode)

        await approval.requestCode(opening: false)
        #expect(approval.codeProblem == nil)
        #expect(approval.code.isEmpty)
    }

    @Test(
        arguments: [
            (
                CloudFixture.error(429, code: "TOO_MANY_REQUESTS", message: "Too many requests"),
                ApprovalCodeProblem.tooManyCodes
            ),
            (ScriptedTransport.Answer.offline, .unreachable),
            (
                CloudFixture.error(503, code: "SERVICE_UNAVAILABLE", message: "No email"),
                .unreachable
            ),
        ])
    func aCodeThatCanNotBeSentSaysSoAndKeepsWaiting(
        answer: ScriptedTransport.Answer, problem: ApprovalCodeProblem
    ) async throws {
        await transport.answer(FixtureKeys.approvalCodePath, with: answer)
        let (_, approval) = try await waitingModel()

        await approval.requestCode(opening: true)

        #expect(approval.stage == .waiting)
        #expect(approval.requestProblem == problem)
    }

    @Test func aCodeAskedForAfterTheRequestExpiredShowsTheExpiry() async throws {
        await transport.answer(
            FixtureKeys.approvalCodePath,
            with: CloudFixture.error(410, code: "DEVICE_APPROVAL_EXPIRED", message: "Expired"))
        let (_, approval) = try await waitingModel()

        await approval.requestCode(opening: true)

        #expect(approval.stage == .expired)
    }

    @Test func signingOutWhileWaitingEndsTheSession() async throws {
        let (model, approval) = try await waitingModel()

        approval.signOut()

        #expect(model.stage == .signedOut)
        #expect(sessions.saved == nil)
        #expect(model.approval == nil)
    }

    @Test func registrationReadsThePendingStatus() async throws {
        let cloud = KiroshiCloud(baseURL: KiroshiCloud.productionURL, transport: transport)

        let answer = try await cloud.registerDevice(
            FixtureKeys.member, userId: CloudFixture.userId, bearer: "b")

        #expect(
            answer
                == .registered(
                    relayId: FixtureKeys.memberRelayId, transferred: false, isPending: true))
    }
}
