#if DEBUG
    import Foundation

    enum MissionsFixture {
        static let threadConversationId = "thread-212"

        static let splitOnboarding = mission(
            id: "mission-212", ticket: "OPE-212", objective: "Split the onboarding flow",
            botId: "bot-atlas", state: "waiting_human", isAgentRunning: false,
            status: "Asked you which screen goes first", movedAt: at(hour: 8, minute: 32))

        static var answers: [String: String] {
            [
                "conversation_bots": companions,
                "mission_space_feed": feed,
                "conversation_message_page": thread,
                "conversation_send_turn": "1",
                "chat_store_attachments":
                    #"["/Users/sam/Library/Application Support/app.kiroshi/attachments/thread-212/6f1c2e9a-3b4d-4e5f-8a6b-7c8d9e0f1a2b.png"]"#,
            ]
        }

        static var emptyAnswers: [String: String] {
            ["conversation_bots": companions, "mission_space_feed": "[]"]
        }

        static func at(hour: Int, minute: Int) -> Int {
            let today = Calendar.current.date(
                bySettingHour: hour, minute: minute, second: 0, of: .now)
            return Int((today ?? .now).timeIntervalSince1970 * 1000)
        }

        private static let companions = #"""
            [{"id":"bot-atlas","name":"Atlas","avatarBlot":"blue"},{"id":"bot-pico","name":"Pico","avatarBlot":"orange"},{"id":"bot-juniper","name":"Juniper","avatarBlot":"green"},{"id":"bot-mira","name":"Mira","avatarBlot":"purple"}]
            """#

        private static var feed: String {
            let missions = [
                json(
                    id: "mission-212", ticket: "OPE-212", objective: "Split the onboarding flow",
                    botId: "bot-atlas", state: "waiting_human", isAgentRunning: false,
                    status: "Asked you which screen goes first", movedAt: at(hour: 8, minute: 32)),
                json(
                    id: "mission-215", ticket: "OPE-215",
                    objective: "Add dictation to the composer",
                    botId: "bot-pico", state: "working", isAgentRunning: true, status: nil,
                    movedAt: at(hour: 9, minute: 10)),
                json(
                    id: "mission-218", ticket: "OPE-218", objective: "Retry failed uploads",
                    botId: "bot-juniper", state: "working", isAgentRunning: false,
                    status: "Fixed the red check, CI is running", movedAt: at(hour: 9, minute: 2)),
                json(
                    id: "mission-209", ticket: "OPE-209", objective: "Settings sheet on iPhone",
                    botId: "bot-mira", state: "ready_to_merge", isAgentRunning: false, status: nil,
                    movedAt: at(hour: 7, minute: 45)),
            ]
            return "["
                + missions.map {
                    #"{"conversationId":"conversation-roadmap","conversationTitle":"Roadmap","mission":\#($0)}"#
                }
                .joined(separator: ",") + "]"
        }

        private static var thread: String {
            let summonedAt = at(hour: 8, minute: 30)
            let askedAt = at(hour: 8, minute: 31)
            let answeredAt = at(hour: 8, minute: 32)
            return #"""
                {"conversationId":"\#(threadConversationId)","hasMore":false,"arrivals":[],"messages":[\#(message(id: "message-1", seq: 1, role: "user", content: "Carry out this mission.", createdAt: summonedAt, botId: nil)),\#(message(id: "message-2", seq: 2, role: "user", content: "Split OPE-212 in two, one ticket per screen.\\nAttached to this message, sent 2026-10-11T08:31:00.000Z, 1 file:\\n1/1 /Users/sam/Library/Application Support/app.kiroshi/attachments/thread-212/onboarding-flow.png", createdAt: askedAt, botId: nil)),\#(message(id: "message-3", seq: 3, role: "assistant", content: "Done. OPE‑212 keeps the account step, OPE‑219 takes the space picker. Both are in Linear.\\n\\nWhich one goes first? The space picker needs the account step, so I’d start there.", createdAt: answeredAt, botId: "bot-atlas"))]}
                """#
        }

        private static func message(
            id: String, seq: Int, role: String, content: String, createdAt: Int, botId: String?
        ) -> String {
            let author = botId.map { #""\#($0)""# } ?? "null"
            return
                #"{"id":"\#(id)","conversationId":"\#(threadConversationId)","turnId":"turn-\#(seq)","seq":\#(seq),"role":"\#(role)","content":"\#(content)","completion":"complete","createdAt":\#(createdAt),"authorBotId":\#(author),"authorAccountId":null,"authorName":null,"repliedToMessageId":null,"runtimeSessionId":null}"#
        }

        private static func mission(
            id: String, ticket: String, objective: String, botId: String, state: String,
            isAgentRunning: Bool, status: String?, movedAt: Int
        ) -> Mission {
            let text = json(
                id: id, ticket: ticket, objective: objective, botId: botId, state: state,
                isAgentRunning: isAgentRunning, status: status, movedAt: movedAt)
            guard let mission = try? JSONDecoder().decode(Mission.self, from: Data(text.utf8))
            else {
                preconditionFailure("The mission fixture does not decode")
            }
            return mission
        }

        private static func json(
            id: String, ticket: String, objective: String, botId: String, state: String,
            isAgentRunning: Bool, status: String?, movedAt: Int
        ) -> String {
            let written = status.map { #"{"text":"\#($0)","writtenAt":\#(movedAt)}"# } ?? "null"
            let thread = id == "mission-212" ? threadConversationId : "thread-\(id)"
            return
                #"{"id":"\#(id)","originConversationId":"conversation-roadmap","botId":"\#(botId)","threadConversationId":"\#(thread)","objective":"\#(objective)","ticket":{"platform":"linear","externalId":"\#(ticket)","url":"https://linear.app/kiroshi/issue/\#(ticket)","title":"\#(objective)"},"tools":[],"state":"\#(state)","stateSeq":1,"isAgentRunning":\#(isAgentRunning),"openedAt":\#(movedAt - 600_000),"closedAt":null,"reportedAt":null,"reportedTurnId":null,"status":\#(written),"lastActivityAt":\#(movedAt),"lastActivity":null,"commitsAhead":null,"dirtyFiles":null,"pullRequestUrl":null,"branch":null,"workspacePath":null}"#
        }
    }
#endif
