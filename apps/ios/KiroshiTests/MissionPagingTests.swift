import Foundation
import Observation
import Testing

@testable import Kiroshi

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct MissionPagingTests {
    let transport = TestRelayTransport()
    let clock = TestRelayClock()

    struct PageArgs: Decodable {
        let spaceId: String
        let closedSince: Int
        let cursor: String?
        let limit: Int
    }

    func makeConnection() -> RelayConnection {
        RelayConnection(
            baseURL: KiroshiCloud.productionURL, instanceId: "instance-1", bearer: "fixture-bearer",
            environment: RelayEnvironment(transport: transport, clock: clock),
            backoff: Backoff(jitter: { $0 }))
    }

    func waitUntil(_ condition: @escaping @MainActor @Sendable () -> Bool) async {
        for await isMet in Observations({ condition() }) where isMet {
            return
        }
    }

    nonisolated static func entry(_ index: Int) -> String {
        let mission = MissionTesting.missionJSON(
            id: "mission-\(index)", state: "working", openedAt: 1_000_000 - index * 1_000)
        return #"{"conversationId":"c-1","conversationTitle":"","mission":\#(mission)}"#
    }

    nonisolated static func page(_ count: Int, cursor: String?) -> String {
        let offset = cursor.flatMap(Int.init) ?? 0
        let end = min(offset + 30, count)
        let entries = (offset < end ? Array(offset + 1...end) : []).map(entry)
        let next = end < count ? #""\#(end)""# : "null"
        return #"{"missions":[\#(entries.joined(separator: ","))],"nextCursor":\#(next)}"#
    }

    nonisolated static func cursor(of call: TestCall) -> String? {
        (try? call.args(as: PageArgs.self))?.cursor
    }

    func host(_ count: Int, answer: TestHost.Answer? = nil) -> TestHost {
        TestHost { call in
            if let body = answer?(call) { return body }
            switch call.command {
            case "conversation_bots": return TestHost.ok(call, "[]")
            case "mission_space_page":
                return TestHost.ok(call, Self.page(count, cursor: Self.cursor(of: call)))
            default: return nil
            }
        }
    }

    func follow(_ host: TestHost) async -> (MissionsStore, RelayConnection, Task<Void, Never>) {
        let connection = makeConnection()
        let store = MissionsStore(now: { Date(milliseconds: 7_000) })
        let following = Task { await store.follow(connection) }
        await connection.start()
        await transport.nextOpening().accept(host.socket)
        await waitUntil { store.hasLoaded }
        return (store, connection, following)
    }

    func shownIds(_ store: MissionsStore) -> [String] {
        store.sections.flatMap(\.missions).map(\.id)
    }

    @Test func opensOnPageOneThenAppendsPageTwo() async throws {
        let host = host(45)
        let (store, connection, following) = await follow(host)

        let first = try #require(await host.nextCall("mission_space_page"))
        let args = try first.args(as: PageArgs.self)
        #expect(args.spaceId == "s-1")
        #expect(args.closedSince == 7_000)
        #expect(args.cursor == nil)
        #expect(args.limit == 30)
        #expect(shownIds(store).count == 30)

        let last = try #require(store.sections.last?.missions.last)
        store.rowAppeared(last, in: nil)
        let second = try #require(await host.nextCall("mission_space_page"))
        #expect(Self.cursor(of: second) == "30")
        #expect(try second.args(as: PageArgs.self).closedSince == 7_000)
        await waitUntil { store.nextPage == .complete }

        #expect(shownIds(store) == (1...45).map { "mission-\($0)" })
        following.cancel()
        await connection.stop()
    }

    @Test func stopsOnceTheHostSaysThereIsNoNextPage() async throws {
        let host = host(45)
        let (store, connection, following) = await follow(host)
        _ = await host.nextCall("mission_space_page")
        store.loadMore()
        _ = await host.nextCall("mission_space_page")
        await waitUntil { store.nextPage == .complete }

        store.loadMore()
        await store.refresh()

        let next = try #require(await host.nextCall("mission_space_page"))
        #expect(Self.cursor(of: next) == nil)
        following.cancel()
        await connection.stop()
    }

    @Test func aTriggerFiringTwiceAsksForTheNextPageOnce() async throws {
        let host = TestHost(holding: ["mission_space_page"]) { call in
            call.command == "conversation_bots" ? TestHost.ok(call, "[]") : nil
        }
        let connection = makeConnection()
        let store = MissionsStore()
        let following = Task { await store.follow(connection) }
        await connection.start()
        await transport.nextOpening().accept(host.socket)
        let first = try #require(await host.nextCall("mission_space_page"))
        host.reply(TestHost.ok(first, Self.page(45, cursor: nil)))
        await waitUntil { store.hasLoaded }

        let last = try #require(store.sections.last?.missions.last)
        store.rowAppeared(last, in: nil)
        store.rowAppeared(last, in: nil)
        store.loadMore()
        let second = try #require(await host.nextCall("mission_space_page"))
        #expect(Self.cursor(of: second) == "30")
        store.retry()

        let next = try #require(await host.nextCall("mission_space_page"))
        #expect(Self.cursor(of: next) == nil)
        following.cancel()
        await connection.stop()
    }

    @Test func refreshingReplacesThePagesWithPageOne() async {
        let host = host(45)
        let (store, connection, following) = await follow(host)
        store.loadMore()
        await waitUntil { store.nextPage == .complete }

        await store.refresh()

        #expect(shownIds(store).count == 30)
        #expect(store.nextPage == .available)
        following.cancel()
        await connection.stop()
    }

    @Test func aMissionChangeKeepsPageTwo() async throws {
        let host = host(45)
        let (store, connection, following) = await follow(host)
        store.loadMore()
        await waitUntil { store.nextPage == .complete }
        _ = await host.nextCall("mission_space_page")
        _ = await host.nextCall("mission_space_page")

        host.push(
            event: "mission://changed",
            payload:
                #"{"missionId":"mission-44","state":"waiting_human","stateSeq":2,"isAgentRunning":false,"lastActivityAt":5000000}"#
        )
        let merge = try #require(await host.nextCall("mission_space_page"))
        #expect(Self.cursor(of: merge) == nil)
        await waitUntil { store.sections.first?.group == .needsYou }

        #expect(store.sections.first?.missions.map(\.id) == ["mission-44"])
        #expect(shownIds(store).count == 45)
        following.cancel()
        await connection.stop()
    }

    @Test func aNewMissionLandsWithoutDroppingPageTwo() async throws {
        let host = TestHost(holding: ["mission_space_page"]) { call in
            call.command == "conversation_bots" ? TestHost.ok(call, "[]") : nil
        }
        let connection = makeConnection()
        let store = MissionsStore()
        let following = Task { await store.follow(connection) }
        await connection.start()
        await transport.nextOpening().accept(host.socket)
        let first = try #require(await host.nextCall("mission_space_page"))
        host.reply(TestHost.ok(first, Self.page(45, cursor: nil)))
        await waitUntil { store.hasLoaded }
        store.loadMore()
        let second = try #require(await host.nextCall("mission_space_page"))
        host.reply(TestHost.ok(second, Self.page(45, cursor: "30")))
        await waitUntil { store.nextPage == .complete }

        host.push(
            event: "mission://changed",
            payload:
                #"{"missionId":"mission-0","state":"working","stateSeq":1,"isAgentRunning":true,"lastActivityAt":5000000}"#
        )
        let merge = try #require(await host.nextCall("mission_space_page"))
        let fresh = [Self.entry(0)] + (1...29).map(Self.entry)
        host.reply(
            TestHost.ok(
                merge,
                #"{"missions":[\#(fresh.joined(separator: ","))],"nextCursor":"30"}"#))
        await waitUntil { shownIds(store).count == 46 }

        #expect(shownIds(store).contains("mission-0"))
        #expect(store.nextPage == .complete)
        following.cancel()
        await connection.stop()
    }

    @Test func anUnreadableCursorRereadsPageOne() async throws {
        let host = host(45) { call in
            guard call.command == "mission_space_page", Self.cursor(of: call) != nil else {
                return nil
            }
            return TestHost.refused(
                call, status: 400, #"{"kind":"unreadableCursor","cursor":"30"}"#)
        }
        let (store, connection, following) = await follow(host)
        _ = await host.nextCall("mission_space_page")

        store.loadMore()
        #expect(Self.cursor(of: try #require(await host.nextCall("mission_space_page"))) == "30")
        #expect(Self.cursor(of: try #require(await host.nextCall("mission_space_page"))) == nil)
        await waitUntil { store.nextPage == .available }

        #expect(shownIds(store).count == 30)
        #expect(!store.hasFailed)
        following.cancel()
        await connection.stop()
    }

    @Test func aFailedNextPageKeepsTheRows() async {
        let host = host(45) { call in
            guard call.command == "mission_space_page", Self.cursor(of: call) != nil else {
                return nil
            }
            return TestHost.refused(call, status: 500, TestHost.unavailable)
        }
        let (store, connection, following) = await follow(host)

        store.loadMore()
        await waitUntil { store.nextPage == .failed }

        #expect(shownIds(store).count == 30)
        #expect(!store.hasFailed)
        following.cancel()
        await connection.stop()
    }

    @Test func aMacThatDoesNotKnowPagesGetsTheWholeFeedForTheSession() async throws {
        let feed = "[" + (1...45).map(Self.entry).joined(separator: ",") + "]"
        let host = host(45) { call in
            switch call.command {
            case "mission_space_page":
                TestHost.refused(call, status: 403, #""this command belongs to the host""#)
            case "mission_space_feed": TestHost.ok(call, feed)
            default: nil
            }
        }
        let (store, connection, following) = await follow(host)

        #expect(shownIds(store).count == 45)
        #expect(store.nextPage == .complete)
        _ = await host.nextCall("mission_space_feed")
        await store.refresh()
        var commands: [String] = []
        for await call in host.calls {
            commands.append(call.command)
            if call.command == "mission_space_feed" { break }
        }

        #expect(!commands.contains("mission_space_page"))
        following.cancel()
        await connection.stop()
    }
}
