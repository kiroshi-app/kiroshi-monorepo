import Foundation
import Observation
import Testing

@testable import Kiroshi

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct MissionStoresTests {
    let transport = TestRelayTransport()
    let clock = TestRelayClock()
    let companions = #"[{"id":"bot-1","name":"Atlas"}]"#

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

    func feed(_ missions: Mission...) -> String {
        let encoded = missions.map {
            MissionTesting.missionJSON(
                id: $0.id, state: $0.state.rawValue, liveness: $0.liveness?.rawValue)
        }
        return page(
            encoded.map {
                #"{"conversationId":"c-1","conversationTitle":"Roadmap","mission":\#($0)}"#
            })
    }

    func page(_ entries: [String], next: String? = nil) -> String {
        let next = next.map { #""\#($0)""# } ?? "null"
        return #"{"missions":[\#(entries.joined(separator: ","))],"nextCursor":\#(next)}"#
    }

    func nextCall(_ command: String, on socket: ScriptedRelaySocket) async -> [String: Any] {
        for await text in socket.sent {
            guard
                let call = try? JSONSerialization.jsonObject(with: Data(text.utf8))
                    as? [String: Any],
                call["command"] as? String == command
            else { continue }
            return call
        }
        return [:]
    }

    @Test func theListReadsTheSharedSpaceAndNamesTheCompanions() async {
        let connection = makeConnection()
        let store = MissionsStore()
        let socket = ScriptedRelaySocket(
            sharedSpaceId: "s-1",
            answers: [
                "conversation_bots": companions,
                "mission_space_page": feed(
                    MissionTesting.mission(id: "asks", state: "waiting_human"),
                    MissionTesting.mission(id: "works")),
            ])
        let following = Task { await store.follow(connection) }
        await connection.start()
        await transport.nextOpening().accept(socket)

        let call = await nextCall("mission_space_page", on: socket)
        await waitUntil { store.hasLoaded }

        #expect((call["args"] as? [String: Any])?["spaceId"] as? String == "s-1")
        #expect(store.sections.map(\.group) == [.needsYou, .working])
        #expect(store.companions.mapValues(\.name) == ["bot-1": "Atlas"])
        following.cancel()
        await connection.stop()
    }

    @Test func aConversationShowsOnlyTheMissionsOpenedInIt() async {
        let connection = makeConnection()
        let store = MissionsStore()
        let opened = { (conversationId: String, id: String, state: String) in
            #"{"conversationId":"\#(conversationId)","conversationTitle":"","mission":\#(MissionTesting.missionJSON(id: id, state: state))}"#
        }
        let socket = ScriptedRelaySocket(
            sharedSpaceId: "s-1",
            answers: [
                "conversation_bots": companions,
                "mission_space_page": page([
                    opened("release", "asks", "waiting_human"),
                    opened("roadmap", "works", "working"),
                    opened("release", "merges", "ready_to_merge"),
                ]),
            ])
        let following = Task { await store.follow(connection) }
        await connection.start()
        await transport.nextOpening().accept(socket)
        await waitUntil { store.hasLoaded }

        let release = store.sections(in: "release")
        #expect(release.map(\.group) == [.needsYou, .review])
        #expect(release.flatMap(\.missions).map(\.id) == ["asks", "merges"])
        #expect(store.sections(in: "roadmap").flatMap(\.missions).map(\.id) == ["works"])
        #expect(store.sections(in: "elsewhere").isEmpty)
        #expect(store.sections(in: nil) == store.sections)
        #expect(store.sections.map(\.group) == [.needsYou, .working, .review])
        following.cancel()
        await connection.stop()
    }

    @Test func theListStaysWhenTheHostGoesOffline() async {
        let connection = makeConnection()
        let store = MissionsStore()
        let socket = ScriptedRelaySocket(
            sharedSpaceId: "s-1",
            answers: [
                "conversation_bots": companions,
                "mission_space_page": feed(MissionTesting.mission(id: "works")),
            ], hostLeavesAfter: "mission_space_page")
        let updates = await connection.updates()
        let following = Task { await store.follow(connection) }
        await connection.start()
        await transport.nextOpening().accept(socket)
        await waitUntil { store.hasLoaded }

        for await update in updates {
            if case .state(.hostOffline) = update { break }
        }

        #expect(store.hasFailed == false)
        #expect(store.sections.first?.missions.map(\.id) == ["works"])
        following.cancel()
        await connection.stop()
    }

    @Test func aMissionChangeMovesItAndRereadsTheList() async {
        let connection = makeConnection()
        let store = MissionsStore()
        let socket = ScriptedRelaySocket(
            sharedSpaceId: "s-1", answers: ["conversation_bots": companions])
        let following = Task { await store.follow(connection) }
        await connection.start()
        await transport.nextOpening().accept(socket)
        let first = await nextCall("mission_space_page", on: socket)
        socket.push(
            .frame(
                #"{"id":\#(first["id"] as? Int ?? 0),"status":200,"body":\#(feed(MissionTesting.mission(id: "works")))}"#
            ))
        await waitUntil { store.hasLoaded }

        socket.push(
            .frame(
                #"{"event":{"event":"mission://changed","payload":{"missionId":"works","state":"waiting_human","stateSeq":2,"isAgentRunning":false,"lastActivityAt":5}}}"#
            ))

        await waitUntil { store.sections.first?.group == .needsYou }
        _ = await nextCall("mission_space_page", on: socket)
        following.cancel()
        await connection.stop()
    }

    @Test func aLivenessChangeMovesTheRowLive() async {
        let connection = makeConnection()
        let store = MissionsStore()
        let socket = ScriptedRelaySocket(
            sharedSpaceId: "s-1", answers: ["conversation_bots": companions])
        let following = Task { await store.follow(connection) }
        await connection.start()
        await transport.nextOpening().accept(socket)
        let first = await nextCall("mission_space_page", on: socket)
        socket.push(
            .frame(
                #"{"id":\#(first["id"] as? Int ?? 0),"status":200,"body":\#(feed(MissionTesting.mission(id: "works", liveness: "idle")))}"#
            ))
        await waitUntil { store.hasLoaded }
        let row = { store.sections.flatMap(\.missions).first }
        #expect(store.sections.map(\.group) == [.working])
        #expect(row()?.isWorking == false)

        socket.push(
            .frame(
                #"{"event":{"event":"mission://changed","payload":{"missionId":"works","state":"working","stateSeq":1,"isAgentRunning":true,"liveness":"working","lastActivityAt":5}}}"#
            ))
        await waitUntil { row()?.isWorking == true }
        #expect(row()?.statusLine == "Working now")

        socket.push(
            .frame(
                #"{"event":{"event":"mission://changed","payload":{"missionId":"works","state":"working","stateSeq":1,"isAgentRunning":true,"liveness":"needs_you","lastActivityAt":6}}}"#
            ))
        await waitUntil { store.sections.first?.group == .needsYou }

        #expect(row()?.isWorking == false)
        following.cancel()
        await connection.stop()
    }

    @Test func aRowShowsTheQuestionLiveThenNamesItsCompanionOnceAnswered() async {
        let connection = makeConnection()
        let store = MissionsStore()
        let socket = ScriptedRelaySocket(
            sharedSpaceId: "s-1", answers: ["conversation_bots": companions])
        let following = Task { await store.follow(connection) }
        await connection.start()
        await transport.nextOpening().accept(socket)
        let first = await nextCall("mission_space_page", on: socket)
        socket.push(
            .frame(
                #"{"id":\#(first["id"] as? Int ?? 0),"status":200,"body":\#(feed(MissionTesting.mission(id: "works", liveness: "idle")))}"#
            ))
        await waitUntil { store.hasLoaded && !store.companions.isEmpty }
        let detail = { store.sections.flatMap(\.missions).first.map(store.detailLine(of:)) }

        socket.push(
            .frame(
                #"{"event":{"event":"mission://changed","payload":{"missionId":"works","state":"waiting_human","stateSeq":2,"isAgentRunning":false,"liveness":"needs_you","pendingPrompt":{"promptId":"p1","kind":"question","text":"Which screen goes first?"},"workingBotIds":[],"lastActivityAt":5}}}"#
            ))
        await waitUntil { detail() == "Atlas · Which screen goes first?" }

        socket.push(
            .frame(
                #"{"event":{"event":"mission://changed","payload":{"missionId":"works","state":"working","stateSeq":3,"isAgentRunning":true,"liveness":"working","pendingPrompt":null,"workingBotIds":["bot-1"],"lastActivityAt":6}}}"#
            ))
        await waitUntil { detail() == "Atlas · Working now" }

        #expect(store.sections.map(\.group) == [.working])
        following.cancel()
        await connection.stop()
    }

    @Test func theThreadReadsItsConversationAndSendsAnAnswerToItsCompanion() async {
        let connection = makeConnection()
        let mission = MissionTesting.mission(
            id: "mission-1", state: "waiting_human", botId: "bot-1")
        let store = MissionThreadStore(
            mission: mission, missions: MissionsStore(), work: CompanionWork(),
            now: { Date(timeIntervalSince1970: 100) }, newId: { "id-1" })
        let page =
            #"{"conversationId":"thread-mission-1","hasMore":false,"arrivals":[],"messages":[\#(MissionTesting.message(id: "s", seq: 1, content: "Carry out this mission.")),\#(MissionTesting.message(id: "q", seq: 2, role: "assistant", content: "Which one first?", botId: "bot-1"))]}"#
        let socket = ScriptedRelaySocket(
            sharedSpaceId: "s-1",
            answers: ["conversation_message_page": page, "conversation_send_turn": "3"])
        let following = Task { await store.follow(connection) }
        await connection.start()
        await transport.nextOpening().accept(socket)
        await waitUntil { store.hasLoaded && store.isOnline }

        #expect(
            MissionTesting.shown(store.transcript) == [
                .init(id: "q", isYours: false, bubbles: ["Which one first?"])
            ])

        store.draft = " The account step. "
        store.send()
        #expect(store.lastSentId == "id-1")
        let call = await nextCall("conversation_send_turn", on: socket)
        await waitUntil { store.draft.isEmpty }

        let args = call["args"] as? [String: Any]
        let message = args?["message"] as? [String: Any]
        #expect(args?["summoned"] as? [String] == ["bot-1"])
        #expect(message?["conversationId"] as? String == "thread-mission-1")
        #expect(message?["content"] as? String == "The account step.")
        #expect(message?["createdAt"] as? Int == 100_000)
        #expect(message?.keys.contains("repliedToMessageId") == true)
        #expect(
            MissionTesting.shown(store.transcript).last
                == .init(id: "id-1", isYours: true, bubbles: ["The account step."]))
        following.cancel()
        await connection.stop()
    }

    @Test func anAnswerSentJustBeforeLeavingTheThreadStillReachesTheHost() async {
        let connection = makeConnection()
        let store = MissionThreadStore(
            mission: MissionTesting.mission(), missions: MissionsStore(), work: CompanionWork(),
            newId: { "id-1" })
        let socket = ScriptedRelaySocket(
            sharedSpaceId: "s-1",
            answers: [
                "conversation_message_page":
                    #"{"conversationId":"thread-mission-1","hasMore":false,"arrivals":[],"messages":[]}"#
            ])
        let following = Task { await store.follow(connection) }
        await connection.start()
        await transport.nextOpening().accept(socket)
        await waitUntil { store.isOnline && store.hasLoaded }

        store.draft = "Go ahead"
        store.send()
        following.cancel()
        await following.value
        let call = await nextCall("conversation_send_turn", on: socket)
        socket.push(.frame(#"{"id":\#(call["id"] as? Int ?? 0),"status":200,"body":1}"#))
        await waitUntil { !store.isSending }

        let message = (call["args"] as? [String: Any])?["message"] as? [String: Any]
        #expect(message?["content"] as? String == "Go ahead")
        #expect(store.sendProblem == nil)
        #expect(store.draft.isEmpty)
        await connection.stop()
    }

    @Test func whatThePersonTypesWhileTheAnswerIsSendingIsKept() async {
        let connection = makeConnection()
        let store = MissionThreadStore(
            mission: MissionTesting.mission(), missions: MissionsStore(), work: CompanionWork(),
            newId: { "id-1" })
        let socket = ScriptedRelaySocket(sharedSpaceId: "s-1")
        let following = Task { await store.follow(connection) }
        await connection.start()
        await transport.nextOpening().accept(socket)
        await waitUntil { store.isOnline }

        store.draft = "First answer"
        store.send()
        let call = await nextCall("conversation_send_turn", on: socket)
        store.draft = "And a second thought"
        socket.push(.frame(#"{"id":\#(call["id"] as? Int ?? 0),"status":200,"body":1}"#))
        await waitUntil { !store.isSending }

        #expect(store.sendProblem == nil)
        #expect(store.draft == "And a second thought")
        #expect(store.transcript.entries.last?.id == "id-1")
        following.cancel()
        await connection.stop()
    }

    @Test func attachedFilesAreStoredBeforeTheAnswerNamesThem() async {
        let connection = makeConnection()
        let store = MissionThreadStore(
            mission: MissionTesting.mission(), missions: MissionsStore(), work: CompanionWork(),
            now: { Date(timeIntervalSince1970: 0) },
            newId: { "id-1" })
        let socket = ScriptedRelaySocket(
            sharedSpaceId: "s-1",
            answers: [
                "conversation_message_page":
                    #"{"conversationId":"thread-mission-1","hasMore":false,"arrivals":[],"messages":[]}"#,
                "chat_store_attachments":
                    #"["/d/attachments/thread-mission-1/6f1c2e9a-3b4d-4e5f-8a6b-7c8d9e0f1a2b.png"]"#,
                "conversation_send_turn": "1",
            ])
        let following = Task { await store.follow(connection) }
        await connection.start()
        await transport.nextOpening().accept(socket)
        await waitUntil { store.isOnline }

        store.attachments = [PickedAttachment(id: UUID(), name: "Photo 1.png", data: Data([1, 2]))]
        store.send()
        let stored = await nextCall("chat_store_attachments", on: socket)
        let sent = await nextCall("conversation_send_turn", on: socket)

        let attachment = ((stored["args"] as? [String: Any])?["attachments"] as? [[String: Any]])?
            .first
        #expect(attachment?["name"] as? String == "Photo 1.png")
        #expect(attachment?["base64"] as? String == "AQI=")
        #expect(attachment?["bytes"] == nil)
        let content =
            ((sent["args"] as? [String: Any])?["message"] as? [String: Any])?["content"] as? String
        #expect(
            content == """
                Attached to this message, sent 1970-01-01T00:00:00.000Z, 1 file:
                1/1 /d/attachments/thread-mission-1/6f1c2e9a-3b4d-4e5f-8a6b-7c8d9e0f1a2b.png
                """)
        following.cancel()
        await connection.stop()
    }

    @Test func aRefusedAnswerKeepsTheDraftAndSaysSo() async {
        let connection = makeConnection()
        let store = MissionThreadStore(
            mission: MissionTesting.mission(), missions: MissionsStore(), work: CompanionWork())
        let socket = ScriptedRelaySocket(sharedSpaceId: "s-1")
        let following = Task { await store.follow(connection) }
        await connection.start()
        await transport.nextOpening().accept(socket)
        await waitUntil { store.isOnline }

        store.draft = "Go"
        store.send()
        let call = await nextCall("conversation_send_turn", on: socket)
        socket.push(.frame(#"{"id":\#(call["id"] as? Int ?? 0),"status":502,"body":"host busy"}"#))
        await waitUntil { store.sendProblem != nil }

        #expect(store.sendProblem == .couldNotSend)
        #expect(store.draft == "Go")
        following.cancel()
        await connection.stop()
    }

    @Test func theThreadLoadsUntilItsPageArrivesThenAnEmptyThreadIsNoLongerLoading() async {
        let connection = makeConnection()
        let store = MissionThreadStore(
            mission: MissionTesting.mission(), missions: MissionsStore(), work: CompanionWork())
        let socket = ScriptedRelaySocket(sharedSpaceId: "s-1")
        let following = Task { await store.follow(connection) }
        await connection.start()
        await transport.nextOpening().accept(socket)
        let call = await nextCall("conversation_message_page", on: socket)

        #expect(store.isLoading)

        socket.push(
            .frame(
                #"{"id":\#(call["id"] as? Int ?? 0),"status":200,"body":{"conversationId":"thread-mission-1","hasMore":false,"arrivals":[],"messages":[]}}"#
            ))
        await waitUntil { store.hasLoaded }

        #expect(!store.isLoading)
        #expect(store.transcript.entries.isEmpty)
        following.cancel()
        await connection.stop()
    }

    @Test func leavingTheThreadWhileItLoadsIsNotAFailure() async {
        let connection = makeConnection()
        let store = MissionThreadStore(
            mission: MissionTesting.mission(), missions: MissionsStore(), work: CompanionWork())
        let socket = ScriptedRelaySocket(sharedSpaceId: "s-1")
        let following = Task { await store.follow(connection) }
        await connection.start()
        await transport.nextOpening().accept(socket)
        _ = await nextCall("conversation_message_page", on: socket)

        following.cancel()
        await connection.stop()
        await following.value

        #expect(!store.hasFailed)
        #expect(store.isLoading)
    }

    @Test func theHeaderAndTheOpeningDayAreKnownBeforeTheThreadLoads() {
        let atlas = Companion(id: "bot-1", name: "Atlas", role: "Planner")
        let mission = MissionTesting.mission(isAgentRunning: true)
        let store = MissionThreadStore(
            mission: mission, missions: MissionsStore(), work: CompanionWork())

        #expect(
            mission.heading(companion: atlas)
                == ThreadHeading(
                    avatar: .companion(atlas), working: ["bot-1"],
                    overline: "OPE-1 · Atlas · Planner", title: "Objective mission-1"))
        #expect(!store.transcript.openedDay.isEmpty)
        #expect(store.state == .loading)
        #expect(store.placeholder == "Answer this mission…")
    }

    @Test func tryingAgainAfterAFailureLoadsTheThread() async {
        let connection = makeConnection()
        let store = MissionThreadStore(
            mission: MissionTesting.mission(), missions: MissionsStore(), work: CompanionWork())
        let socket = ScriptedRelaySocket(sharedSpaceId: "s-1")
        let following = Task { await store.follow(connection) }
        await connection.start()
        await transport.nextOpening().accept(socket)
        let refused = await nextCall("conversation_message_page", on: socket)
        socket.push(
            .frame(#"{"id":\#(refused["id"] as? Int ?? 0),"status":500,"body":"host busy"}"#))
        await waitUntil { store.state == .failed }

        store.reload()
        #expect(store.state == .loading)
        let page = await nextCall("conversation_message_page", on: socket)
        socket.push(
            .frame(
                #"{"id":\#(page["id"] as? Int ?? 0),"status":200,"body":{"conversationId":"thread-mission-1","hasMore":false,"arrivals":[],"messages":[\#(MissionTesting.message(id: "m-1", seq: 1, content: "Go"))]}}"#
            ))
        await waitUntil { store.hasLoaded }

        #expect(store.state == .shown)
        #expect(MissionTesting.shown(store.transcript).map(\.id) == ["m-1"])
        following.cancel()
        await connection.stop()
    }

    @Test func theMissionThreadShowsItsCompanionAtWorkUntilTheTurnEnds() async {
        let connection = makeConnection()
        let work = CompanionWork()
        let updates = await connection.updates()
        let feeding = Task {
            for await update in updates {
                work.apply(update)
            }
        }
        let mission = MissionTesting.mission(id: "mission-1", botId: "bot-1")
        let store = MissionThreadStore(mission: mission, missions: MissionsStore(), work: work)
        let scoped =
            #"{"scope":{"conversationId":"thread-mission-1","botId":"bot-1","runtimeSessionId":"r1","epoch":1},"turn":{"turnId":"t1","conversationId":"thread-mission-1"},"event":"#
        let page =
            #"{"conversationId":"thread-mission-1","hasMore":false,"arrivals":[],"messages":[\#(MissionTesting.message(id: "q", seq: 1, role: "assistant", content: "Which one first?", botId: "bot-1"))]}"#
        let socket = ScriptedRelaySocket(
            sharedSpaceId: "s-1",
            answers: [
                "conversation_message_page": page,
                "agent_pending_questions":
                    "[" + scoped
                    + #"{"type":"questionRequested","request":{"id":"q1","questions":[]}}}]"#,
            ])
        let following = Task { await store.follow(connection) }
        await connection.start()
        await transport.nextOpening().accept(socket)
        await waitUntil { store.hasLoaded && store.working != nil }

        #expect(store.entries.last?.isYours == false)
        #expect(store.workers.map(\.companionId) == ["bot-1"])
        #expect(mission.heading(companion: nil, working: ["bot-1"]).working == ["bot-1"])

        socket.push(
            .frame(
                #"{"event":{"event":"agent://event","payload":"#
                    + scoped
                    + #"{"type":"turnEnded","ended":{"sessionId":null,"outcome":"cancelled"}}}}}"#
            ))
        await waitUntil { store.working == nil }
        following.cancel()
        feeding.cancel()
        await connection.stop()
    }
}
