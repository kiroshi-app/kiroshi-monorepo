import Foundation
import Testing

@testable import Kiroshi

struct ConversationMappingTests {
    func event(_ name: String, _ payload: String) -> ConversationEvent? {
        let frame = #"{"event":{"event":"\#(name)","payload":\#(payload)}}"#
        return ConversationEvent(RelayEvent(name: name, frame: Data(frame.utf8)))
    }

    @Test func readsAStoredMessage() throws {
        let stored = event(
            "conversation://message-stored",
            FixtureHost.messageJSON(
                id: "m1", conversationId: "c1", seq: 3, role: "user", content: "Hi", createdAt: 5))

        guard case .messageStored(let message) = stored else {
            Issue.record("Expected a stored message")
            return
        }
        #expect(message.id == "m1")
        #expect(message.seq == 3)
        #expect(message.role == .user)
        #expect(message.authorAccountId == nil)
        #expect(message.authorName == nil)
        #expect(MessagePreview(message, authorship: .unknownAccount).line == "You: Hi")
    }

    @Test func readsWhoWroteTheLastWordAndAnOlderHostsWordWithoutIt() throws {
        let decode = { (json: String) in
            try JSONDecoder().decode(LastWord.self, from: Data(json.utf8))
        }

        #expect(
            try decode(
                #"{"text":"Hi","at":1,"authorBotId":null,"authorAccountId":"acc-ada","authorName":"Ada"}"#
            )
                == LastWord(
                    text: "Hi", at: 1, authorBotId: nil, authorAccountId: "acc-ada",
                    authorName: "Ada"))
        #expect(
            try decode(
                #"{"text":"Hi","at":1,"authorBotId":"atlas","authorAccountId":null,"authorName":null}"#
            )
                == LastWord(
                    text: "Hi", at: 1, authorBotId: "atlas", authorAccountId: nil, authorName: nil
                ))
        #expect(
            try decode(#"{"text":"Hi","at":1,"authorBotId":null}"#)
                == LastWord(
                    text: "Hi", at: 1, authorBotId: nil, authorAccountId: nil, authorName: nil))
    }

    @Test func readsACompanionsRoleFromItsTitle() throws {
        let decode = { (json: String) in
            try JSONDecoder().decode(Companion.self, from: Data(json.utf8))
        }

        #expect(try decode(#"{"id":"j","name":"Juniper","title":"Writer"}"#).role == "Writer")
        #expect(try decode(#"{"id":"o","name":"Otto","title":"  "}"#).role == nil)
        #expect(try decode(#"{"id":"p","name":"Pico"}"#).role == nil)
    }

    @Test func readsAGroupNamedAfterItsPresentMembersWhenUntitled() throws {
        let json = #"""
            {"id":"g1","spaceId":"s1","sectionId":null,"pinPosition":2,"title":"  ","instructions":"","createdAt":7,"updatedAt":7,"participants":[
             {"botId":"a","role":"lead","joinedAt":1,"leftAt":null,"name":"Atlas","avatarBlot":"blue","avatarImagePath":null,"isDeleted":false},
             {"botId":"b","role":"assistant","joinedAt":2,"leftAt":5,"name":"Pico","avatarBlot":null,"avatarImagePath":null,"isDeleted":false},
             {"botId":"c","role":"assistant","joinedAt":3,"leftAt":null,"name":"Mira","avatarBlot":"teal","avatarImagePath":"/p/mira.png","isDeleted":false},
             {"botId":"d","role":"assistant","joinedAt":4,"leftAt":null,"name":"Otto","avatarBlot":null,"avatarImagePath":null,"isDeleted":true}]}
            """#
        let group = try JSONDecoder().decode(GroupConversation.self, from: Data(json.utf8))

        #expect(group.name == "Atlas, Mira")
        #expect(group.members.map(\.id) == ["a", "c"])
        #expect(group.members.map(\.tint) == [.blue, nil])
        #expect(group.members.map(\.pictureFile) == [nil, "mira.png"])
        #expect(group.createdAt == 7)
        #expect(
            GroupConversation(id: "g2", title: "", createdAt: 0, participants: []).name
                == "Untitled conversation")
    }

    @Test func readsTheCompanionAndPinOfAPageRow() throws {
        let decode = { (row: String) in
            try JSONDecoder().decode(ConversationInPage.self, from: Data(row.utf8))
        }
        let juniper = Companion(id: "juniper", name: "Juniper")
        let solo = FixtureHost.Group(
            id: "chat-juniper", title: "Chat", members: [juniper], createdAt: 1, pinPosition: 2)
        let topic = FixtureHost.Group(
            id: "topic", title: "Topic", members: [juniper], createdAt: 1)

        let soloRow = try decode(
            solo.pageJSON(lastActivityAt: 9, lastWord: nil, soloBotId: "juniper"))
        let topicRow = try decode(topic.pageJSON(lastActivityAt: 9, lastWord: nil, soloBotId: nil))
        let olderRow = try decode(
            #"{"id":"t","title":"Old","createdAt":1,"participants":[],"lastActivityAt":9}"#)

        #expect(soloRow.soloBotId == "juniper")
        #expect(soloRow.pinPosition == 2)
        #expect(topicRow.soloBotId == nil)
        #expect(topicRow.pinPosition == nil)
        #expect(olderRow.soloBotId == nil)
        #expect(olderRow.pinPosition == nil)
    }

    @Test(arguments: [
        ("idle", ConversationState.idle),
        ("working", .working),
        ("needs_you", .needsYou),
        ("dreaming", .idle),
    ])
    func readsTheStateTheHostComputedForAPageRow(word: String, state: ConversationState)
        throws
    {
        let group = FixtureHost.Group(
            id: "topic", title: "Topic", members: [Companion(id: "a", name: "Atlas")],
            createdAt: 1)
        let row = try JSONDecoder().decode(
            ConversationInPage.self,
            from: Data(
                group.pageJSON(lastActivityAt: 9, lastWord: nil, soloBotId: nil, state: word)
                    .utf8))
        let older = try JSONDecoder().decode(
            ConversationInPage.self,
            from: Data(
                #"{"id":"t","title":"Old","createdAt":1,"participants":[],"lastActivityAt":9}"#
                    .utf8))

        #expect(row.state == state)
        #expect(older.state == .idle)
    }

    @Test(arguments: [
        ("idle", ConversationState.idle, false, false),
        ("working", .working, true, false),
        ("needs_you", .needsYou, false, true),
        ("dreaming", .idle, false, false),
    ])
    func readsAStateChange(word: String, state: ConversationState, isWorking: Bool, needsYou: Bool)
    {
        let changed = event(
            "conversation://state-changed",
            #"{"conversationId":"c1","spaceId":"s1","state":"\#(word)"}"#)

        guard case .stateChanged(let change) = changed else {
            Issue.record("Expected a state change")
            return
        }
        var summary = ConversationSummary(subject: .companion(Companion(id: "a", name: "Atlas")))
        summary.state = change.state
        #expect(change.conversationId == "c1")
        #expect(change.state == state)
        #expect(summary.isWorking == isWorking)
        #expect(summary.needsYou == needsYou)
    }

    @Test func readsTheGroupEventsOfTheSpace() {
        let group = FixtureHost.Group(
            id: "g1", title: "Release crew", members: [Companion(id: "a", name: "Atlas")],
            createdAt: 1)
        let stored = #"{"spaceId":"s1","conversation":\#(group.json)}"#
        let decoded = GroupConversation(
            id: "g1", title: "Release crew", createdAt: 1,
            participants: [.init(botId: "a", name: "Atlas", isLead: true)])

        #expect(event("conversation://created", stored) == .groupCreated(decoded))
        #expect(event("conversation://updated", stored) == .groupUpdated(decoded))
        #expect(
            event("conversation://deleted", #"{"spaceId":"s1","conversationId":"g1"}"#)
                == .groupDeleted(id: "g1"))
    }

    @Test func readsAScopedAgentEvent() {
        let agent = event(
            "agent://event",
            #"{"scope":{"conversationId":"c1","botId":"b1","runtimeSessionId":"r1","epoch":2},"event":{"type":"messageDelta","id":"m1","seq":4,"text":"lo"},"turn":null}"#
        )

        #expect(
            agent
                == .agent(
                    AgentEvent(
                        scope: AgentEvent.Scope(
                            conversationId: "c1", botId: "b1", runtimeSessionId: "r1", epoch: 2),
                        change: .messageDelta(id: "m1", text: "lo"))))
    }

    @Test func anAgentEventItDoesNotDrawIsKeptAsOther() {
        let agent = event(
            "agent://event",
            #"{"scope":null,"event":{"type":"botEvolved","bundle":{},"commitId":"c","title":"t"},"turn":null}"#
        )

        #expect(agent == .agent(AgentEvent(scope: nil, change: .other)))
    }

    @Test func companionChangesAskForTheListAgain() {
        #expect(
            event("companion://created", #"{"id":"b1","name":"Juniper"}"#) == .companionsChanged)
        #expect(event("companion://deleted", #"{"id":"b1","spaceId":"s1"}"#) == .companionsChanged)
    }

    @Test func otherEventsAreNotTheConversationsConcern() {
        #expect(event("mission://changed", "{}") == nil)
    }

    @Test func listTimesFollowTheDistanceFromToday() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let now = Date(timeIntervalSince1970: 1_791_633_600)
        let time = ConversationTime(
            now: now, calendar: calendar, locale: Locale(identifier: "en_GB"))

        #expect(time.listLabel(for: now.addingTimeInterval(-3_600)) == "11:00")
        #expect(time.listLabel(for: now.addingTimeInterval(-86_400)) == "Yesterday")
        #expect(time.listLabel(for: now.addingTimeInterval(-4 * 86_400)) == "Tuesday")
        #expect(time.dayLabel(for: now.addingTimeInterval(-3_600)) == "Today")
        #expect(time.timeLabel(for: now.addingTimeInterval(-3_600)) == "11:00")
    }
}
