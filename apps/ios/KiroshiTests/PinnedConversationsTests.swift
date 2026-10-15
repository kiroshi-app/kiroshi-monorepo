import Foundation
import Observation
import Synchronization
import Testing

@testable import Kiroshi

struct RosterPinsTests {
    @Test func decodesThePinOfAPageRowAndOfACompanion() throws {
        let row = try JSONDecoder().decode(
            ConversationInPage.self,
            from: Data(
                #"{"id":"g1","spaceId":"s1","sectionId":"sec","pinPosition":3,"title":"Crew","instructions":"","createdAt":1,"updatedAt":1,"participants":[],"lastActivityAt":5,"lastWord":null,"soloBotId":null}"#
                    .utf8))
        #expect(row.groupPlace == PinPlace(id: "g1", sectionId: "sec", pinPosition: 3))

        let solo = try JSONDecoder().decode(
            ConversationInPage.self,
            from: Data(
                #"{"id":"chat-j","spaceId":"s1","sectionId":null,"pinPosition":1,"title":"Chat","instructions":"","createdAt":1,"updatedAt":1,"participants":[],"lastActivityAt":5,"lastWord":null,"soloBotId":"j"}"#
                    .utf8))
        #expect(solo.pinPosition == 1)
        #expect(solo.groupPlace == nil)

        let companion = try JSONDecoder().decode(
            CompanionInRoster.self,
            from: Data(
                #"{"id":"j","sectionId":null,"pinPosition":2,"name":"Juniper","title":"Writer"}"#
                    .utf8))
        #expect(companion.companion.name == "Juniper")
        #expect(companion.place == PinPlace(id: "j", sectionId: nil, pinPosition: 2))
    }

    @Test func listsTheSpacePinsAsTheMacDoes() {
        let pins = RosterPins.of(
            [
                PinPlace(id: "juniper", sectionId: nil, pinPosition: 3),
                PinPlace(id: "pico", sectionId: "s-1", pinPosition: 2),
                PinPlace(id: "topic-1", sectionId: nil, pinPosition: 0),
                PinPlace(id: "topic-2", sectionId: nil, pinPosition: nil),
                PinPlace(id: "mira", sectionId: "gone", pinPosition: 4),
            ],
            sections: [RosterSection(id: "s-1", position: 1)])

        #expect(
            pins == [
                RosterPin(id: "topic-1", sectionId: nil), RosterPin(id: "s-1", sectionId: nil),
                RosterPin(id: "pico", sectionId: "s-1"), RosterPin(id: "juniper", sectionId: nil),
                RosterPin(id: "mira", sectionId: nil),
            ])
    }

    @Test func pinningAppendsAndUnpinningRemovesKeepingTheOrder() {
        let pins = [
            RosterPin(id: "a", sectionId: nil), RosterPin(id: "s", sectionId: nil),
            RosterPin(id: "b", sectionId: "s"),
        ]

        #expect(RosterPins.pinning("c", in: pins) == pins + [RosterPin(id: "c", sectionId: nil)])
        #expect(RosterPins.unpinning("b", in: pins) == Array(pins.prefix(2)))
    }
}

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct PinnedConversationsTests {
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

    var topics: [FixtureHost.Group] {
        (1...4).map { index in
            FixtureHost.Group(
                id: "topic-\(index)", title: "Topic \(index)", members: [pico],
                createdAt: 1_000_000 - index * 1_000)
        }
    }

    func pinningHost(_ board: PinBoard) -> TestHost {
        let companions = [juniper, pico]
        let topics = topics
        return TestHost(companions: companions, groups: topics) { call in
            board.answer(call, companions: companions, groups: topics)
        }
    }

    static let othersPinned = [
        RosterPin(id: "topic-1", sectionId: nil), RosterPin(id: "s-1", sectionId: nil),
        RosterPin(id: "pico", sectionId: "s-1"), RosterPin(id: "juniper", sectionId: nil),
    ]

    @Test func thePinnedConversationsLeaveTheListForTheStripInTheHostOrder() async {
        let board = PinBoard(Self.othersPinned, sections: ["s-1"])
        let host = pinningHost(board)
        let (store, connection, following) = await follow(host)

        #expect(store.pinned.map(\.id) == ["topic-1", "pico", "juniper"])
        #expect(store.summaries.map(\.id) == ["topic-2", "topic-3", "topic-4"])
        #expect(store.canPin)
        following.cancel()
        await connection.stop()
    }

    @Test func pinningSendsTheWholePinListWithTheRowAddedLastThenRereads() async throws {
        let board = PinBoard(Self.othersPinned, sections: ["s-1"])
        let host = pinningHost(board)
        let (store, connection, following) = await follow(host)

        let pinning = store.pin("topic-3")
        #expect(store.pin("topic-3") == nil)
        await pinning?.value

        #expect(board.sent == [Self.othersPinned + [RosterPin(id: "topic-3", sectionId: nil)]])
        #expect(store.pinned.map(\.id) == ["topic-1", "pico", "juniper", "topic-3"])
        #expect(store.summaries.map(\.id) == ["topic-2", "topic-4"])
        following.cancel()
        await connection.stop()
    }

    @Test func unpinningSendsTheWholePinListWithoutTheRowAndItReturnsToItsPlace() async {
        let board = PinBoard(Self.othersPinned, sections: ["s-1"])
        let host = pinningHost(board)
        let (store, connection, following) = await follow(host)
        await store.unpin("topic-1")?.value

        #expect(board.sent == [Array(Self.othersPinned.dropFirst())])
        #expect(store.pinned.map(\.id) == ["pico", "juniper"])
        #expect(store.summaries.map(\.id) == ["topic-1", "topic-2", "topic-3", "topic-4"])
        following.cancel()
        await connection.stop()
    }

    @Test func aRefusedPinShowsTheFailureAndKeepsTheStripAsTheHostHasIt() async {
        let board = PinBoard(Self.othersPinned, sections: ["s-1"], refuses: true)
        let host = pinningHost(board)
        let (store, connection, following) = await follow(host)

        await store.pin("topic-3")?.value

        #expect(board.sent.count == 1)
        #expect(store.pinFailure == .init(change: .pin, title: "Topic 3"))
        #expect(store.pinned.map(\.id) == ["topic-1", "pico", "juniper"])
        #expect(store.summaries.map(\.id) == ["topic-2", "topic-3", "topic-4"])
        store.isShowingPinFailure = false
        #expect(store.pinFailure == nil)
        following.cancel()
        await connection.stop()
    }

    @Test func aMacWithoutPagesPinsNothing() async {
        let pinned = topics.enumerated().map { index, topic in
            var topic = topic
            topic.pinPosition = index == 0 ? 0 : nil
            return topic
        }
        let host = TestHost(companions: [juniper], groups: pinned) { call in
            guard call.command == "conversation_page" else { return nil }
            return TestHost.refused(call, status: 403, #""this command belongs to the host""#)
        }
        let (store, connection, following) = await follow(host)

        #expect(store.pinned.isEmpty)
        #expect(store.summaries.count == 5)
        #expect(!store.canPin)
        #expect(store.pin("topic-2") == nil)
        following.cancel()
        await connection.stop()
    }
}

final class PinBoard: Sendable {
    private struct State {
        var pins: [RosterPin]
        var sent: [[RosterPin]] = []
    }

    private struct PinArgs: Decodable {
        struct Pin: Decodable {
            let id: String
            let sectionId: String?
        }

        let spaceId: String
        let pins: [Pin]
    }

    private let state: Mutex<State>
    private let sections: [String]
    private let refuses: Bool

    init(_ pins: [RosterPin], sections: [String], refuses: Bool = false) {
        state = Mutex(State(pins: pins))
        self.sections = sections
        self.refuses = refuses
    }

    var sent: [[RosterPin]] {
        state.withLock { $0.sent }
    }

    func answer(_ call: TestCall, companions: [Companion], groups: [FixtureHost.Group])
        -> String?
    {
        let pins = state.withLock { $0.pins }
        let position = { (id: String) in pins.firstIndex { $0.id == id } }
        switch call.command {
        case "section_list":
            let listed = sections.compactMap { id in
                position(id).map {
                    #"{"id":"\#(id)","spaceId":"s-1","name":"Section","position":\#($0),"createdAt":0}"#
                }
            }
            return TestHost.ok(call, "[\(listed.joined(separator: ","))]")
        case "conversation_bots":
            let bots = companions.map { companion in
                let section = pins.first { $0.id == companion.id }?.sectionId
                return FixtureHost.botJSON(companion, pinPosition: position(companion.id))
                    .replacingOccurrences(
                        of: #""sectionId":null"#,
                        with: #""sectionId":\#(section.map { #""\#($0)""# } ?? "null")"#)
            }
            return TestHost.ok(call, "[\(bots.joined(separator: ","))]")
        case "conversation_page":
            let rows = groups.map { group in
                var group = group
                group.pinPosition = position(group.id)
                return TestHost.pageRow(group, last: nil)
            }
            return TestHost.ok(call, FixtureHost.conversationPage(rows, cursor: nil, limit: 30))
        case "roster_pin":
            guard let args = try? call.args(as: PinArgs.self) else { return nil }
            let changed = args.pins.map { RosterPin(id: $0.id, sectionId: $0.sectionId) }
            state.withLock { state in
                state.sent.append(changed)
                if !refuses {
                    state.pins = changed
                }
            }
            return refuses
                ? TestHost.refused(call, status: 500, TestHost.unavailable)
                : TestHost.ok(call, "null")
        default:
            return nil
        }
    }
}
