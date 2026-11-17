import Foundation
import Observation
import Testing

@testable import Kiroshi

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct RepeatedCallTests {
    struct Keyed: Decodable {
        let callKey: String?
    }

    struct SendArgs: Decodable {
        struct Message: Decodable {
            let id: String
            let content: String
        }

        let message: Message
    }

    struct StoreArgs: Decodable {
        struct File: Decodable {
            let name: String
        }

        let conversationId: String
        let attachments: [File]
    }

    struct RecordArgs: Decodable {
        struct Message: Decodable {
            let content: String
            let repliedToMessageId: String?
        }

        let message: Message
    }

    struct ResumeArgs: Decodable {
        let token: String
    }

    static let thisDevice = FixtureKeys.memberRelayId
    static let otherDevice = "5d2c0000-0000-4000-8000-0000000000c9"

    let transport = TestRelayTransport()
    let clock = TestRelayClock()
    let juniper = Companion(id: "juniper", name: "Juniper")
    let atlas = Companion(id: "atlas", name: "Atlas")
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

    func connect(_ connection: RelayConnection, to host: TestHost) async {
        let updates = await connection.updates()
        await connection.start()
        await transport.nextOpening().accept(host.socket)
        for await update in updates {
            if case .state(.online) = update {
                return
            }
        }
    }

    static func event(
        _ name: String, _ payload: String, seq: Int, by deviceId: String? = nil,
        key callKey: String? = nil, token: String? = nil
    ) -> String {
        let device = deviceId.map { #","deviceId":"\#($0)""# } ?? ""
        let key = callKey.map { #","callKey":"\#($0)""# } ?? ""
        let replayFor = token.map { #","token":"\#($0)""# } ?? ""
        return
            #"{"event":{"event":"\#(name)","payload":\#(payload)\#(device)\#(key)},"epoch":"e-1","seq":\#(seq)\#(replayFor)}"#
    }

    static func resync(_ call: TestCall) -> String {
        #"{"resync":{"answered":[\#(call.id)]}}"#
    }

    static func replayed(_ call: TestCall, token: String, count: Int) -> String {
        TestHost.ok(call, #"{"token":"\#(token)","replayed":\#(count)}"#)
    }

    static func callKey(of call: TestCall) throws -> String? {
        try JSONDecoder().decode(Keyed.self, from: Data(call.text.utf8)).callKey
    }

    func resumed(on host: TestHost) async throws -> (TestCall, String) {
        let call = try #require(await host.nextCall("relay_resume"))
        return (call, try call.args(as: ResumeArgs.self).token)
    }

    static func yours(_ id: String, _ text: String, seq: Int, in conversationId: String)
        -> String
    {
        TestHost.message(
            id, in: conversationId, seq: seq, isYours: true, text, at: 1_791_000_000_000 + seq)
    }

    static let resolved = #"{"type":"permissionResolved","id":"q1","decision":"allowOnce"}"#

    static func agent(_ event: String) -> String {
        #"{"scope":{"conversationId":"chat-juniper","botId":"bot","runtimeSessionId":"session-1","epoch":1},"event":\#(event),"turn":{"turnId":"turn-1","conversationId":"chat-juniper"}}"#
    }

    func questionHost() -> TestHost {
        TestHost(
            messages: [
                "chat-juniper": [
                    TestHost.message(
                        "m1", in: "chat-juniper", seq: 1, isYours: true, "Draft the notes",
                        at: 1_791_000_000_000),
                    TestHost.message(
                        "question-q1", in: "chat-juniper", seq: 2, isYours: false,
                        "### Which format should the release notes take?", at: 1_791_000_061_000),
                ]
            ], holding: ["agent_answer_question"],
            answer: { call in
                switch call.command {
                case "agent_pending_questions": TestHost.ok(call, QuestionThreadTests.pending)
                case "conversation_append_user_message": TestHost.ok(call, "4")
                default: nil
                }
            })
    }

    func followQuestion(_ host: TestHost) async throws -> (
        ThreadStore, RelayConnection, Task<Void, Never>
    ) {
        var ids = (1...).lazy.map { "id-\($0)" }.makeIterator()
        let store = ThreadStore(
            subject: .companion(juniper), work: work,
            authorship: ThreadAuthorship(accountId: "me", isHostedByYou: false),
            now: { Date(milliseconds: 1_791_000_100_000) }, makeId: { ids.next()! })
        let connection = makeConnection()
        let updates = await connection.updates()
        let work = work
        Task {
            for await update in updates {
                work.apply(update)
            }
        }
        let following = Task { await store.follow(connection) }
        await connection.start()
        await transport.nextOpening().accept(host.socket)
        await waitUntil { store.asking?.question.request.id == "q1" }
        host.reply(Self.event("test://replay", "1", seq: 1))
        return (store, connection, following)
    }

    func answerSummary(in store: ThreadStore) throws -> Task<Void, Never>? {
        var draft = QuestionDraft(request: try #require(store.asking).question.request)
        draft.pick(draft.asked.options[0])
        _ = draft.goOn()
        draft.pick(draft.asked.options[0])
        return store.answer(draft)
    }

    @Test func aRefusedAnswerTheHostRanShowsAsAnsweredByThisDevice() async throws {
        let host = questionHost()
        let (store, connection, following) = try await followQuestion(host)

        let answering = try answerSummary(in: store)
        let call = try #require(await host.nextCall("agent_answer_question"))
        host.reply(Self.resync(call))
        let (resume, token) = try await resumed(on: host)
        await answering?.value
        host.reply(
            Self.event(
                "agent://event", Self.agent(Self.resolved), seq: 2, by: Self.thisDevice,
                key: try Self.callKey(of: call), token: token))
        host.reply(Self.replayed(resume, token: token, count: 1))
        await waitUntil { store.answeredQuestion("q1") != nil }

        let answered = try #require(store.answeredQuestion("q1"))
        #expect(answered.by == .you)
        #expect(store.asking == nil)
        if answered.by == .you {
            let recorded = try #require(await host.nextCall("conversation_append_user_message"))
            let message = try recorded.args(as: RecordArgs.self).message
            #expect(message.content == "Summary\n\nPeople using the app")
            #expect(message.repliedToMessageId == "question-q1")
            #expect(
                answered.lines == [
                    QuestionAnswerLine(header: "Format", answer: "Summary"),
                    QuestionAnswerLine(header: "Audience", answer: "People using the app"),
                ])
        }
        following.cancel()
        await connection.stop()
    }

    @Test func anAnswerResolvedByThisDeviceWhileInFlightStaysAnsweredWhenItsReplyIsRefused()
        async throws
    {
        let host = questionHost()
        let (store, connection, following) = try await followQuestion(host)

        let answering = try answerSummary(in: store)
        let call = try #require(await host.nextCall("agent_answer_question"))
        host.reply(
            Self.event(
                "agent://event", Self.agent(Self.resolved), seq: 2, by: Self.thisDevice,
                key: try Self.callKey(of: call)))
        await waitUntil { work.question("q1") == nil }
        host.reply(Self.resync(call))
        let (resume, token) = try await resumed(on: host)
        host.reply(Self.replayed(resume, token: token, count: 0))
        await answering?.value

        #expect(store.asking == nil)
        #expect(store.answeredQuestion("q1")?.by == .you)
        following.cancel()
        await connection.stop()
    }

    @Test func aRefusedAnswerTheHostNeverRanStaysFailed() async throws {
        let host = questionHost()
        let (store, connection, following) = try await followQuestion(host)

        let answering = try answerSummary(in: store)
        let call = try #require(await host.nextCall("agent_answer_question"))
        host.reply(Self.resync(call))
        let (resume, token) = try await resumed(on: host)
        host.reply(Self.replayed(resume, token: token, count: 0))
        await answering?.value

        let failed = try #require(store.asking, "the panel left after a refused answer")
        #expect(failed.hasFailed)
        #expect(store.answeredQuestion("q1") == nil)
        following.cancel()
        await connection.stop()
    }

    @Test func aRefusedAnswerThenAnAnswerFromAnotherDeviceSaysAnsweredOnAnotherDevice()
        async throws
    {
        let host = questionHost()
        let (store, connection, following) = try await followQuestion(host)

        let answering = try answerSummary(in: store)
        let call = try #require(await host.nextCall("agent_answer_question"))
        host.reply(Self.resync(call))
        let (resume, token) = try await resumed(on: host)
        await answering?.value
        host.reply(
            Self.event(
                "agent://event", Self.agent(Self.resolved), seq: 2, by: Self.otherDevice,
                key: "their-key", token: token))
        host.reply(Self.replayed(resume, token: token, count: 1))
        await waitUntil { store.answeredQuestion("q1") != nil }

        #expect(store.answeredQuestion("q1") == QuestionAnswered(by: .elsewhere, lines: []))
        #expect(store.asking == nil)
        following.cancel()
        await connection.stop()
    }

    var created: FixtureHost.Group {
        FixtureHost.Group(id: "group-new", title: "", members: [juniper, pico], createdAt: 10_000)
    }

    func createdEvent(
        _ group: FixtureHost.Group, seq: Int, by deviceId: String?, key: String?, token: String?
    ) -> String {
        Self.event(
            "conversation://created", #"{"spaceId":"s-1","conversation":\#(group.json)}"#,
            seq: seq, by: deviceId, key: key, token: token)
    }

    func followList(_ host: TestHost) async -> (
        ConversationsStore, RelayConnection, Task<Void, Never>
    ) {
        let connection = makeConnection()
        let store = ConversationsStore()
        let following = Task { await store.follow(connection) }
        await connection.start()
        await transport.nextOpening().accept(host.socket)
        await waitUntil { store.phase == .loaded }
        host.reply(Self.event("test://replay", "1", seq: 1))
        store.pickCompanions()
        return (store, connection, following)
    }

    @Test func aRefusedGroupCreationTheHostRanShowsTheGroupOnce() async throws {
        let host = TestHost(companions: [juniper, atlas, pico], holding: ["conversation_create"])
        let (store, connection, following) = await followList(host)

        let creating = store.createGroup(with: ["juniper", "pico"])
        let call = try #require(await host.nextCall("conversation_create"))
        host.reply(Self.resync(call))
        let (resume, token) = try await resumed(on: host)
        await creating?.value
        host.reply(
            createdEvent(
                created, seq: 2, by: Self.thisDevice, key: try Self.callKey(of: call), token: token
            ))
        host.reply(Self.replayed(resume, token: token, count: 1))
        await waitUntil { store.summaries.contains { $0.id == "group-new" } }

        #expect(store.summaries.filter { $0.id == "group-new" }.count == 1)
        #expect(store.creation == .idle)
        #expect(store.opened?.id == "group-new")
        #expect(!store.isPickingCompanions)
        following.cancel()
        await connection.stop()
    }

    @Test func creatingAgainBeforeTheReplayLeavesOneGroupOnTheHost() async throws {
        let host = TestHost(companions: [juniper, atlas, pico], holding: ["conversation_create"])
        let (store, connection, following) = await followList(host)
        var groups: [FixtureHost.Group] = []
        var ledger: [String: FixtureHost.Group] = [:]
        func run(_ call: TestCall) throws -> FixtureHost.Group {
            let key = try Self.callKey(of: call)
            if let key, let earlier = ledger[key] {
                return earlier
            }
            let group = FixtureHost.Group(
                id: "group-\(groups.count + 1)", title: "", members: [juniper, pico],
                createdAt: 10_000)
            groups.append(group)
            if let key {
                ledger[key] = group
            }
            return group
        }

        let creating = store.createGroup(with: ["juniper", "pico"])
        let call = try #require(await host.nextCall("conversation_create"))
        let first = try run(call)
        host.reply(Self.resync(call))
        let (resume, token) = try await resumed(on: host)
        await creating?.value
        #expect(store.creation == .failed)
        let again = store.createGroup(with: ["juniper", "pico"])
        let repeated = try #require(await host.nextCall("conversation_create"))
        host.reply(TestHost.ok(repeated, try run(repeated).json))
        await again?.value
        host.reply(
            createdEvent(
                first, seq: 2, by: Self.thisDevice, key: try Self.callKey(of: call), token: token))
        host.reply(Self.replayed(resume, token: token, count: 1))
        await waitUntil { store.summaries.contains { $0.id == first.id } }

        #expect(groups.map(\.id) == [first.id])
        #expect(store.summaries.filter { $0.subject.isGroup(first.id) }.count == 1)
        #expect(store.opened?.id == first.id)
        following.cancel()
        await connection.stop()
    }

    @Test func aRefusedGroupCreationTheHostNeverRanStaysFailed() async throws {
        let host = TestHost(companions: [juniper, atlas, pico], holding: ["conversation_create"])
        let (store, connection, following) = await followList(host)

        let creating = store.createGroup(with: ["juniper", "pico"])
        let call = try #require(await host.nextCall("conversation_create"))
        host.reply(Self.resync(call))
        let (resume, token) = try await resumed(on: host)
        await creating?.value
        host.reply(createdEvent(created, seq: 2, by: Self.otherDevice, key: "k", token: token))
        host.reply(Self.replayed(resume, token: token, count: 1))
        await waitUntil { store.summaries.contains { $0.id == "group-new" } }

        #expect(store.creation == .failed)
        #expect(store.isPickingCompanions)
        #expect(store.opened == nil)
        following.cancel()
        await connection.stop()
    }

    func threadHost() -> TestHost {
        TestHost(
            messages: [
                "chat-juniper": [
                    Self.yours("m1", "Morning", seq: 1, in: "chat-juniper"),
                    TestHost.message(
                        "m2", in: "chat-juniper", seq: 2, isYours: false, "Hi",
                        at: 1_791_000_000_002),
                ]
            ], holding: ["conversation_send_turn"])
    }

    @Test func sendAgainBeforeTheReplayLeavesOneMessageOnTheHost() async throws {
        let host = threadHost()
        let store = ThreadStore(subject: .companion(juniper), work: CompanionWork())
        let connection = makeConnection()
        let following = Task { await store.follow(connection) }
        await connect(connection, to: host)
        await waitUntil { store.phase == .loaded && store.entries.count == 2 }
        host.reply(Self.event("test://replay", "1", seq: 1))
        var stored: [String] = []
        var ledger: Set<String> = []
        var runs = 0
        func run(_ call: TestCall) throws {
            let key = try Self.callKey(of: call)
            guard key.map({ !ledger.contains($0) }) ?? true else { return }
            runs += 1
            let id = try call.args(as: SendArgs.self).message.id
            if !stored.contains(id) {
                stored.append(id)
            }
            if let key {
                ledger.insert(key)
            }
        }

        store.draft = "Ship it"
        let sending = store.send()
        let sent = try #require(await host.nextCall("conversation_send_turn"))
        try run(sent)
        host.reply(Self.resync(sent))
        let (resume, token) = try await resumed(on: host)
        await sending?.value
        #expect(store.draft == "Ship it")
        let again = store.send()
        let resent = try #require(await host.nextCall("conversation_send_turn"))
        try run(resent)
        host.reply(TestHost.ok(resent, "1"))
        await again?.value
        let id = try #require(stored.first)
        host.reply(
            Self.event(
                "conversation://message-stored",
                Self.yours(id, "Ship it", seq: 3, in: "chat-juniper"),
                seq: 2, by: Self.thisDevice, key: try Self.callKey(of: sent), token: token))
        host.reply(Self.replayed(resume, token: token, count: 1))
        await waitUntil { store.entries.contains { $0.id == id } }

        #expect(stored.count == 1)
        #expect(runs == 1)
        #expect(store.entries.map(\.id) == ["m1", "m2", id])
        #expect(store.problem == nil)
        #expect(store.draft.isEmpty)
        following.cancel()
        await connection.stop()
    }

    @Test func aMissionSendAgainBeforeTheReplayLeavesOneMessageOnTheHost() async throws {
        let host = TestHost(
            messages: ["thread-mission-1": []], holding: ["conversation_send_turn"])
        var ids = (1...).lazy.map { "id-\($0)" }.makeIterator()
        let store = MissionThreadStore(
            mission: MissionTesting.mission(), missions: MissionsStore(), work: CompanionWork(),
            newId: { ids.next()! })
        let connection = makeConnection()
        let following = Task { await store.follow(connection) }
        await connect(connection, to: host)
        await waitUntil { store.hasLoaded && store.isOnline }
        host.reply(Self.event("test://replay", "1", seq: 1))
        var stored: [String] = []
        var ledger: Set<String> = []
        func run(_ call: TestCall) throws {
            let key = try Self.callKey(of: call)
            guard key.map({ !ledger.contains($0) }) ?? true else { return }
            let id = try call.args(as: SendArgs.self).message.id
            if !stored.contains(id) {
                stored.append(id)
            }
            if let key {
                ledger.insert(key)
            }
        }

        store.draft = "Go ahead"
        let sending = store.send()
        let sent = try #require(await host.nextCall("conversation_send_turn"))
        try run(sent)
        host.reply(Self.resync(sent))
        let (resume, token) = try await resumed(on: host)
        await sending?.value
        let again = store.send()
        let resent = try #require(await host.nextCall("conversation_send_turn"))
        try run(resent)
        host.reply(TestHost.ok(resent, "1"))
        await again?.value
        let id = try #require(stored.first)
        host.reply(
            Self.event(
                "conversation://message-stored",
                Self.yours(id, "Go ahead", seq: 1, in: "thread-mission-1"), seq: 2, token: token))
        host.reply(Self.replayed(resume, token: token, count: 1))
        await waitUntil { store.transcript.entries.contains { $0.id == id } }

        #expect(stored.count == 1)
        #expect(store.transcript.entries.map(\.id) == [id])
        #expect(store.sendProblem == nil)
        #expect(store.draft.isEmpty)
        following.cancel()
        await connection.stop()
    }

    @MainActor
    final class FileShelf {
        private(set) var files: [String] = []
        private var ledger: [String: [String]] = [:]

        func store(_ call: TestCall) throws -> String {
            let key = try RepeatedCallTests.callKey(of: call)
            if let key, let kept = ledger[key] {
                return Self.list(kept)
            }
            let args = try call.args(as: StoreArgs.self)
            let paths = args.attachments.map { file in
                "/d/attachments/\(args.conversationId)/\(files.count + 1)-\(file.name)"
            }
            files += paths
            if let key {
                ledger[key] = paths
            }
            return Self.list(paths)
        }

        func forget() {
            ledger = [:]
        }

        static func list(_ paths: [String]) -> String {
            "[\(paths.map { #""\#($0)""# }.joined(separator: ","))]"
        }
    }

    static let flow = PickedAttachment(id: UUID(), name: "flow.png", data: Data([1, 2]))

    @Test func sendAgainAfterItsFilesWereStoredLeavesOneCopyOnTheHost() async throws {
        let host = TestHost(
            messages: ["chat-juniper": []], holding: ["chat_store_attachments"],
            answer: { call in
                call.command == "conversation_send_turn" ? TestHost.ok(call, "1") : nil
            })
        let store = ThreadStore(subject: .companion(juniper), work: CompanionWork())
        let connection = makeConnection()
        let following = Task { await store.follow(connection) }
        await connect(connection, to: host)
        await waitUntil { store.phase == .loaded }
        host.reply(Self.event("test://replay", "1", seq: 1))
        let shelf = FileShelf()

        store.draft = "Look at this"
        store.attachments = [Self.flow]
        let sending = store.send()
        let stored = try #require(await host.nextCall("chat_store_attachments"))
        _ = try shelf.store(stored)
        host.reply(Self.resync(stored))
        await sending?.value
        #expect(store.attachments == [Self.flow])
        let again = store.send()
        let storedAgain = try #require(await host.nextCall("chat_store_attachments"))
        host.reply(TestHost.ok(storedAgain, try shelf.store(storedAgain)))
        let sent = try #require(await host.nextCall("conversation_send_turn"))
        await again?.value

        #expect(shelf.files == ["/d/attachments/chat-juniper/1-flow.png"])
        let key = try #require(try Self.callKey(of: stored))
        #expect(try Self.callKey(of: storedAgain) == key)
        #expect(try Self.callKey(of: sent) != key)
        #expect(try sent.args(as: SendArgs.self).message.content.contains(shelf.files[0]))
        #expect(store.problem == nil)
        following.cancel()
        await connection.stop()
    }

    @Test func aMissionSendAgainAfterItsFilesWereStoredLeavesOneCopyOnTheHost() async throws {
        let host = TestHost(
            messages: ["thread-mission-1": []], holding: ["chat_store_attachments"],
            answer: { call in
                call.command == "conversation_send_turn" ? TestHost.ok(call, "1") : nil
            })
        var ids = (1...).lazy.map { "id-\($0)" }.makeIterator()
        let store = MissionThreadStore(
            mission: MissionTesting.mission(), missions: MissionsStore(), work: CompanionWork(),
            newId: { ids.next()! })
        let connection = makeConnection()
        let following = Task { await store.follow(connection) }
        await connect(connection, to: host)
        await waitUntil { store.hasLoaded && store.isOnline }
        host.reply(Self.event("test://replay", "1", seq: 1))
        let shelf = FileShelf()

        store.draft = "Look at this"
        store.attachments = [Self.flow]
        let sending = store.send()
        let stored = try #require(await host.nextCall("chat_store_attachments"))
        _ = try shelf.store(stored)
        host.reply(Self.resync(stored))
        await sending?.value
        #expect(store.attachments == [Self.flow])
        let again = store.send()
        let storedAgain = try #require(await host.nextCall("chat_store_attachments"))
        host.reply(TestHost.ok(storedAgain, try shelf.store(storedAgain)))
        let sent = try #require(await host.nextCall("conversation_send_turn"))
        await again?.value

        #expect(shelf.files == ["/d/attachments/thread-mission-1/1-flow.png"])
        let key = try #require(try Self.callKey(of: stored))
        #expect(try Self.callKey(of: storedAgain) == key)
        #expect(try Self.callKey(of: sent) != key)
        #expect(try sent.args(as: SendArgs.self).message.content.contains(shelf.files[0]))
        #expect(store.sendProblem == nil)
        following.cancel()
        await connection.stop()
    }

    struct TurnArgs: Decodable {
        struct Message: Decodable, Equatable {
            let id: String
            let turnId: String
            let content: String
            let createdAt: Int
        }

        let message: Message
    }

    @MainActor
    final class Transcript {
        private(set) var stored: [String] = []
        private(set) var conflicts: [String] = []
        private var rows: [String: TurnArgs.Message] = [:]
        private var ledger: [String: Int] = [:]

        func answer(_ call: TestCall) throws -> String {
            let key = try RepeatedCallTests.callKey(of: call)
            if let key, let seq = ledger[key] {
                return TestHost.ok(call, "\(seq)")
            }
            let message = try call.args(as: TurnArgs.self).message
            if let row = rows[message.id], let field = Self.diverging(row, message) {
                conflicts.append(message.id)
                return TestHost.refused(
                    call, status: 500,
                    #"{"kind":"conflict","id":"\#(message.id)","field":"\#(field)"}"#)
            }
            if rows[message.id] == nil {
                rows[message.id] = message
                stored.append(message.id)
            }
            let seq = (stored.firstIndex(of: message.id) ?? 0) + 1
            if let key {
                ledger[key] = seq
            }
            return TestHost.ok(call, "\(seq)")
        }

        func forget() {
            ledger = [:]
        }

        private static func diverging(_ row: TurnArgs.Message, _ message: TurnArgs.Message)
            -> String?
        {
            if row.turnId != message.turnId { return "turn_id" }
            if row.content != message.content { return "content" }
            if row.createdAt != message.createdAt { return "created_at" }
            return nil
        }
    }

    static func frame(of call: TestCall) throws -> NSDictionary {
        var frame = try #require(
            try JSONSerialization.jsonObject(with: Data(call.text.utf8)) as? [String: Any])
        frame["id"] = nil
        return NSDictionary(dictionary: frame)
    }

    func nextTurn(on host: TestHost, storingOn shelf: FileShelf) async throws -> TestCall? {
        for await call in host.calls {
            switch call.command {
            case "chat_store_attachments": host.reply(TestHost.ok(call, try shelf.store(call)))
            case "conversation_send_turn": return call
            default: continue
            }
        }
        return nil
    }

    @Test(arguments: [false, true])
    func sendAgainAfterTheHostForgotItsKeyIsTheSameCall(withFiles: Bool) async throws {
        let files = withFiles ? [Self.flow] : []
        let host = TestHost(
            messages: ["chat-juniper": []],
            holding: ["chat_store_attachments", "conversation_send_turn"])
        var time = Date(timeIntervalSince1970: 1_791_000_000)
        let store = ThreadStore(
            subject: .companion(juniper), work: CompanionWork(), now: { time })
        let connection = makeConnection()
        let following = Task { await store.follow(connection) }
        await connect(connection, to: host)
        await waitUntil { store.phase == .loaded }
        host.reply(Self.event("test://replay", "1", seq: 1))
        let transcript = Transcript()
        let shelf = FileShelf()

        store.draft = "Look at this"
        store.attachments = files
        let sending = store.send()
        let sent = try #require(try await nextTurn(on: host, storingOn: shelf))
        _ = try transcript.answer(sent)
        host.reply(Self.resync(sent))
        await sending?.value
        #expect(store.problem != nil)
        transcript.forget()
        shelf.forget()
        time += 60
        let again = store.send()
        let resent = try #require(try await nextTurn(on: host, storingOn: shelf))
        host.reply(try transcript.answer(resent))
        await again?.value

        #expect(try Self.frame(of: resent) == Self.frame(of: sent))
        #expect(transcript.conflicts.isEmpty)
        #expect(transcript.stored.count == 1)
        #expect(shelf.files.count == files.count)
        #expect(store.entries.map(\.id) == transcript.stored)
        #expect(store.problem == nil)
        following.cancel()
        await connection.stop()
    }

    @Test(arguments: [false, true])
    func aMissionSendAgainAfterTheHostForgotItsKeyIsTheSameCall(withFiles: Bool) async throws {
        let files = withFiles ? [Self.flow] : []
        let host = TestHost(
            messages: ["thread-mission-1": []],
            holding: ["chat_store_attachments", "conversation_send_turn"])
        var ids = (1...).lazy.map { "id-\($0)" }.makeIterator()
        var time = Date(timeIntervalSince1970: 1_791_000_000)
        let store = MissionThreadStore(
            mission: MissionTesting.mission(), missions: MissionsStore(), work: CompanionWork(),
            now: { time }, newId: { ids.next()! })
        let connection = makeConnection()
        let following = Task { await store.follow(connection) }
        await connect(connection, to: host)
        await waitUntil { store.hasLoaded && store.isOnline }
        host.reply(Self.event("test://replay", "1", seq: 1))
        let transcript = Transcript()
        let shelf = FileShelf()

        store.draft = "Go ahead"
        store.attachments = files
        let sending = store.send()
        let sent = try #require(try await nextTurn(on: host, storingOn: shelf))
        _ = try transcript.answer(sent)
        host.reply(Self.resync(sent))
        await sending?.value
        #expect(store.sendProblem == .couldNotSend)
        transcript.forget()
        shelf.forget()
        time += 60
        let again = store.send()
        let resent = try #require(try await nextTurn(on: host, storingOn: shelf))
        host.reply(try transcript.answer(resent))
        await again?.value

        #expect(try Self.frame(of: resent) == Self.frame(of: sent))
        #expect(transcript.conflicts.isEmpty)
        #expect(transcript.stored.count == 1)
        #expect(shelf.files.count == files.count)
        #expect(store.transcript.entries.map(\.id) == transcript.stored)
        #expect(store.sendProblem == nil)
        #expect(store.draft.isEmpty)
        following.cancel()
        await connection.stop()
    }

    @Test func aGroupSendAgainAfterTheHostForgotItsKeyKeepsItsMentions() async throws {
        let crew = FixtureHost.Group(
            id: "group-crew", title: "Crew", members: [atlas, pico], createdAt: 0)
        let renamed = FixtureHost.Group(
            id: crew.id, title: crew.title,
            members: [Companion(id: atlas.id, name: "Atlas Prime"), pico], createdAt: 0)
        let host = TestHost(
            groups: [crew], messages: [crew.id: []], holding: ["conversation_send_turn"])
        let store = ThreadStore(subject: .group(crew.conversation), work: CompanionWork())
        let connection = makeConnection()
        let following = Task { await store.follow(connection) }
        await connect(connection, to: host)
        await waitUntil { store.phase == .loaded }
        host.reply(Self.event("test://replay", "1", seq: 1))
        let transcript = Transcript()

        store.draft = "@Atlas ship it"
        let sending = store.send()
        let sent = try #require(await host.nextCall("conversation_send_turn"))
        _ = try transcript.answer(sent)
        host.reply(
            Self.event(
                "conversation://updated", #"{"spaceId":"s-1","conversation":\#(renamed.json)}"#,
                seq: 2))
        await waitUntil { store.subject.members.first?.name == "Atlas Prime" }
        host.reply(Self.resync(sent))
        await sending?.value
        #expect(store.draft == "@Atlas ship it")
        transcript.forget()
        let again = store.send()
        let resent = try #require(await host.nextCall("conversation_send_turn"))
        host.reply(try transcript.answer(resent))
        await again?.value

        #expect(try sent.args(as: TurnArgs.self).message.content == "<@atlas> ship it")
        #expect(try Self.frame(of: resent) == Self.frame(of: sent))
        #expect(transcript.conflicts.isEmpty)
        #expect(store.problem == nil)
        following.cancel()
        await connection.stop()
    }
}
