import Foundation
import Testing

@testable import Kiroshi

struct ObservedStateTests {
    static let asked =
        #""pendingPrompt":{"promptId":"p1","kind":"question","text":"Which format should the release notes take?"}"#
    static let question = PendingPrompt(
        promptId: "p1", text: "Which format should the release notes take?")

    func decoded<Body: Decodable>(_ type: Body.Type, _ json: String) throws -> Body {
        try JSONDecoder().decode(type, from: Data(json.utf8))
    }

    func observed(_ fields: String) throws -> ObservedState {
        try decoded(ObservedState.self, "{\(fields)}")
    }

    @Test func readsThePendingQuestionAndTheWorkingCompanions() throws {
        let state = try observed(
            #""state":"needs_you",\#(Self.asked),"workingBotIds":["juniper","atlas"]"#)

        #expect(
            state
                == ObservedState(
                    state: .needsYou, pendingPrompt: Self.question,
                    workingBotIds: ["juniper", "atlas"]))
    }

    @Test(arguments: [
        #""state":"idle","pendingPrompt":null,"workingBotIds":[]"#,
        #""state":"idle""#,
        #""state":"idle","pendingPrompt":"broken","workingBotIds":"broken""#,
    ])
    func aNullMissingOrUnreadablePairReadsAsNoQuestionAndNobody(fields: String) throws {
        #expect(try observed(fields) == ObservedState())
    }

    @Test(arguments: ["permission", "elicitation"])
    func anyKindOfPromptKeepsItsText(kind: String) throws {
        let state = try observed(
            #""state":"needs_you","pendingPrompt":{"promptId":"p1","kind":"\#(kind)","text":"Allow Bash?"}"#
        )

        #expect(state.pendingPrompt == PendingPrompt(promptId: "p1", text: "Allow Bash?"))
    }

    @Test func aStateChangeCarriesTheQuestionAndAnOlderOneReadsWithoutIt() throws {
        let changed = try decoded(
            ConversationStateChanged.self,
            #"{"conversationId":"c1","spaceId":"s1","state":"needs_you",\#(Self.asked),"workingBotIds":[]}"#
        )
        let older = try decoded(
            ConversationStateChanged.self, #"{"conversationId":"c1","state":"working"}"#)

        #expect(changed.conversationId == "c1")
        #expect(changed.observed == ObservedState(state: .needsYou, pendingPrompt: Self.question))
        #expect(older.observed == ObservedState(state: .working))
    }

    @Test func aPageRowCarriesThePair() throws {
        let row = try decoded(
            ConversationInPage.self,
            #"{"id":"t","title":"Release crew","createdAt":1,"participants":[],"lastActivityAt":9,"state":"working","pendingPrompt":null,"workingBotIds":["atlas"]}"#
        )

        #expect(row.observed == ObservedState(state: .working, workingBotIds: ["atlas"]))
    }

    @Test func theMainConversationCarriesItsStateAndAnOlderMacsReadsIdle() throws {
        let main = try decoded(
            MainChat.self,
            #"{"id":"chat-juniper","createdAt":0,"updatedAt":0,"state":"needs_you",\#(Self.asked),"workingBotIds":[]}"#
        )
        let older = try decoded(
            MainChat.self, #"{"id":"chat-juniper","createdAt":0,"updatedAt":0}"#)

        #expect(main.id == "chat-juniper")
        #expect(main.observed == ObservedState(state: .needsYou, pendingPrompt: Self.question))
        #expect(older.id == "chat-juniper")
        #expect(older.observed == ObservedState())
    }

    @Test func aMissionAndItsChangeCarryThePairAndOlderOnesReadWithout() throws {
        let presence = #"\#(Self.asked),"workingBotIds":["bot-1"],"#
        let mission = try decoded(
            Mission.self,
            MissionTesting.missionJSON(
                id: "m-1", state: "waiting_human", liveness: "needs_you", presence: presence))
        let older = MissionTesting.mission(state: "waiting_human", liveness: "needs_you")
        let changed = try decoded(
            MissionChanged.self,
            #"{"missionId":"m-1","state":"waiting_human","stateSeq":2,"isAgentRunning":false,"liveness":"needs_you",\#(Self.asked),"workingBotIds":["bot-1"],"lastActivityAt":null}"#
        )
        let olderChange = try decoded(
            MissionChanged.self,
            #"{"missionId":"m-1","state":"working","stateSeq":2,"isAgentRunning":true,"lastActivityAt":null}"#
        )

        #expect(mission.pendingPrompt == Self.question)
        #expect(mission.workingBotIds == ["bot-1"])
        #expect(older.pendingPrompt == nil)
        #expect(older.workingBotIds.isEmpty)
        #expect(changed.pendingPrompt == Self.question)
        #expect(changed.workingBotIds == ["bot-1"])
        #expect(olderChange.pendingPrompt == nil)
        #expect(olderChange.workingBotIds.isEmpty)
    }
}
