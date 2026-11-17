import Foundation
import Synchronization
import Testing

@testable import Kiroshi

extension RepeatedCallTests {
    nonisolated static func alreadyRan(_ call: TestCall) -> String {
        TestHost.refused(
            call, status: 410, #""this call already ran and the host keeps no answer for it""#)
    }

    nonisolated static func page(_ call: TestCall, of conversationId: String, _ rows: [String])
        -> String
    {
        TestHost.ok(call, TestHost.messagePage(conversationId, rows, hasMore: false))
    }

    func timeOutTheCallInFlight() async {
        await clock.wakeNextSleep(of: RelayConnection.callDeadline)
    }

    @Test func aSendTheHostAnswersAlreadyRanShowsWhatItsFirstRunStored() async throws {
        let transcript = Mutex<[String]>([])
        let sends = Mutex<[TestCall]>([])
        let host = TestHost(answer: { call in
            switch call.command {
            case "conversation_message_page":
                return Self.page(call, of: "chat-juniper", transcript.withLock { $0 })
            case "conversation_send_turn":
                let count = sends.withLock {
                    $0.append(call)
                    return $0.count
                }
                return count == 1 ? nil : Self.alreadyRan(call)
            default:
                return nil
            }
        })
        let store = ThreadStore(subject: .companion(juniper), work: CompanionWork())
        let connection = makeConnection()
        let following = Task { await store.follow(connection) }
        await connect(connection, to: host)
        await waitUntil { store.phase == .loaded }

        store.draft = "Ship it"
        let sending = store.send()
        let sent = try #require(await host.nextCall("conversation_send_turn"))
        let id = try sent.args(as: SendArgs.self).message.id
        transcript.withLock { $0.append(Self.yours(id, "Ship it", seq: 1, in: "chat-juniper")) }
        await timeOutTheCallInFlight()
        await sending?.value
        #expect(store.sendFailure == .timedOut)
        #expect(store.draft == "Ship it")
        let again = store.send()
        await again?.value
        await waitUntil { store.entries.contains { $0.id == id } }

        let calls = sends.withLock { $0 }
        #expect(calls.count == 2)
        #expect(try Self.callKey(of: calls[1]) == Self.callKey(of: sent))
        #expect(store.entries.map(\.id) == [id])
        #expect(store.problem == nil)
        #expect(store.draft.isEmpty)
        following.cancel()
        await connection.stop()
    }

    @Test func filesTheHostAnswersAlreadyRanAreStoredAgainUnderANewKeyAndSent() async throws {
        let stores = Mutex<[TestCall]>([])
        let host = TestHost(
            messages: ["chat-juniper": []],
            answer: { call in
                switch call.command {
                case "chat_store_attachments":
                    let count = stores.withLock {
                        $0.append(call)
                        return $0.count
                    }
                    return switch count {
                    case 1: nil
                    case 2: Self.alreadyRan(call)
                    default: TestHost.ok(call, #"["/d/attachments/chat-juniper/2-flow.png"]"#)
                    }
                case "conversation_send_turn":
                    return TestHost.ok(call, "1")
                default:
                    return nil
                }
            })
        let store = ThreadStore(subject: .companion(juniper), work: CompanionWork())
        let connection = makeConnection()
        let following = Task { await store.follow(connection) }
        await connect(connection, to: host)
        await waitUntil { store.phase == .loaded }

        store.draft = "Look at this"
        store.attachments = [Self.flow]
        let sending = store.send()
        _ = await host.nextCall("chat_store_attachments")
        await timeOutTheCallInFlight()
        await sending?.value
        #expect(store.attachments == [Self.flow])
        let again = store.send()
        let sent = try #require(await host.nextCall("conversation_send_turn"))
        await again?.value

        let keys = try stores.withLock { $0 }.map { try Self.callKey(of: $0) }
        #expect(keys.count == 3)
        #expect(keys[1] == keys[0])
        #expect(keys[2] != keys[0])
        let message = try sent.args(as: SendArgs.self).message
        #expect(message.content.contains("/d/attachments/chat-juniper/2-flow.png"))
        #expect(store.entries.map(\.id) == [message.id])
        #expect(store.problem == nil)
        #expect(store.attachments.isEmpty)
        following.cancel()
        await connection.stop()
    }

    @Test func anAnswerTheHostAnswersAlreadyRanShowsAsAnsweredByThisDevice() async throws {
        let host = questionHost()
        let (store, connection, following) = try await followQuestion(host)

        let answering = try answerSummary(in: store)
        let call = try #require(await host.nextCall("agent_answer_question"))
        await timeOutTheCallInFlight()
        await answering?.value
        #expect(try #require(store.asking).hasFailed)
        let again = try answerSummary(in: store)
        let repeated = try #require(await host.nextCall("agent_answer_question"))
        host.reply(Self.alreadyRan(repeated))
        await again?.value

        #expect(try Self.callKey(of: repeated) == Self.callKey(of: call))
        #expect(store.asking == nil)
        #expect(store.answeredQuestion("q1")?.by == .you)
        let recorded = try #require(await host.nextCall("conversation_append_user_message"))
        #expect(try recorded.args(as: RecordArgs.self).message.repliedToMessageId == "question-q1")
        following.cancel()
        await connection.stop()
    }

    @Test func aGroupCreationTheHostAnswersAlreadyRanClosesThePickerOnTheListedGroup()
        async throws
    {
        let group = created
        let isCreated = Mutex(false)
        let host = TestHost(
            companions: [juniper, atlas, pico],
            answer: { call in
                switch call.command {
                case "conversation_page" where isCreated.withLock({ $0 }):
                    return TestHost.ok(
                        call,
                        FixtureHost.conversationPage(
                            [TestHost.pageRow(group, last: nil)], cursor: nil,
                            limit: ConversationRelay.listPageSize))
                case "conversation_create":
                    return isCreated.withLock {
                        guard $0 else {
                            $0 = true
                            return nil
                        }
                        return Self.alreadyRan(call)
                    }
                default:
                    return nil
                }
            })
        let (store, connection, following) = await followList(host)

        let creating = store.createGroup(with: ["juniper", "pico"])
        let call = try #require(await host.nextCall("conversation_create"))
        await timeOutTheCallInFlight()
        await creating?.value
        #expect(store.creation == .failed)
        let again = store.createGroup(with: ["juniper", "pico"])
        let repeated = try #require(await host.nextCall("conversation_create"))
        await again?.value
        await waitUntil { store.summaries.contains { $0.id == group.id } }

        #expect(try Self.callKey(of: repeated) == Self.callKey(of: call))
        #expect(store.creation == .idle)
        #expect(!store.isPickingCompanions)
        #expect(store.summaries.filter { $0.id == group.id }.count == 1)
        following.cancel()
        await connection.stop()
    }

    func followMission(_ host: TestHost) async -> (
        MissionThreadStore, RelayConnection, Task<Void, Never>
    ) {
        var ids = (1...).lazy.map { "id-\($0)" }.makeIterator()
        let store = MissionThreadStore(
            mission: MissionTesting.mission(), missions: MissionsStore(), work: CompanionWork(),
            newId: { ids.next()! })
        let connection = makeConnection()
        let following = Task { await store.follow(connection) }
        await connect(connection, to: host)
        await waitUntil { store.hasLoaded && store.isOnline }
        return (store, connection, following)
    }

    @Test func aMissionAnswerTheHostAnswersAlreadyRanShowsWhatItsFirstRunStored() async throws {
        let transcript = Mutex<[String]>([])
        let sends = Mutex<[TestCall]>([])
        let host = TestHost(answer: { call in
            switch call.command {
            case "conversation_message_page":
                return Self.page(call, of: "thread-mission-1", transcript.withLock { $0 })
            case "conversation_send_turn":
                let count = sends.withLock {
                    $0.append(call)
                    return $0.count
                }
                return count == 1 ? nil : Self.alreadyRan(call)
            default:
                return nil
            }
        })
        let (store, connection, following) = await followMission(host)

        store.draft = "Go ahead"
        let sending = store.send()
        let sent = try #require(await host.nextCall("conversation_send_turn"))
        let id = try sent.args(as: SendArgs.self).message.id
        transcript.withLock {
            $0.append(Self.yours(id, "Go ahead", seq: 1, in: "thread-mission-1"))
        }
        await timeOutTheCallInFlight()
        await sending?.value
        #expect(store.sendProblem == .couldNotSend)
        let again = store.send()
        await again?.value
        await waitUntil { store.transcript.entries.contains { $0.id == id } }

        let calls = sends.withLock { $0 }
        #expect(calls.count == 2)
        #expect(try Self.callKey(of: calls[1]) == Self.callKey(of: sent))
        #expect(store.transcript.entries.map(\.id) == [id])
        #expect(store.sendProblem == nil)
        #expect(store.draft.isEmpty)
        following.cancel()
        await connection.stop()
    }

    @Test func missionFilesTheHostAnswersAlreadyRanAreStoredAgainUnderANewKeyAndSent()
        async throws
    {
        let stores = Mutex<[TestCall]>([])
        let host = TestHost(
            messages: ["thread-mission-1": []],
            answer: { call in
                switch call.command {
                case "chat_store_attachments":
                    let count = stores.withLock {
                        $0.append(call)
                        return $0.count
                    }
                    return switch count {
                    case 1: nil
                    case 2: Self.alreadyRan(call)
                    default:
                        TestHost.ok(call, #"["/d/attachments/thread-mission-1/2-flow.png"]"#)
                    }
                case "conversation_send_turn":
                    return TestHost.ok(call, "1")
                default:
                    return nil
                }
            })
        let (store, connection, following) = await followMission(host)

        store.draft = "Look at this"
        store.attachments = [Self.flow]
        let sending = store.send()
        _ = await host.nextCall("chat_store_attachments")
        await timeOutTheCallInFlight()
        await sending?.value
        #expect(store.sendProblem == .couldNotSend)
        let again = store.send()
        let sent = try #require(await host.nextCall("conversation_send_turn"))
        await again?.value

        let keys = try stores.withLock { $0 }.map { try Self.callKey(of: $0) }
        #expect(keys.count == 3)
        #expect(keys[1] == keys[0])
        #expect(keys[2] != keys[0])
        let message = try sent.args(as: SendArgs.self).message
        #expect(message.content.contains("/d/attachments/thread-mission-1/2-flow.png"))
        #expect(store.transcript.entries.map(\.id) == [message.id])
        #expect(store.sendProblem == nil)
        #expect(store.draft.isEmpty)
        following.cancel()
        await connection.stop()
    }

    @Test func sendAgainAfterTheHostCouldNotRunTheCallRunsIt() async throws {
        let sends = Mutex<[TestCall]>([])
        let host = TestHost(
            messages: ["chat-juniper": []],
            answer: { call in
                guard call.command == "conversation_send_turn" else { return nil }
                let count = sends.withLock {
                    $0.append(call)
                    return $0.count
                }
                return count == 1
                    ? TestHost.refused(call, status: 502, #""could not connect to the host api""#)
                    : TestHost.ok(call, "1")
            })
        let store = ThreadStore(subject: .companion(juniper), work: CompanionWork())
        let connection = makeConnection()
        let following = Task { await store.follow(connection) }
        await connect(connection, to: host)
        await waitUntil { store.phase == .loaded }

        store.draft = "Ship it"
        await store.send()?.value
        #expect(store.sendFailure == .hostFault)
        #expect(store.draft == "Ship it")
        await store.send()?.value

        let calls = sends.withLock { $0 }
        #expect(calls.count == 2)
        #expect(try Self.callKey(of: calls[1]) == Self.callKey(of: calls[0]))
        let id = try calls[0].args(as: SendArgs.self).message.id
        #expect(store.entries.map(\.id) == [id])
        #expect(store.problem == nil)
        #expect(store.draft.isEmpty)
        following.cancel()
        await connection.stop()
    }
}
