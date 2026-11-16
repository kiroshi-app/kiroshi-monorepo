import Foundation
import Observation
import Testing

@testable import Kiroshi

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct RelayReplayTests {
    enum Heard: Equatable {
        case event(Int)
        case reread
    }

    @MainActor
    final class Listener {
        private var iterator: AsyncStream<RelayUpdate>.Iterator

        init(_ updates: AsyncStream<RelayUpdate>) {
            iterator = updates.makeAsyncIterator()
        }

        func next() async -> Heard? {
            while let update = await nextUpdate() {
                switch update {
                case .state: continue
                case .event(let event): return Self.heard(event)
                default: return .reread
                }
            }
            return nil
        }

        func next(_ count: Int) async -> [Heard] {
            var heard: [Heard] = []
            for _ in 0..<count {
                guard let next = await next() else { break }
                heard.append(next)
            }
            return heard
        }

        func next(through last: Heard) async -> [Heard] {
            var heard: [Heard] = []
            while let next = await next() {
                heard.append(next)
                if next == last {
                    break
                }
            }
            return heard
        }

        func online() async {
            while let update = await nextUpdate() {
                if case .state(.online) = update {
                    return
                }
            }
        }

        func dropped() async {
            while let update = await nextUpdate() {
                if case .state(.unreachable) = update {
                    return
                }
            }
        }

        func state(atTheRereadAfter last: Heard) async -> RelayState? {
            var state: RelayState?
            var isPastLast = false
            while let update = await nextUpdate() {
                switch update {
                case .state(let next):
                    state = next
                case .event(let event):
                    isPastLast = isPastLast || Self.heard(event) == last
                case .reread where isPastLast:
                    return state
                case .reread:
                    continue
                }
            }
            return nil
        }

        private static func heard(_ event: RelayEvent) -> Heard {
            .event((try? event.payload(as: Int.self)) ?? -1)
        }

        private func nextUpdate() async -> RelayUpdate? {
            var iterator = iterator
            defer { self.iterator = iterator }
            return await iterator.next(isolation: #isolation)
        }
    }

    struct ResumeArgs: Decodable {
        let epoch: String
        let since: Int
        let token: String
    }

    let transport = TestRelayTransport()
    let clock = TestRelayClock()

    func makeConnection() -> RelayConnection {
        RelayConnection(
            baseURL: KiroshiCloud.productionURL, instanceId: "instance-1", bearer: "fixture-bearer",
            environment: RelayEnvironment(transport: transport, clock: clock),
            backoff: Backoff(jitter: { $0 }))
    }

    func connect(_ connection: RelayConnection, to host: TestHost) async -> Listener {
        let listener = Listener(await connection.updates())
        await connection.start()
        await transport.nextOpening().accept(host.socket)
        await listener.online()
        return listener
    }

    func reconnect(_ listener: Listener, from host: TestHost, to next: TestHost) async {
        host.socket.push(.close(1006))
        await clock.wakeNextSleep(of: .seconds(1))
        await transport.nextOpening().accept(next.socket)
        await listener.online()
    }

    func resumed(on host: TestHost) async throws -> (TestCall, ResumeArgs) {
        let call = try #require(await host.nextCall("relay_resume"))
        return (call, try call.args(as: ResumeArgs.self))
    }

    func waitUntil(_ condition: @escaping @MainActor @Sendable () -> Bool) async {
        for await isMet in Observations({ condition() }) where isMet {
            return
        }
    }

    static func stamped(
        _ seq: Int, epoch: String = "e-1", payload: Int? = nil, token: String? = nil
    ) -> String {
        frame(
            event: "test://replay", payload: "\(payload ?? seq)",
            stamp: #""epoch":"\#(epoch)","seq":\#(seq)"#, token: token)
    }

    static func frame(event: String, payload: String, stamp: String, token: String? = nil)
        -> String
    {
        let replayFor = token.map { #","token":"\#($0)""# } ?? ""
        return #"{"event":{"event":"\#(event)","payload":\#(payload)},\#(stamp)\#(replayFor)}"#
    }

    static func resumeAnswer(_ call: TestCall, token: String, _ outcome: String) -> String {
        TestHost.ok(call, #"{"token":"\#(token)",\#(outcome)}"#)
    }

    @Test func aReconnectResumesFromTheLastAppliedSeqAndAppliesWhatItMissedOnceInOrder()
        async throws
    {
        let host = TestHost()
        let connection = makeConnection()
        let heard = await connect(connection, to: host)
        #expect(await heard.next() == .reread)
        for seq in 1...3 {
            host.reply(Self.stamped(seq))
        }
        #expect(await heard.next(3) == [.event(1), .event(2), .event(3)])

        let back = TestHost()
        await reconnect(heard, from: host, to: back)
        let (call, args) = try await resumed(on: back)
        back.reply(Self.stamped(6))
        for seq in [5, 3, 4, 5, 6] {
            back.reply(Self.stamped(seq, token: args.token))
        }
        back.reply(Self.resumeAnswer(call, token: args.token, #""replayed":3"#))
        back.reply(Self.stamped(7))

        #expect(args.epoch == "e-1")
        #expect(args.since == 3)
        #expect(await heard.next(4) == [.event(4), .event(5), .event(6), .event(7)])
        await connection.stop()
    }

    @Test func aSocketOpenWithNoEpochYetRereadsEachTime() async {
        let host = TestHost()
        let connection = makeConnection()
        let heard = await connect(connection, to: host)
        host.push(event: "test://unstamped", payload: "99")
        #expect(await heard.next(2) == [.reread, .event(99)])

        let back = TestHost()
        await reconnect(heard, from: host, to: back)
        back.push(event: "test://unstamped", payload: "98")

        #expect(await heard.next(2) == [.reread, .event(98)])
        await connection.stop()
    }

    @Test func aFrameOfAnotherEpochIsAdoptedAppliedAndRereads() async {
        let host = TestHost()
        let connection = makeConnection()
        let heard = await connect(connection, to: host)
        #expect(await heard.next() == .reread)

        host.reply(Self.stamped(1))
        host.reply(Self.stamped(2))
        host.reply(Self.stamped(1, epoch: "e-2", payload: 21))
        host.reply(Self.stamped(2, epoch: "e-2", payload: 22))

        #expect(
            await heard.next(5) == [.event(1), .event(2), .reread, .event(21), .event(22)])
        await connection.stop()
    }

    @Test func aTooOldAnswerRereadsAndAdoptsTheNextFrame() async throws {
        let host = TestHost()
        let connection = makeConnection()
        let heard = await connect(connection, to: host)
        #expect(await heard.next() == .reread)
        host.reply(Self.stamped(3))
        #expect(await heard.next() == .event(3))

        let back = TestHost()
        await reconnect(heard, from: host, to: back)
        let (call, args) = try await resumed(on: back)
        back.reply(Self.resumeAnswer(call, token: args.token, #""tooOld":true"#))
        for seq in [40, 41, 41, 42] {
            back.reply(Self.stamped(seq))
        }

        #expect(await heard.next(4) == [.reread, .event(40), .event(41), .event(42)])
        await connection.stop()
    }

    @Test func aResumeLeftUnansweredFor300SecondsRereadsAndAdoptsTheNextFrame() async throws {
        let host = TestHost()
        let connection = makeConnection()
        let heard = await connect(connection, to: host)
        #expect(await heard.next() == .reread)
        host.reply(Self.stamped(1))
        host.reply(Self.stamped(3))
        let (_, args) = try await resumed(on: host)

        await clock.wakeNextSleep(of: .seconds(300))
        #expect(await heard.next(2) == [.event(1), .reread])
        host.reply(Self.stamped(9))

        #expect(args.since == 1)
        #expect(await heard.next() == .event(9))
        await connection.stop()
    }

    @Test func aFrameReplayedForAnotherMemberIsDropped() async throws {
        let host = TestHost()
        let connection = makeConnection()
        let heard = await connect(connection, to: host)
        #expect(await heard.next() == .reread)
        host.reply(Self.stamped(1))
        host.reply(Self.stamped(2, payload: 200, token: "not-mine"))
        host.reply(Self.stamped(2))
        #expect(await heard.next(2) == [.event(1), .event(2)])

        host.reply(Self.stamped(4))
        let (call, args) = try await resumed(on: host)
        host.reply(Self.stamped(3, payload: 300, token: "not-mine"))
        host.reply(Self.resumeAnswer(call, token: "not-mine", #""tooOld":true"#))
        host.reply(Self.stamped(3, token: args.token))
        host.reply(Self.resumeAnswer(call, token: args.token, #""replayed":1"#))

        #expect(await heard.next(2) == [.event(3), .event(4)])
        await connection.stop()
    }

    @Test func framesHeldDuringAResumeAreAppliedAfterTheReplayedOnesInSeqOrder() async throws {
        let host = TestHost()
        let connection = makeConnection()
        let heard = await connect(connection, to: host)
        #expect(await heard.next() == .reread)
        host.reply(Self.stamped(1))

        host.reply(Self.stamped(3))
        let (call, args) = try await resumed(on: host)
        host.reply(Self.stamped(5))
        host.reply(Self.stamped(4))
        host.reply(Self.stamped(2, token: args.token))
        host.reply(Self.stamped(3, token: args.token))
        host.reply(Self.resumeAnswer(call, token: args.token, #""replayed":2"#))
        host.reply(Self.stamped(6))

        #expect(args.since == 1)
        #expect(
            await heard.next(6) == [
                .event(1), .event(2), .event(3), .event(4), .event(5), .event(6),
            ])
        await connection.stop()
    }

    @Test func aResyncDuringAResumeDropsItAndResumesAgainWithAFreshToken() async throws {
        let host = TestHost()
        let connection = makeConnection()
        let heard = await connect(connection, to: host)
        #expect(await heard.next() == .reread)
        host.reply(Self.stamped(1))
        host.reply(Self.stamped(3))
        let (first, firstArgs) = try await resumed(on: host)

        host.reply(#"{"resync":{"answered":[]}}"#)
        let (fresh, freshArgs) = try await resumed(on: host)
        host.reply(Self.stamped(2, payload: 200, token: firstArgs.token))
        host.reply(Self.resumeAnswer(first, token: firstArgs.token, #""replayed":1"#))
        host.reply(Self.stamped(2, token: freshArgs.token))
        host.reply(Self.stamped(3, token: freshArgs.token))
        host.reply(Self.resumeAnswer(fresh, token: freshArgs.token, #""replayed":2"#))
        host.reply(Self.stamped(4))

        #expect(freshArgs.token != firstArgs.token)
        #expect(freshArgs.since == 1)
        #expect(await heard.next(4) == [.event(1), .event(2), .event(3), .event(4)])
        await connection.stop()
    }

    @Test func heldFramesPastTheBoundRereadAndTheNextFrameIsAdopted() async throws {
        let host = TestHost()
        let connection = makeConnection()
        let heard = await connect(connection, to: host)
        #expect(await heard.next() == .reread)
        host.reply(Self.stamped(1))
        host.reply(Self.stamped(3))
        _ = try await resumed(on: host)

        let pastTheBound = 3 + EventSequence.heldFramesBound
        for seq in 4...pastTheBound + 1 {
            host.reply(Self.stamped(seq))
        }

        #expect(await heard.next(3) == [.event(1), .reread, .event(pastTheBound + 1)])
        await connection.stop()
    }

    @Test func aFrameToEveryoneIsPlacedByItsSeqAtThisAccountOrElseByRest() async throws {
        let host = TestHost()
        let connection = RelayConnection(
            baseURL: KiroshiCloud.productionURL, instanceId: "instance-1", bearer: "fixture-bearer",
            environment: RelayEnvironment(transport: transport, clock: clock), accountId: "bob",
            backoff: Backoff(jitter: { $0 }))
        let heard = await connect(connection, to: host)
        #expect(await heard.next() == .reread)
        func toEveryone(_ payload: Int, rest: Int, seqs: String) -> String {
            Self.frame(
                event: "test://replay", payload: "\(payload)",
                stamp: #""epoch":"e-1","rest":\#(rest),"seqs":\#(seqs)"#)
        }

        host.reply(Self.stamped(1))
        host.reply(toEveryone(2, rest: 9, seqs: #"{"bob":2,"ann":7}"#))
        host.reply(Self.stamped(3))
        host.reply(toEveryone(4, rest: 4, seqs: #"{"ann":8}"#))
        host.reply(toEveryone(6, rest: 5, seqs: #"{"bob":6}"#))
        let (_, args) = try await resumed(on: host)

        #expect(args.since == 4)
        #expect(await heard.next(4) == [.event(1), .event(2), .event(3), .event(4)])
        await connection.stop()
    }

    static func agent(_ seq: Int, _ change: String, token: String? = nil) -> String {
        let payload =
            #"{"scope":{"conversationId":"chat-juniper","botId":"juniper","runtimeSessionId":"session-1","epoch":1},"event":\#(change),"turn":{"turnId":"turn-1","conversationId":"chat-juniper"}}"#
        return frame(
            event: "agent://event", payload: payload, stamp: #""epoch":"e-1","seq":\#(seq)"#,
            token: token)
    }

    @Test func aTurnEndMissedWhileTheSocketWasDownIsReplayedAndTheWorkingLineGoes()
        async throws
    {
        let work = CompanionWork()
        let host = TestHost()
        let connection = makeConnection()
        let updates = await connection.updates()
        let feeding = Task {
            for await update in updates {
                work.apply(update)
            }
        }
        let heard = await connect(connection, to: host)
        host.reply(Self.agent(1, #"{"type":"turnChanged","state":"running"}"#))
        await waitUntil { work.workers.count == 1 }

        let back = TestHost()
        await reconnect(heard, from: host, to: back)
        let (call, args) = try await resumed(on: back)
        #expect(work.workers.map(\.companionId) == ["juniper"])
        back.reply(
            Self.agent(
                2, #"{"type":"turnEnded","ended":{"sessionId":null,"outcome":"success"}}"#,
                token: args.token))
        back.reply(Self.resumeAnswer(call, token: args.token, #""replayed":1"#))
        await waitUntil { work.workers.isEmpty }

        #expect(work.workers.isEmpty)
        feeding.cancel()
        await connection.stop()
    }

    @Test func aThreadThatLostItsSocketResumesAndRereadsNothing() async throws {
        let pageCalls = RelayResyncTests.CallCount()
        let callsAfterTheDrop = RelayResyncTests.CallCount()
        let juniper = Companion(id: "juniper", name: "Juniper")
        let host = TestHost(
            messages: ["chat-juniper": [RelayResyncTests.message(1), RelayResyncTests.message(2)]],
            answer: { call in
                if call.command == "conversation_message_page" {
                    _ = pageCalls.next()
                }
                return nil
            })
        let store = ThreadStore(subject: .companion(juniper), work: CompanionWork())
        let connection = makeConnection()
        let following = Task { await store.follow(connection) }
        let heard = await connect(connection, to: host)
        await waitUntil { store.phase == .loaded && store.entries.count == 2 }
        func stored(_ seq: Int, at place: Int, token: String? = nil) -> String {
            Self.frame(
                event: "conversation://message-stored", payload: RelayResyncTests.message(seq),
                stamp: #""epoch":"e-1","seq":\#(place)"#, token: token)
        }
        host.reply(stored(3, at: 1))
        await waitUntil { store.entries.count == 3 }

        let back = TestHost(answer: { call in
            if call.command != "relay_resume" {
                _ = callsAfterTheDrop.next()
            }
            return nil
        })
        await reconnect(heard, from: host, to: back)
        let (call, args) = try await resumed(on: back)
        back.reply(stored(6, at: 4))
        back.reply(stored(4, at: 2, token: args.token))
        back.reply(stored(5, at: 3, token: args.token))
        back.reply(stored(4, at: 2, token: args.token))
        back.reply(Self.resumeAnswer(call, token: args.token, #""replayed":2"#))
        back.reply(stored(7, at: 5))
        await waitUntil { store.entries.count == 7 }

        #expect(args.since == 1)
        #expect(store.entries.map(\.id) == (1...7).map { "m\($0)" })
        #expect(pageCalls.value == 1)
        #expect(callsAfterTheDrop.value == 0)
        following.cancel()
        await connection.stop()
    }

    func replayedBatch(after applied: Int, through last: Int, on host: TestHost) async throws {
        for seq in applied + 2...last {
            host.reply(Self.stamped(seq))
        }
        let (call, args) = try await resumed(on: host)
        host.reply(Self.stamped(applied + 1, token: args.token))
        host.reply(Self.resumeAnswer(call, token: args.token, #""replayed":1"#))
    }

    @Test func aStoreThatJoinsWhileTheSocketIsBackReadsOnceAndTheLoadedOnesReadNothing()
        async throws
    {
        let threadReads = RelayResyncTests.CallCount()
        let missionReads = RelayResyncTests.CallCount()
        let missionPage = TestHost.messagePage(
            "thread-mission-1", [MissionTesting.message(id: "t1", seq: 1, content: "Go")],
            hasMore: false)
        let juniper = Companion(id: "juniper", name: "Juniper")
        let messages = [
            "chat-juniper": [RelayResyncTests.message(1), RelayResyncTests.message(2)]
        ]
        let host = TestHost(messages: messages)
        let loaded = ThreadStore(subject: .companion(juniper), work: CompanionWork())
        let connection = makeConnection()
        let followingLoaded = Task { await loaded.follow(connection) }
        let heard = await connect(connection, to: host)
        await waitUntil { loaded.phase == .loaded && loaded.entries.count == 2 }
        host.reply(Self.stamped(1))
        #expect(await heard.next(2) == [.reread, .event(1)])

        host.socket.push(.close(1006))
        await heard.dropped()
        let joining = ThreadStore(subject: .companion(juniper), work: CompanionWork())
        let mission = MissionThreadStore(
            mission: MissionTesting.mission(), missions: MissionsStore(), work: CompanionWork())
        let followingJoining = Task { await joining.follow(connection) }
        let followingMission = Task { await mission.follow(connection) }
        while await connection.subscriberCount < 4 {
            await Task.yield()
        }
        let back = TestHost(
            messages: messages,
            answer: { call in
                guard call.command == "conversation_message_page" else { return nil }
                guard call.text.contains("thread-mission-1") else {
                    _ = threadReads.next()
                    return nil
                }
                _ = missionReads.next()
                return TestHost.ok(call, missionPage)
            })
        await clock.wakeNextSleep(of: .seconds(1))
        await transport.nextOpening().accept(back.socket)
        let (call, args) = try await resumed(on: back)
        back.reply(Self.resumeAnswer(call, token: args.token, #""replayed":0"#))
        await waitUntil { joining.phase == .loaded && mission.hasLoaded }
        back.reply(Self.stamped(2))

        #expect(args.since == 1)
        #expect(await heard.next() == .event(2))
        #expect(joining.entries.count == 2)
        #expect(threadReads.value == 1)
        #expect(missionReads.value == 1)
        for following in [followingLoaded, followingJoining, followingMission] {
            following.cancel()
        }
        await connection.stop()
    }

    @Test func aSubscriberThatFallsBehindAReplayHearsARereadAndOneThatKeptUpDoesNot()
        async throws
    {
        let host = TestHost()
        let connection = makeConnection()
        let laggard = Listener(await connection.updates())
        let heard = await connect(connection, to: host)
        #expect(await heard.next() == .reread)
        host.reply(Self.stamped(1))

        try await replayedBatch(after: 1, through: 52, on: host)
        #expect(await heard.next(52) == (1...52).map(Heard.event))
        try await replayedBatch(after: 52, through: 103, on: host)
        host.reply(Self.stamped(104))
        #expect(await heard.next(52) == (53...104).map(Heard.event))
        var fromLaggard: [Heard] = []
        while let next = await laggard.next() {
            fromLaggard.append(next)
            if next == .event(104) {
                break
            }
        }

        #expect(fromLaggard.suffix(2) == [.reread, .event(104)])
        #expect(fromLaggard.count < 104)
        await connection.stop()
    }

    @Test func aResumeRefusedByTheHostRereadsAtOnceAndAdoptsTheNextFrame() async throws {
        let host = TestHost()
        let connection = makeConnection()
        let heard = await connect(connection, to: host)
        #expect(await heard.next() == .reread)
        host.reply(Self.stamped(1))
        host.reply(Self.stamped(3))
        let (call, _) = try await resumed(on: host)

        host.reply(TestHost.refused(call, status: 400, #""the host refused the resume""#))
        host.reply(Self.stamped(9))

        #expect(await heard.next(3) == [.event(1), .reread, .event(9)])
        await connection.stop()
    }

    @Test func aSubscriberThatFallsBehindHearsItsStateAgainBeforeItsReread() async {
        let host = TestHost()
        let connection = makeConnection()
        let laggard = Listener(await connection.updates())
        let heard = await connect(connection, to: host)
        #expect(await heard.next() == .reread)

        for seq in 1...70 {
            host.reply(Self.stamped(seq))
        }
        #expect(await heard.next(70) == (1...70).map(Heard.event))
        await connection.stop()
        let stateAtTheReread = await laggard.state(atTheRereadAfter: .event(70))

        #expect(stateAtTheReread == .online(sharedSpaceId: "s-1"))
    }

    @Test func aResumeWhoseCallIsRefusedUnderTwoStaleChallengesRereadsAtOnce() async throws {
        let keys = try VectorKeys()
        let host = VectorHost(
            keys: keys,
            draws: [
                keys.challenge, Data(repeating: 0xc2, count: 32), Data(repeating: 0xc3, count: 32),
            ])
        let connection = RelayConnection(
            baseURL: KiroshiCloud.productionURL, instanceId: keys.instance,
            bearer: "fixture-bearer", device: keys.device, spaceKeys: keys.spaceKeys,
            environment: RelayEnvironment(
                transport: transport, clock: clock, keychain: InMemoryKeychain(),
                spaceKeys: FixtureSpaceKeys()),
            backoff: Backoff(jitter: { $0 }))
        let heard = Listener(await connection.updates())
        await connection.start()
        await transport.nextOpening().accept(host)
        await heard.online()
        #expect(await heard.next() == .reread)
        try await host.event(Self.stamped(1))
        await host.restarts(beforeTheNext: 2)
        try await host.event(Self.stamped(3))
        var resumesSent = 0
        for await frame in host.heard where frame.command == RelayConnection.resumeCommand {
            resumesSent += 1
            if resumesSent == 2 {
                break
            }
        }

        try await host.event(Self.stamped(9))
        try await host.event(#"{"event":{"event":"test://unstamped","payload":99}}"#)
        let afterTheRefusal = await heard.next(through: .event(99))
        await connection.stop()

        #expect(afterTheRefusal == [.event(1), .reread, .event(9), .event(99)])
    }
}
