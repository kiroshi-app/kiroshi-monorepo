import Foundation

@testable import Kiroshi

enum MissionTesting {
    struct Shown: Equatable {
        let id: String
        let isYours: Bool
        let bubbles: [String]
    }

    static func shown(_ transcript: MissionTranscript) -> [Shown] {
        transcript.entries.map { message in
            Shown(
                id: message.id, isYours: message.isYours,
                bubbles: message.bubbles.map { String($0.text.characters) })
        }
    }

    static func mission(
        id: String = "mission-1", state: String = "working", stateSeq: Int = 1,
        isAgentRunning: Bool = false, liveness: String? = nil, status: String? = nil,
        openedAt: Int = 1_000, lastActivityAt: Int? = nil, botId: String = "bot-1",
        presence: String = ""
    ) -> Mission {
        let text = missionJSON(
            id: id, state: state, stateSeq: stateSeq, isAgentRunning: isAgentRunning,
            liveness: liveness, status: status, openedAt: openedAt,
            lastActivityAt: lastActivityAt, botId: botId, presence: presence)
        return try! JSONDecoder().decode(Mission.self, from: Data(text.utf8))
    }

    static func missionJSON(
        id: String, state: String, stateSeq: Int = 1, isAgentRunning: Bool = false,
        liveness: String? = nil, status: String? = nil, openedAt: Int = 1_000,
        lastActivityAt: Int? = nil, botId: String = "bot-1", presence: String = ""
    ) -> String {
        let observed = (liveness.map { #""liveness":"\#($0)","# } ?? "") + presence
        let written = status.map { #"{"text":"\#($0)","writtenAt":1}"# } ?? "null"
        let activity = lastActivityAt.map(String.init) ?? "null"
        let text = #"""
            {"id":"\#(id)","originConversationId":"c-1","botId":"\#(botId)","threadConversationId":"thread-\#(id)","objective":"Objective \#(id)","ticket":{"platform":"linear","externalId":"OPE-1","url":"https://linear.app/x","title":"Ticket"},"tools":[],"state":"\#(state)","stateSeq":\#(stateSeq),"isAgentRunning":\#(isAgentRunning),\#(observed)"openedAt":\#(openedAt),"closedAt":null,"reportedAt":null,"reportedTurnId":null,"status":\#(written),"lastActivityAt":\#(activity),"lastActivity":null,"commitsAhead":null,"dirtyFiles":null,"pullRequestUrl":null,"branch":null,"workspacePath":null}
            """#
        return text
    }

    static func entry(_ mission: Mission) -> MissionInSpace {
        MissionInSpace(conversationId: "c-1", mission: mission)
    }

    static func event(_ name: String, payload: String) -> RelayEvent {
        RelayEvent(
            name: name, frame: Data(#"{"event":{"event":"\#(name)","payload":\#(payload)}}"#.utf8))
    }

    static func message(
        id: String, seq: Int, role: String = "user", content: String, createdAt: Int = 0,
        botId: String? = nil, conversationId: String = "thread-mission-1"
    ) -> String {
        let author = botId.map { #""\#($0)""# } ?? "null"
        return
            #"{"id":"\#(id)","conversationId":"\#(conversationId)","turnId":"t-\#(seq)","seq":\#(seq),"role":"\#(role)","content":"\#(content)","completion":"complete","createdAt":\#(createdAt),"authorBotId":\#(author),"authorAccountId":null,"authorName":null,"repliedToMessageId":null,"runtimeSessionId":null}"#
    }

    static func decoded(_ message: String) -> MissionThreadMessage {
        try! JSONDecoder().decode(MissionThreadMessage.self, from: Data(message.utf8))
    }
}
