import Foundation
import Observation
import Testing

@testable import Kiroshi

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct QuestionThreadTests {
    let transport = TestRelayTransport()
    let clock = TestRelayClock()
    let juniper = Companion(id: "juniper", name: "Juniper")
    let work = CompanionWork()

    nonisolated static let request =
        #"{"id":"q1","questions":[{"header":"Format","question":"Which format should the release notes take?","multiSelect":false,"options":[{"label":"Summary","description":"One line per change","preview":null},{"label":"Full changelog","description":null,"preview":null}]},{"header":"Audience","question":"Who reads these notes first?","multiSelect":true,"options":[{"label":"People using the app","description":null,"preview":null},{"label":"Developers","description":null,"preview":null}]}]}"#
    nonisolated static let asked = #"{"type":"questionRequested","request":\#(request)}"#
    nonisolated static let pending =
        #"[{"scope":{"conversationId":"chat-juniper","botId":"bot","runtimeSessionId":"session-1","epoch":1},"turn":{"turnId":"turn-1","conversationId":"chat-juniper"},"event":\#(asked)}]"#

    let thread = [
        TestHost.message(
            "m1", in: "chat-juniper", seq: 1, isYours: true,
            "Can you draft the release notes for 4.2?", at: 1_791_000_000_000),
        TestHost.message(
            "m2", in: "chat-juniper", seq: 2, isYours: false,
            "I’ve read the 31 pull requests merged since 4.1.", at: 1_791_000_060_000),
        TestHost.message(
            "question-q1", in: "chat-juniper", seq: 3, isYours: false,
            "### Which format should the release notes take?\n- Summary — One line per change",
            at: 1_791_000_061_000),
    ]

    func makeStore() -> ThreadStore {
        var ids = (1...).lazy.map { "id-\($0)" }.makeIterator()
        return ThreadStore(
            subject: .companion(juniper), work: work,
            authorship: ThreadAuthorship(accountId: "me", isHostedByYou: false),
            now: { Date(milliseconds: 1_791_000_100_000) }, makeId: { ids.next()! })
    }

    func waitUntil(_ condition: @escaping @MainActor @Sendable () -> Bool) async {
        for await isMet in Observations({ condition() }) where isMet {
            return
        }
    }

    func follow(_ host: TestHost, _ store: ThreadStore) async -> (
        RelayConnection, Task<Void, Never>
    ) {
        let connection = RelayConnection(
            baseURL: KiroshiCloud.productionURL, instanceId: "instance-1", bearer: "fixture-bearer",
            environment: RelayEnvironment(transport: transport, clock: clock),
            backoff: Backoff(jitter: { $0 }))
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
        await waitUntil { store.phase == .loaded }
        return (connection, following)
    }

    func waitingHost(answer: @escaping TestHost.Answer = { _ in nil }) -> TestHost {
        TestHost(messages: ["chat-juniper": thread]) { call in
            switch call.command {
            case "agent_pending_questions": TestHost.ok(call, Self.pending)
            case "agent_answer_question": TestHost.ok(call, "null")
            case "conversation_append_user_message": TestHost.ok(call, "4")
            default: answer(call)
            }
        }
    }

    func isAsking(_ store: ThreadStore) -> Bool {
        guard case .asking = store.questionCard("q1") else { return false }
        return true
    }

    @Test func aQuestionWaitingWhenTheThreadOpensShowsItsCardInsteadOfTheWorkingLine() async {
        let host = waitingHost()
        let store = makeStore()
        let (connection, following) = await follow(host, store)

        await waitUntil { isAsking(store) }

        #expect(store.entries.map(\.id) == ["m1", "m2", "question-q1"])
        #expect(store.entries.last?.bubbles.isEmpty == true)
        #expect(store.isWorking)
        #expect(store.working == nil)
        guard case .asking(let asking) = store.questionCard("q1") else { return }
        #expect(asking.question.request.questions.map(\.header) == ["Format", "Audience"])
        #expect(asking.question.turnId == "turn-1")
        following.cancel()
        await connection.stop()
    }

    @Test func aQuestionAskedLiveGetsItsRowBeforeTheHostStoresIt() async {
        let host = TestHost(messages: ["chat-juniper": Array(thread.prefix(2))])
        let store = makeStore()
        let (connection, following) = await follow(host, store)

        host.pushAgent("chat-juniper", Self.asked)
        await waitUntil { store.entries.count == 3 }
        #expect(store.entries.map(\.id) == ["m1", "m2", "question-q1"])
        await waitUntil { isAsking(store) }

        host.push(event: "conversation://message-stored", payload: thread[2])
        await waitUntil { store.entries.last?.text.hasPrefix("### Which") == true }
        #expect(store.entries.map(\.id) == ["m1", "m2", "question-q1"])
        #expect(isAsking(store))
        following.cancel()
        await connection.stop()
    }

    @Test func theCardSendsEachAnswerKeyedByItsQuestionThenRecordsTheAnswer() async throws {
        let host = waitingHost()
        let store = makeStore()
        let (connection, following) = await follow(host, store)
        await waitUntil { isAsking(store) }
        guard case .asking(let asking) = store.questionCard("q1") else { return }
        var draft = QuestionDraft(request: asking.question.request)
        draft.pick(draft.asked.options[0])
        _ = draft.goOn()
        draft.pick(draft.asked.options[1])
        draft.pick(draft.asked.options[0])

        let answering = store.answer(draft)
        let call = try #require(await host.nextCall("agent_answer_question"))
        let recorded = try #require(await host.nextCall("conversation_append_user_message"))
        await answering?.value

        let answered = try call.args(as: AnswerArgs.self)
        #expect(answered.id == "q1")
        #expect(answered.scope.runtimeSessionId == "session-1")
        #expect(
            answered.answers == [
                "Which format should the release notes take?": "Summary",
                "Who reads these notes first?": "Developers, People using the app",
            ])
        let message = try recorded.args(as: RecordArgs.self).message
        #expect(message.content == "Summary\n\nDevelopers, People using the app")
        #expect(message.repliedToMessageId == "question-q1")
        #expect(message.turnId == "turn-1")
        #expect(message.conversationId == "chat-juniper")
        #expect(message.authorBotId == nil)
        #expect(recorded.text.contains(#""authorBotId":null"#))
        #expect(
            store.questionCard("q1")
                == .answered(
                    QuestionAnswered(
                        by: .you,
                        lines: [
                            QuestionAnswerLine(header: "Format", answer: "Summary"),
                            QuestionAnswerLine(
                                header: "Audience", answer: "Developers, People using the app"),
                        ])))
        #expect(work.question(in: "chat-juniper") == nil)
        #expect(store.working != nil)
        following.cancel()
        await connection.stop()
    }

    @Test func theHostEchoingTheAnswerBeforeItAnswersKeepsTheCardYours() async throws {
        let host = TestHost(
            messages: ["chat-juniper": thread], holding: ["agent_answer_question"],
            answer: { call in
                switch call.command {
                case "agent_pending_questions": TestHost.ok(call, Self.pending)
                case "conversation_append_user_message": TestHost.ok(call, "4")
                default: nil
                }
            })
        let store = makeStore()
        let (connection, following) = await follow(host, store)
        await waitUntil { isAsking(store) }
        guard case .asking(let asking) = store.questionCard("q1") else { return }
        var draft = QuestionDraft(request: asking.question.request)
        draft.pick(draft.asked.options[0])

        let answering = store.answer(draft)
        let call = try #require(await host.nextCall("agent_answer_question"))
        host.pushAgent(
            "chat-juniper", #"{"type":"permissionResolved","id":"q1","decision":"allowOnce"}"#)
        await waitUntil { work.question("q1") == nil }
        guard case .asking(let sending) = store.questionCard("q1") else {
            Issue.record("the card left while its answer was sent")
            return
        }
        #expect(sending.isSending)

        host.reply(TestHost.ok(call, "null"))
        await answering?.value

        guard case .answered(let answered) = store.questionCard("q1") else {
            Issue.record("the card did not collapse")
            return
        }
        #expect(answered.by == .you)
        following.cancel()
        await connection.stop()
    }

    @Test func aRefusedAnswerKeepsTheCardWithItsProblem() async throws {
        let refusing = TestHost(messages: ["chat-juniper": thread]) { call in
            switch call.command {
            case "agent_pending_questions": TestHost.ok(call, Self.pending)
            case "agent_answer_question":
                TestHost.refused(call, status: 500, #"{"kind":"notStarted"}"#)
            default: nil
            }
        }
        let store = makeStore()
        let (connection, following) = await follow(refusing, store)
        await waitUntil { isAsking(store) }
        guard case .asking(let asking) = store.questionCard("q1") else { return }
        var draft = QuestionDraft(request: asking.question.request)
        draft.pick(draft.asked.options[0])

        await store.answer(draft)?.value

        guard case .asking(let failed) = store.questionCard("q1") else {
            Issue.record("the card left after a refused answer")
            return
        }
        #expect(failed.hasFailed)
        #expect(!failed.isSending)
        following.cancel()
        await connection.stop()
    }

    @Test func aMessageSentWhileAQuestionWaitsAnswersItsFirstQuestion() async throws {
        let host = waitingHost()
        let store = makeStore()
        let (connection, following) = await follow(host, store)
        await waitUntil { isAsking(store) }
        store.draft = "  A summary for users, with breaking changes at the top. "
        #expect(store.canSend)

        let sending = store.send()
        let call = try #require(await host.nextCall("agent_answer_question"))
        await sending?.value

        #expect(
            try call.args(as: AnswerArgs.self).answers == [
                "Which format should the release notes take?":
                    "A summary for users, with breaking changes at the top."
            ])
        #expect(store.draft.isEmpty)
        #expect(store.lastSentId == nil)
        #expect(
            store.questionCard("q1")
                == .answered(
                    QuestionAnswered(
                        by: .you,
                        lines: [
                            QuestionAnswerLine(
                                header: "Format",
                                answer: "A summary for users, with breaking changes at the top.")
                        ])))
        following.cancel()
        await connection.stop()
    }

    @Test func noFileGoesWithAnAnswerFromTheComposer() async {
        let host = waitingHost()
        let store = makeStore()
        let (connection, following) = await follow(host, store)
        await waitUntil { isAsking(store) }

        store.attachments = [PickedAttachment(id: UUID(), name: "notes.md", data: Data("x".utf8))]
        #expect(!store.canSend)
        store.draft = "Summary"
        #expect(store.canSend)
        following.cancel()
        await connection.stop()
    }

    @Test func aQuestionAnsweredOnAnotherDeviceSaysSoThenShowsTheAnswer() async {
        let host = waitingHost()
        let store = makeStore()
        let (connection, following) = await follow(host, store)
        await waitUntil { isAsking(store) }

        host.pushAgent(
            "chat-juniper", #"{"type":"permissionResolved","id":"q1","decision":"allowOnce"}"#)
        await waitUntil { store.questionCard("q1") == .answered(.init(by: .elsewhere, lines: [])) }

        host.push(
            event: "conversation://message-stored",
            payload: answerRow(content: "Full changelog\n\nDevelopers", account: "host-account"))
        await waitUntil {
            store.questionCard("q1")
                == .answered(
                    .init(
                        by: .elsewhere,
                        lines: [
                            QuestionAnswerLine(header: "Format", answer: "Full changelog"),
                            QuestionAnswerLine(header: "Audience", answer: "Developers"),
                        ]))
        }
        #expect(store.entries.map(\.id) == ["m1", "m2", "question-q1", "answer-1"])
        #expect(store.entries.last?.bubbles.isEmpty == true)
        following.cancel()
        await connection.stop()
    }

    @Test func aQuestionDroppedWhenItsTurnEndsLeavesNoCardAndNoBubble() async {
        let host = waitingHost()
        let store = makeStore()
        let (connection, following) = await follow(host, store)
        await waitUntil { isAsking(store) }

        host.pushAgent(
            "chat-juniper", #"{"type":"turnEnded","ended":{"sessionId":null,"outcome":"success"}}"#)
        await waitUntil { store.questionCard("q1") == nil }

        #expect(store.entries.flatMap(\.bubbles).count == 2)
        #expect(store.working == nil)
        following.cancel()
        await connection.stop()
    }

    @Test func anAnswerStoredEarlierFoldsIntoItsCardOnOpening() async {
        let host = TestHost(
            messages: ["chat-juniper": thread + [answerRow(content: "Summary", account: "me")]])
        let store = makeStore()
        let (connection, following) = await follow(host, store)

        #expect(
            store.questionCard("q1")
                == .answered(
                    .init(by: .you, lines: [QuestionAnswerLine(header: nil, answer: "Summary")])))
        #expect(store.entries.flatMap(\.bubbles).count == 2)
        following.cancel()
        await connection.stop()
    }

    @Test func aReplayAnsweredWhileInFlightStaysAnswered() async throws {
        let host = TestHost(
            messages: ["chat-juniper": thread], holding: ["agent_pending_questions"])
        let store = makeStore()
        let connection = RelayConnection(
            baseURL: KiroshiCloud.productionURL, instanceId: "instance-1", bearer: "fixture-bearer",
            environment: RelayEnvironment(transport: transport, clock: clock),
            backoff: Backoff(jitter: { $0 }))
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
        _ = try #require(await host.nextCall("agent_pending_questions"))

        host.pushAgent(
            "chat-juniper", #"{"type":"permissionResolved","id":"q1","decision":"allowOnce"}"#)
        host.pushAgent("chat-juniper", #"{"type":"turnChanged","state":"running"}"#)
        await waitUntil { !work.workers.isEmpty }
        let reloading = store.reload()
        let replay = try #require(await host.nextCall("agent_pending_questions"))
        host.reply(TestHost.ok(replay, Self.pending))
        await reloading?.value

        #expect(work.question("q1") == nil)
        #expect(!isAsking(store))
        #expect(store.working != nil)
        following.cancel()
        await connection.stop()
    }

    func answerRow(content: String, account: String) -> String {
        #"{"id":"answer-1","conversationId":"chat-juniper","turnId":"turn-1","seq":4,"role":"user","content":"\#(content.replacingOccurrences(of: "\n", with: #"\n"#))","completion":"complete","createdAt":1791000090000,"authorBotId":null,"authorAccountId":"\#(account)","authorName":"Sam","repliedToMessageId":"question-q1","runtimeSessionId":null}"#
    }

    struct AnswerArgs: Decodable {
        let scope: AgentEvent.Scope
        let id: String
        let answers: [String: String]
    }

    struct RecordArgs: Decodable {
        struct Message: Decodable {
            let id: String
            let conversationId: String
            let turnId: String
            let content: String
            let repliedToMessageId: String?
            let authorBotId: String?
        }

        let message: Message
    }
}
