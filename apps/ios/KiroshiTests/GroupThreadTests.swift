import Foundation
import Testing

@testable import Kiroshi

extension ThreadStoreTests {
    var atlas: Companion { Companion(id: "atlas", name: "Atlas") }

    var releaseCrew: GroupConversation {
        GroupConversation(
            id: "group-release", title: "Release crew", createdAt: 0,
            participants: [
                .init(botId: juniper.id, name: "Juniper", isLead: true),
                .init(botId: "atlas", name: "Atlas"),
                .init(botId: "otto", name: "Otto", leftAt: 5),
            ])
    }

    func makeGroupStore() -> ThreadStore {
        var ids = (1...).lazy.map { "id-\($0)" }.makeIterator()
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return ThreadStore(
            subject: .group(releaseCrew), work: work, now: { [sentAt] in sentAt },
            makeId: { ids.next()! },
            calendar: calendar)
    }

    func groupMessage(
        _ id: String, seq: Int, by author: Companion.ID?, _ content: String, minute: Int
    ) -> String {
        TestHost.message(
            id, in: "group-release", seq: seq, isYours: author == nil, content,
            at: 1_790_899_200_000 + minute * 60_000, by: author)
    }

    func pushGroupAgent(_ host: TestHost, by companionId: Companion.ID, _ event: String) {
        host.push(
            event: "agent://event",
            payload:
                #"{"scope":{"conversationId":"group-release","botId":"\#(companionId)","runtimeSessionId":"session-\#(companionId)","epoch":1},"event":\#(event),"turn":{"turnId":"turn-\#(companionId)","conversationId":"group-release"}}"#
        )
    }

    @Test func consecutiveMessagesOfOneCompanionShareOneAuthorLine() async {
        let host = TestHost(messages: [
            "group-release": [
                groupMessage("m1", seq: 1, by: nil, "Can you two ship 0.42?", minute: 0),
                groupMessage("m2", seq: 2, by: juniper.id, "Merged.", minute: 1),
                groupMessage("m3", seq: 3, by: juniper.id, "Tagging next.", minute: 2),
                groupMessage("m4", seq: 4, by: "atlas", "Splitting the ticket.", minute: 3),
                groupMessage("m5", seq: 5, by: "atlas", "Done.", minute: 9),
                groupMessage("m6", seq: 6, by: juniper.id, "Tagged.", minute: 10),
                groupMessage("m7", seq: 7, by: "otto", "I left.", minute: 11),
            ]
        ])
        let store = makeGroupStore()
        let (connection, following) = await follow(host, store)

        let shown = store.entries
        #expect(
            shown.map(\.author?.name) == [
                nil, "Juniper", "Juniper", "Atlas", "Atlas", "Juniper", "Otto",
            ])
        #expect(shown.map(\.opensRun) == [true, true, false, true, true, true, true])
        following.cancel()
        await connection.stop()
    }

    @Test func aSoloMessageWithoutAnAuthorStillReadsAndNamesNobody() async {
        let bare =
            #"{"id":"m1","conversationId":"chat-juniper","turnId":"t","seq":1,"role":"assistant","content":"Drafted.","completion":"complete","createdAt":1}"#
        let host = TestHost(messages: ["chat-juniper": [bare]])
        let store = makeStore()
        let (connection, following) = await follow(host, store)

        #expect(texts(store) == ["Drafted."])
        #expect(store.entries.map(\.author) == [nil])
        following.cancel()
        await connection.stop()
    }

    @Test func aStreamedReplyTakesItsAuthorFromTheScope() async throws {
        let host = TestHost()
        let store = makeGroupStore()
        let (connection, following) = await follow(host, store)

        pushGroupAgent(
            host, by: "atlas",
            #"{"type":"messageStarted","message":{"id":"r1","role":"assistant","text":"On it, <@juniper>.","timestamp":1791000000000}}"#
        )
        await waitUntil { store.entries.count == 1 }

        let reply = try #require(store.entries.first)
        #expect(reply.author?.name == "Atlas")
        #expect(String(reply.rendered.characters) == "On it, @Juniper.")
        following.cancel()
        await connection.stop()
    }

    @Test func aMentionIsSentAsATokenAndSummonsOnlyTheMentioned() async throws {
        let host = TestHost { call in
            call.command == "conversation_send_turn" ? TestHost.ok(call, "1") : nil
        }
        let store = makeGroupStore()
        let (connection, following) = await follow(host, store)

        store.draft = "Ship it @at"
        #expect(store.mentionCandidates.map(\.name) == ["Atlas"])
        store.mention(atlas)
        #expect(store.draft == "Ship it @Atlas ")
        #expect(store.mentionCandidates.isEmpty)
        store.draft += "and @Otto"
        await store.send()?.value
        let call = try #require(await host.nextCall("conversation_send_turn"))

        let args = try call.args(as: SendTurnArgs.self)
        #expect(args.message.content == "Ship it <@atlas> and @Otto")
        #expect(args.summoned == ["atlas"])
        #expect(texts(store) == ["you: Ship it <@atlas> and @Otto"])
        #expect(String(store.entries[0].rendered.characters) == "Ship it @Atlas and @Otto")
        #expect(!store.isWorking)
        following.cancel()
        await connection.stop()
    }

    @Test func aMessageWithoutAMentionLeavesTheChoiceToTheHostWhichSummonsTheLead() async throws {
        let host = TestHost { call in
            call.command == "conversation_send_turn" ? TestHost.ok(call, "1") : nil
        }
        let store = makeGroupStore()
        let (connection, following) = await follow(host, store)

        store.draft = "Is the tag out?"
        await store.send()?.value
        let call = try #require(await host.nextCall("conversation_send_turn"))

        #expect(try call.args(as: SendTurnArgs.self).summoned.isEmpty)
        #expect(try call.args(as: SendTurnArgs.self).message.content == "Is the tag out?")
        #expect(!store.isWorking)
        following.cancel()
        await connection.stop()
    }

    @Test func aSendRefusedKeepsWhatYouWroteNotTheTokens() async {
        let host = TestHost { call in
            call.command == "conversation_send_turn"
                ? TestHost.refused(call, status: 500, TestHost.unavailable) : nil
        }
        let store = makeGroupStore()
        let (connection, following) = await follow(host, store)

        store.draft = "@Atlas ship it"
        await store.send()?.value

        #expect(store.draft == "@Atlas ship it")
        #expect(store.sendFailure == .hostFault)
        following.cancel()
        await connection.stop()
    }

    @Test func theWorkingLineNamesEveryCompanionAtWorkUntilEachTurnEnds() async throws {
        let host = TestHost { call in
            call.command == "agent_cancel_turn" ? TestHost.ok(call, "null") : nil
        }
        let store = makeGroupStore()
        let (connection, following) = await follow(host, store)

        pushGroupAgent(host, by: juniper.id, #"{"type":"turnChanged","state":"running"}"#)
        pushGroupAgent(host, by: "atlas", #"{"type":"turnChanged","state":"running"}"#)
        await waitUntil { store.workingCompanions.count == 2 }
        #expect(store.isWorking)
        #expect(store.workingName == "Juniper and Atlas")

        await store.stop()?.value
        let first = try #require(await host.nextCall("agent_cancel_turn"))
        let second = try #require(await host.nextCall("agent_cancel_turn"))
        #expect(
            try [first, second].map { try $0.args(as: CancelArgs.self).scope.botId } == [
                juniper.id, "atlas",
            ])

        pushGroupAgent(
            host, by: juniper.id,
            #"{"type":"turnEnded","ended":{"sessionId":null,"outcome":"success"}}"#)
        await waitUntil { store.workingCompanions.count == 1 }
        #expect(store.isWorking)
        #expect(store.workingName == "Atlas")

        pushGroupAgent(host, by: "atlas", #"{"type":"turnChanged","state":"idle"}"#)
        pushGroupAgent(host, by: juniper.id, #"{"type":"turnChanged","state":"idle"}"#)
        pushGroupAgent(
            host, by: "atlas",
            #"{"type":"turnEnded","ended":{"sessionId":null,"outcome":"completed"}}"#
        )
        await waitUntil { !store.isWorking }
        #expect(store.runningScope == nil)
        following.cancel()
        await connection.stop()
    }

    @Test func aSoloThreadNeitherOffersMentionsNorRewritesAnAtSign() async throws {
        let host = TestHost { call in
            call.command == "conversation_send_turn" ? TestHost.ok(call, "1") : nil
        }
        let store = makeStore()
        let (connection, following) = await follow(host, store)

        store.draft = "@Juniper"
        #expect(store.mentionCandidates.isEmpty)
        await store.send()?.value
        let call = try #require(await host.nextCall("conversation_send_turn"))

        #expect(try call.args(as: SendTurnArgs.self).message.content == "@Juniper")
        #expect(try call.args(as: SendTurnArgs.self).summoned == [juniper.id])
        following.cancel()
        await connection.stop()
    }

    @Test func aGroupReadsItsLeadAndKeepsTheAuthorsWhoLeft() throws {
        let json =
            #"{"id":"g","title":"","createdAt":0,"participants":[{"botId":"a","name":"Ada","role":"participant","leftAt":null,"isDeleted":false},{"botId":"b","name":"Bo","role":"lead","leftAt":null,"isDeleted":false},{"botId":"c","name":"Cy","leftAt":3,"isDeleted":false}]}"#
        let group = try JSONDecoder().decode(GroupConversation.self, from: Data(json.utf8))

        #expect(group.leadId == "b")
        #expect(group.members.map(\.id) == ["a", "b"])
        #expect(group.authors.map(\.id) == ["a", "b", "c"])
    }

    @Test func aGroupHeaderShowsTheGroupWhereAConversationShowsItsCompanion() {
        let store = makeGroupStore()

        #expect(
            store.heading
                == ThreadHeading(avatar: .icon(.messageSquare, color: nil), title: "Release crew"))
        #expect(store.heading.companion == nil)
        #expect(store.placeholder == "Message Release crew")
    }
}
