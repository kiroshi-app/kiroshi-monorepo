import Foundation
import Observation
import Testing

@testable import Kiroshi

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct ConversationPagingTests {
    let transport = TestRelayTransport()
    let clock = TestRelayClock()
    let juniper = Companion(id: "juniper", name: "Juniper")
    let pico = Companion(id: "pico", name: "Pico")
    let work = CompanionWork()

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

    func follow(_ host: TestHost) async -> (ConversationsStore, RelayConnection, Task<Void, Never>)
    {
        let connection = makeConnection()
        let store = ConversationsStore(work: work)
        let following = Task { await store.follow(connection) }
        await connection.start()
        await transport.nextOpening().accept(host.socket)
        await waitUntil { store.phase == .loaded }
        return (store, connection, following)
    }

    func topics(_ count: Int, pinned: Int = 0) -> [FixtureHost.Group] {
        (1...count).map { index in
            FixtureHost.Group(
                id: "topic-\(index)", title: "Topic \(index)", members: [pico],
                createdAt: 1_000_000 - index * 1_000, pinPosition: index <= pinned ? index : nil)
        }
    }

    func page(_ groups: [FixtureHost.Group], cursor: String?, limit: Int = 30) -> String {
        FixtureHost.conversationPage(
            groups.map { TestHost.pageRow($0, last: nil) }, cursor: cursor, limit: limit)
    }

    func cursor(of call: TestCall?) throws -> String? {
        try #require(call).args(as: TestHost.ListPageArgs.self).cursor
    }

    @Test func opensOnPageOneThenAppendsPageTwo() async throws {
        let host = TestHost(groups: topics(45))
        let (store, connection, following) = await follow(host)

        let first = try #require(await host.nextCall("conversation_page"))
        #expect(try first.args(as: TestHost.ListPageArgs.self).limit == 30)
        #expect(try cursor(of: first) == nil)
        #expect(store.summaries.map(\.subject.title) == (1...30).map { "Topic \($0)" })
        #expect(store.nextPage == .available)

        store.rowAppeared(try #require(store.summaries.last).id)
        #expect(try cursor(of: await host.nextCall("conversation_page")) == "30")
        await waitUntil { store.nextPage == .complete }

        #expect(store.summaries.map(\.subject.title) == (1...45).map { "Topic \($0)" })
        following.cancel()
        await connection.stop()
    }

    @Test func aRowFarFromTheEndAsksForNothing() async throws {
        let host = TestHost(groups: topics(45))
        let (store, connection, following) = await follow(host)
        _ = await host.nextCall("conversation_page")

        store.rowAppeared(store.summaries[10].id)
        store.reload()

        #expect(try cursor(of: await host.nextCall("conversation_page")) == nil)
        following.cancel()
        await connection.stop()
    }

    @Test func stopsOnceTheHostSaysThereIsNoNextPage() async throws {
        let host = TestHost(groups: topics(45))
        let (store, connection, following) = await follow(host)
        _ = await host.nextCall("conversation_page")
        store.loadMore()
        _ = await host.nextCall("conversation_page")
        await waitUntil { store.nextPage == .complete }

        store.loadMore()
        store.reload()

        #expect(try cursor(of: await host.nextCall("conversation_page")) == nil)
        following.cancel()
        await connection.stop()
    }

    @Test func aTriggerFiringTwiceAsksForTheNextPageOnce() async throws {
        let groups = topics(45)
        let host = TestHost(groups: groups, holding: ["conversation_page"])
        let connection = makeConnection()
        let store = ConversationsStore(work: work)
        let following = Task { await store.follow(connection) }
        await connection.start()
        await transport.nextOpening().accept(host.socket)
        let first = try #require(await host.nextCall("conversation_page"))
        host.reply(TestHost.ok(first, page(groups, cursor: nil)))
        await waitUntil { store.phase == .loaded }

        let last = try #require(store.summaries.last).id
        store.rowAppeared(last)
        store.rowAppeared(last)
        store.loadMore()
        #expect(try cursor(of: await host.nextCall("conversation_page")) == "30")
        store.reload()

        #expect(try cursor(of: await host.nextCall("conversation_page")) == nil)
        following.cancel()
        await connection.stop()
    }

    @Test func refreshingReplacesThePagesWithPageOne() async throws {
        let host = TestHost(groups: topics(45))
        let (store, connection, following) = await follow(host)
        store.loadMore()
        await waitUntil { store.summaries.count == 45 }

        await store.refresh()

        #expect(store.summaries.count == 30)
        #expect(store.nextPage == .available)
        following.cancel()
        await connection.stop()
    }

    @Test func aNextPageAnsweredAfterARefreshIsDropped() async throws {
        let groups = topics(45)
        let host = TestHost(groups: groups, holding: ["conversation_page"])
        let connection = makeConnection()
        let store = ConversationsStore(work: work)
        let following = Task { await store.follow(connection) }
        await connection.start()
        await transport.nextOpening().accept(host.socket)
        let first = try #require(await host.nextCall("conversation_page"))
        host.reply(TestHost.ok(first, page(groups, cursor: nil)))
        await waitUntil { store.phase == .loaded }
        store.loadMore()
        let second = try #require(await host.nextCall("conversation_page"))

        store.reload()
        let reread = try #require(await host.nextCall("conversation_page"))
        host.reply(TestHost.ok(second, page(groups, cursor: "30")))
        host.reply(TestHost.ok(reread, page(groups, cursor: nil)))
        await waitUntil { store.nextPage == .available }

        #expect(store.summaries.count == 30)
        following.cancel()
        await connection.stop()
    }

    @Test func pinnedConversationsComeFromPageOneOnlyAndNeverTwice() async throws {
        let groups = topics(45, pinned: 2)
        let host = TestHost(groups: groups) { call in
            guard call.command == "conversation_page",
                (try? call.args(as: TestHost.ListPageArgs.self).cursor) == "30"
            else { return nil }
            return TestHost.ok(
                call,
                FixtureHost.conversationPage(
                    (Array(groups[25...]) + [groups[0]]).map { TestHost.pageRow($0, last: nil) },
                    cursor: nil, limit: 30))
        }
        let (store, connection, following) = await follow(host)

        #expect(store.summaries.prefix(2).map(\.subject.title) == ["Topic 1", "Topic 2"])
        store.loadMore()
        await waitUntil { store.nextPage == .complete }

        let ids = store.summaries.map(\.id)
        #expect(ids.count == 45)
        #expect(Set(ids).count == ids.count)
        #expect(store.summaries.prefix(2).map(\.subject.title) == ["Topic 1", "Topic 2"])
        following.cancel()
        await connection.stop()
    }

    @Test func aMessageMovesItsConversationToTheTopAndKeepsPageTwo() async throws {
        let host = TestHost(groups: topics(45))
        let (store, connection, following) = await follow(host)
        store.loadMore()
        await waitUntil { store.nextPage == .complete }

        host.push(
            event: "conversation://message-stored",
            payload: TestHost.message(
                "late", in: "topic-44", seq: 1, isYours: true, "Back to this one.",
                at: 9_000_000))
        await waitUntil { store.summaries.first?.id == "topic-44" }

        #expect(store.summaries.count == 45)
        #expect(store.summaries.first?.preview == "You: Back to this one.")
        following.cancel()
        await connection.stop()
    }

    @Test func aMessageInAConversationNotReadYetBringsItInFromPageOne() async throws {
        let groups = topics(45)
        let host = TestHost(groups: groups, holding: ["conversation_page"])
        let connection = makeConnection()
        let store = ConversationsStore(work: work)
        let following = Task { await store.follow(connection) }
        await connection.start()
        await transport.nextOpening().accept(host.socket)
        let first = try #require(await host.nextCall("conversation_page"))
        host.reply(TestHost.ok(first, page(groups, cursor: nil)))
        await waitUntil { store.phase == .loaded }

        let message = TestHost.message(
            "late", in: "topic-44", seq: 1, isYours: true, "Back to this one.", at: 9_000_000)
        host.push(event: "conversation://message-stored", payload: message)
        let merge = try #require(await host.nextCall("conversation_page"))
        #expect(try cursor(of: merge) == nil)
        let moved = groups[43]
        let rows =
            [TestHost.pageRow(moved, last: TestHost.transcriptMessage(message))]
            + groups.filter { $0.id != moved.id }.map { TestHost.pageRow($0, last: nil) }
        host.reply(TestHost.ok(merge, FixtureHost.conversationPage(rows, cursor: nil, limit: 30)))
        await waitUntil { store.summaries.first?.id == "topic-44" }

        #expect(store.summaries.count == 31)
        #expect(store.summaries.first?.preview == "You: Back to this one.")
        #expect(store.nextPage == .available)
        following.cancel()
        await connection.stop()
    }

    @Test func anUnreadableCursorRereadsPageOne() async throws {
        let host = TestHost(groups: topics(45)) { call in
            guard call.command == "conversation_page",
                (try? call.args(as: TestHost.ListPageArgs.self).cursor) != nil
            else { return nil }
            return TestHost.refused(
                call, status: 400, #"{"kind":"unreadableCursor","cursor":"30"}"#)
        }
        let (store, connection, following) = await follow(host)
        _ = await host.nextCall("conversation_page")

        store.loadMore()
        #expect(try cursor(of: await host.nextCall("conversation_page")) == "30")
        #expect(try cursor(of: await host.nextCall("conversation_page")) == nil)
        await waitUntil { store.nextPage == .available }

        #expect(store.summaries.count == 30)
        #expect(store.phase == .loaded)
        following.cancel()
        await connection.stop()
    }

    @Test func aFailedNextPageKeepsTheRowsAndCanBeTriedAgain() async throws {
        let host = TestHost(groups: topics(45)) { call in
            guard call.command == "conversation_page",
                (try? call.args(as: TestHost.ListPageArgs.self).cursor) != nil
            else { return nil }
            return TestHost.refused(call, status: 500, TestHost.unavailable)
        }
        let (store, connection, following) = await follow(host)

        store.loadMore()
        await waitUntil { store.nextPage == .failed }

        #expect(store.summaries.count == 30)
        #expect(store.phase == .loaded)
        store.loadMore()
        #expect(store.nextPage == .loading)
        following.cancel()
        await connection.stop()
    }

    @Test func aCompanionWaitsForThePageItsActivityBelongsTo() async throws {
        let host = TestHost(
            companions: [juniper], groups: topics(45),
            messages: [
                "chat-juniper": [
                    TestHost.message(
                        "j1", in: "chat-juniper", seq: 1, isYours: false, "Drafted.", at: 1)
                ]
            ])
        let (store, connection, following) = await follow(host)

        #expect(!store.summaries.contains { $0.id == "juniper" })
        store.loadMore()
        await waitUntil { store.nextPage == .complete }

        #expect(store.summaries.last?.id == "juniper")
        #expect(store.summaries.count == 46)
        following.cancel()
        await connection.stop()
    }

    func solo(of companion: Companion, at lastActivityAt: Int, pinned: Int? = nil)
        -> FixtureHost.PageRow
    {
        FixtureHost.PageRow(
            group: FixtureHost.Group(
                id: "chat-\(companion.id)", title: "Chat", members: [companion], createdAt: 0,
                pinPosition: pinned),
            lastActivityAt: lastActivityAt,
            lastWord: FixtureHost.lastWordJSON(
                text: "Drafted.", at: lastActivityAt, by: companion.id),
            soloBotId: companion.id)
    }

    func answeringPages(_ pages: [String?: [FixtureHost.PageRow]]) -> TestHost.Answer {
        { call in
            guard call.command == "conversation_page",
                let args = try? call.args(as: TestHost.ListPageArgs.self),
                let rows = pages[args.cursor]
            else { return nil }
            let next = args.cursor == nil && pages.count > 1 ? "next" : nil
            let page = FixtureHost.conversationPage(rows, cursor: nil, limit: 30)
            return TestHost.ok(
                call,
                page.replacingOccurrences(
                    of: #""nextCursor":null"#,
                    with: #""nextCursor":\#(next.map { #""\#($0)""# } ?? "null")"#))
        }
    }

    @Test func aCompanionsOwnConversationIsListedOnceUnderTheCompanion() async throws {
        let writer = Companion(id: "juniper", name: "Juniper", role: "Writer")
        let crew = FixtureHost.Group(
            id: "crew", title: "Release crew", members: [writer, pico], createdAt: 5_000)
        let host = TestHost(
            companions: [writer, pico],
            answer: answeringPages([
                nil: [
                    solo(of: writer, at: 9_000), solo(of: pico, at: 7_000),
                    TestHost.pageRow(crew, last: nil),
                ]
            ]))
        let (store, connection, following) = await follow(host)

        #expect(store.summaries.map(\.id) == ["juniper", "pico", "crew"])
        #expect(store.summaries.map(\.subject.title) == ["Juniper", "Pico", "Release crew"])
        #expect(store.summaries.map(\.role) == ["Writer", nil, nil])
        #expect(store.summaries.map(\.conversationId) == ["chat-juniper", "chat-pico", "crew"])
        #expect(store.summaries.first?.preview == "Drafted.")
        guard case .companion(let companion) = store.summaries.first?.subject else {
            Issue.record("Expected Juniper's row to be the companion's")
            return
        }
        #expect(companion == writer)
        following.cancel()
        await connection.stop()
    }

    @Test func aCompanionWithoutItsOwnConversationOnThePageIsStillListed() async throws {
        let host = TestHost(
            companions: [juniper, pico],
            messages: [
                "chat-pico": [
                    TestHost.message(
                        "p1", in: "chat-pico", seq: 1, isYours: true, "Ship it.", at: 3_000)
                ]
            ],
            answer: answeringPages([nil: [solo(of: juniper, at: 9_000)]]))
        let (store, connection, following) = await follow(host)

        #expect(store.summaries.map(\.id) == ["juniper", "pico"])
        #expect(store.summaries.map(\.conversationId) == ["chat-juniper", "chat-pico"])
        following.cancel()
        await connection.stop()
    }

    @Test func aPinnedCompanionConversationStaysPinnedUnderTheCompanion() async throws {
        let host = TestHost(
            companions: [juniper, pico], groups: topics(2),
            answer: answeringPages([
                nil: [solo(of: pico, at: 1, pinned: 1), solo(of: juniper, at: 9_000_000)]
                    + topics(2).map { TestHost.pageRow($0, last: nil) }
            ]))
        let (store, connection, following) = await follow(host)

        #expect(store.summaries.map(\.id) == ["pico", "juniper", "topic-1", "topic-2"])
        following.cancel()
        await connection.stop()
    }

    @Test func aCompanionsOwnConversationOnPageTwoIsNotListedTwice() async throws {
        let groups = topics(2)
        let host = TestHost(
            companions: [juniper],
            messages: [
                "chat-juniper": [
                    TestHost.message(
                        "j1", in: "chat-juniper", seq: 1, isYours: false, "Drafted.", at: 1,
                        by: "juniper")
                ]
            ],
            answer: answeringPages([
                nil: groups.map { TestHost.pageRow($0, last: nil) },
                "next": [solo(of: juniper, at: 1)],
            ]))
        let (store, connection, following) = await follow(host)
        #expect(store.summaries.map(\.id) == ["topic-1", "topic-2"])

        store.loadMore()
        await waitUntil { store.nextPage == .complete }

        #expect(store.summaries.map(\.id) == ["topic-1", "topic-2", "juniper"])
        following.cancel()
        await connection.stop()
    }

    @Test func aMacWithoutPagesListsEachCompanionOnce() async throws {
        let host = TestHost(companions: [juniper, pico], groups: topics(1)) { call in
            guard call.command == "conversation_page" else { return nil }
            return TestHost.refused(call, status: 403, #""this command belongs to the host""#)
        }
        let (store, connection, following) = await follow(host)

        #expect(store.summaries.map(\.id).sorted() == ["juniper", "pico", "topic-1"])
        following.cancel()
        await connection.stop()
    }

    @Test func openingAsksForOnePageAndNoMessagePerConversation() async throws {
        let host = TestHost(groups: topics(3))
        let (store, connection, following) = await follow(host)

        store.reload()
        var commands: [String] = []
        for await call in host.calls {
            commands.append(call.command)
            if commands.filter({ $0 == "conversation_page" }).count == 2 { break }
        }

        #expect(store.summaries.count == 3)
        #expect(Set(commands) == ["conversation_bots", "conversation_page"])
        following.cancel()
        await connection.stop()
    }

    @Test func aMacThatDoesNotKnowPagesGetsTheWholeListForTheSession() async throws {
        let groups = topics(3)
        let host = TestHost(
            groups: groups,
            messages: [
                "topic-2": [
                    TestHost.message(
                        "t2", in: "topic-2", seq: 1, isYours: true, "Ship it.", at: 5_000_000)
                ]
            ]
        ) { call in
            guard call.command == "conversation_page" else { return nil }
            return TestHost.refused(call, status: 403, #""this command belongs to the host""#)
        }
        let (store, connection, following) = await follow(host)

        #expect(store.summaries.map(\.subject.title) == ["Topic 2", "Topic 1", "Topic 3"])
        #expect(store.summaries.first?.preview == "You: Ship it.")
        #expect(store.nextPage == .complete)
        _ = await host.nextCall("conversation_list")
        store.reload()
        var commands: [String] = []
        for await call in host.calls {
            commands.append(call.command)
            if call.command == "conversation_list" { break }
        }

        #expect(!commands.contains("conversation_page"))
        following.cancel()
        await connection.stop()
    }
}
