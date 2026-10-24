#if DEBUG
    import Foundation

    enum MissionsFixture {
        static let threadConversationId = "thread-212"

        static let splitOnboarding = mission(
            id: "mission-212", ticket: "OPE-212", objective: "Split the onboarding flow",
            botId: "bot-atlas", state: "waiting_human", isAgentRunning: false,
            status: "Asked you which screen goes first.", movedAt: at(hour: 8, minute: 32))

        static var answers: [String: String] {
            pages(of: feed, size: pageSize).merging([
                "conversation_bots": companions,
                "conversation_message_page": thread,
                "conversation_send_turn": "1",
                "agent_pending_questions": "[]",
                "chat_store_attachments":
                    #"["/Users/sam/Library/Application Support/app.kiroshi/attachments/thread-212/6f1c2e9a-3b4d-4e5f-8a6b-7c8d9e0f1a2b.png"]"#,
            ]) { page, _ in page }
        }

        static var laterPagesAnswerAfter: [String: Duration] {
            isPaged ? ["mission_space_page \(pageSize)": ConversationsFixture.laterPageDelay] : [:]
        }

        static var pageSize: Int {
            isPaged ? 8 : MissionsRelay.listPageSize
        }

        static func pages(of missions: [String], size: Int) -> [String: String] {
            return Dictionary(
                uniqueKeysWithValues: stride(from: 0, to: max(missions.count, 1), by: size).map {
                    offset in
                    let page = missions.dropFirst(offset).prefix(size)
                    let next = offset + size < missions.count ? #""\#(offset + size)""# : "null"
                    let key = offset == 0 ? "mission_space_page" : "mission_space_page \(offset)"
                    return (
                        key,
                        #"{"missions":[\#(page.joined(separator: ","))],"nextCursor":\#(next)}"#
                    )
                })
        }

        static var answeringTurn: [String: [ScriptedRelaySocket.Inbound]] {
            [
                "conversation_send_turn": [
                    .frame(
                        agentEvent(#"{"type":"turnChanged","state":"running"}"#),
                        after: .milliseconds(300)),
                    .frame(
                        agentEvent(
                            #"{"type":"activity","activity":{"id":"tool-1","title":"Read · onboarding.md","kind":"tool","status":"running"}}"#
                        ), after: .seconds(1)),
                    .frame(
                        agentEvent(
                            #"{"type":"turnEnded","ended":{"sessionId":null,"outcome":"completed"}}"#
                        ),
                        after: .seconds(8)),
                    .frame(agentEvent(#"{"type":"turnChanged","state":"idle"}"#)),
                ]
            ]
        }

        static var atWork: [String: [ScriptedRelaySocket.Inbound]] {
            [
                "conversation_message_page": [
                    .frame(agentEvent(#"{"type":"turnChanged","state":"running"}"#))
                ]
            ]
        }

        private static func agentEvent(_ event: String) -> String {
            #"{"event":{"event":"agent://event","payload":{"scope":{"conversationId":"\#(threadConversationId)","botId":"bot-atlas","runtimeSessionId":"session-atlas","epoch":1},"turn":{"turnId":"turn-atlas","conversationId":"\#(threadConversationId)"},"event":\#(event)}}}"#
        }

        static var emptyAnswers: [String: String] {
            pages(of: [], size: pageSize).merging(["conversation_bots": companions]) {
                page, _ in page
            }
        }

        static func at(hour: Int, minute: Int) -> Int {
            let today = Calendar.current.date(
                bySettingHour: hour, minute: minute, second: 0, of: .now)
            return Int((today ?? .now).timeIntervalSince1970 * 1000)
        }

        private static let companions = #"""
            [{"id":"bot-atlas","name":"Atlas","title":"Planner","avatarBlot":"blue"},{"id":"bot-pico","name":"Pico","title":"Builder","avatarBlot":"orange"},{"id":"bot-juniper","name":"Juniper","title":"Writer","avatarBlot":"green"},{"id":"bot-mira","name":"Mira","title":"Designer","avatarBlot":"purple"}]
            """#

        static var feed: [String] {
            let missions = [
                json(
                    id: "mission-212", ticket: "OPE-212", objective: "Split the onboarding flow",
                    botId: "bot-atlas", state: "waiting_human", isAgentRunning: false,
                    status: "Asked you which screen goes first.", movedAt: at(hour: 8, minute: 32)),
                json(
                    id: "mission-215", ticket: "OPE-215",
                    objective: "Add dictation to the composer",
                    botId: "bot-pico", state: "working", isAgentRunning: true, status: nil,
                    movedAt: at(hour: 9, minute: 10)),
                json(
                    id: "mission-218", ticket: "OPE-218", objective: "Retry failed uploads",
                    botId: "bot-juniper", state: "working", isAgentRunning: false,
                    status: "Fixed the red check, CI is running again.",
                    movedAt: at(hour: 9, minute: 2)),
                json(
                    id: "mission-209", ticket: "OPE-209", objective: "Settings sheet on iPhone",
                    botId: "bot-mira", state: "ready_to_merge", isAgentRunning: false, status: nil,
                    movedAt: at(hour: 7, minute: 45)),
            ]
            return (missions + (isPaged ? reviews : [])).map {
                #"{"conversationId":"conversation-roadmap","conversationTitle":"Roadmap","mission":\#($0)}"#
            }
        }

        private static var isPaged: Bool {
            UserDefaults.standard.bool(forKey: "paged")
        }

        private static var reviews: [String] {
            (1...5).map { index in
                json(
                    id: "mission-\(300 + index)", ticket: "OPE-\(300 + index)",
                    objective: "Review batch \(index)", botId: "bot-mira",
                    state: "ready_to_merge", isAgentRunning: false, status: nil,
                    movedAt: at(hour: 7, minute: 0) - index * 3_600_000)
            }
        }

        private static var hasHistory: Bool {
            UserDefaults.standard.bool(forKey: "history")
        }

        private static var history: String {
            guard hasHistory else { return "" }
            let askedAt = at(hour: 8, minute: 20)
            let answeredAt = at(hour: 8, minute: 22)
            return #"""
                \#(message(id: "message-h1", seq: 1, role: "user", content: "Look at where people leave the onboarding and tell me what you’d cut.", createdAt: askedAt, botId: nil)),\#(message(id: "message-h2", seq: 2, role: "assistant", content: "The onboarding is one long screen today: account, space, first companion.\\n\\nAccount and first companion hold up fine.\\n\\nPeople drop on the space step. That’s the one to split out.", createdAt: answeredAt, botId: "bot-atlas")),
                """#
        }

        private static var thread: String {
            let summonedAt = at(hour: 8, minute: 30)
            let askedAt = at(hour: 8, minute: 31)
            let answeredAt = at(hour: 8, minute: 32)
            let seq = hasHistory ? 2 : 0
            return #"""
                {"conversationId":"\#(threadConversationId)","hasMore":false,"arrivals":[],"messages":[\#(history)\#(message(id: "message-1", seq: seq + 1, role: "user", content: "Carry out this mission.", createdAt: summonedAt, botId: nil)),\#(message(id: "message-2", seq: seq + 2, role: "user", content: "Split OPE-212 in two, one ticket per screen.", createdAt: askedAt, botId: nil)),\#(message(id: "message-3", seq: seq + 3, role: "assistant", content: "Done. OPE‑212 keeps the account step, OPE‑219 takes the space picker. Both are in Linear.\\n\\nWhich one goes first? The space picker needs the account step, so I’d start there.", createdAt: answeredAt, botId: "bot-atlas"))]}
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

        static func entry(in conversationId: String, _ mission: String) -> String {
            #"{"conversationId":"\#(conversationId)","mission":\#(mission)}"#
        }

        static func json(
            id: String, ticket: String, objective: String, botId: String, state: String,
            isAgentRunning: Bool, status: String?, movedAt: Int
        ) -> String {
            let written = status.map { #"{"text":"\#($0)","writtenAt":\#(movedAt)}"# } ?? "null"
            let thread = id == "mission-212" ? threadConversationId : "thread-\(id)"
            let liveness =
                switch state {
                case "waiting_human": "needs_you"
                case "working", "waiting_bot": isAgentRunning ? "working" : "idle"
                default: state
                }
            return
                #"{"id":"\#(id)","originConversationId":"conversation-roadmap","botId":"\#(botId)","threadConversationId":"\#(thread)","objective":"\#(objective)","ticket":{"platform":"linear","externalId":"\#(ticket)","url":"https://linear.app/kiroshi/issue/\#(ticket)","title":"\#(objective)"},"tools":[],"state":"\#(state)","stateSeq":1,"isAgentRunning":\#(isAgentRunning),"liveness":"\#(liveness)","openedAt":\#(movedAt - 600_000),"closedAt":null,"reportedAt":null,"reportedTurnId":null,"status":\#(written),"lastActivityAt":\#(movedAt),"lastActivity":null,"commitsAhead":null,"dirtyFiles":null,"pullRequestUrl":null,"branch":null,"workspacePath":null}"#
        }
    }
#endif
