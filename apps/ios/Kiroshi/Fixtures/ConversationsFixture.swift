#if DEBUG
    import Foundation
    import UIKit

    @MainActor
    enum ConversationsFixture {
        static var opening: Companion.ID?

        static var draft: String {
            UserDefaults.standard.string(forKey: "draft") ?? ""
        }

        static let juniper = Companion(id: "juniper-6", name: "Juniper", tint: .green)
        static let companions = [
            juniper,
            Companion(id: "atlas-3", name: "Atlas", tint: .blue),
            Companion(id: "pico-6", name: "Pico", tint: .orange),
            Companion(id: "shoto-1", name: "Shoto", tint: .pink, picturePath: "/avatars/shoto.png"),
            Companion(id: "mira-9", name: "Mira", tint: .purple),
            Companion(id: "otto-5", name: "Otto"),
        ]

        static let listMessages: [Companion.ID: [FixtureHost.Message]] = [
            "juniper-6": [
                .init(
                    id: "m-juniper", isYours: false,
                    content: "The release notes are drafted, they’re waiting for your read.",
                    daysAgo: 0, hour: 9, minute: 12)
            ],
            "atlas-3": [
                .init(
                    id: "m-atlas", isYours: true,
                    content: "Can you split the onboarding ticket in two?", daysAgo: 0, hour: 8,
                    minute: 47)
            ],
            "pico-6": [
                .init(
                    id: "m-pico", isYours: false,
                    content: "All checks passed, the pull request is ready to merge.", daysAgo: 1,
                    hour: 18, minute: 20)
            ],
            "shoto-1": [
                .init(
                    id: "m-shoto", isYours: false,
                    content: "The build is green on every simulator.", daysAgo: 2, hour: 16,
                    minute: 40)
            ],
            "mira-9": [
                .init(
                    id: "m-mira", isYours: false,
                    content: "Here are three directions for the settings sheet.", daysAgo: 4,
                    hour: 10, minute: 5)
            ],
            "otto-5": [
                .init(
                    id: "m-otto", isYours: false,
                    content: "Morning digest: two new issues, nothing urgent.", daysAgo: 9,
                    hour: 8, minute: 0)
            ],
        ]

        static let releaseCrew = FixtureHost.Group(
            id: "group-release", title: "Release crew", members: [juniper, companions[1]],
            createdAt: 0)
        static let designReview = FixtureHost.Group(
            id: "group-design", title: "Design review",
            members: [companions[4], companions[2], companions[3], companions[5], companions[1]],
            createdAt: 0)

        static let groupMessages: [String: [FixtureHost.Message]] = [
            releaseCrew.id: [
                .init(
                    id: "m-release", isYours: false,
                    content: "The changelog is merged, I’m tagging 0.42 next.", daysAgo: 0,
                    hour: 9, minute: 30, author: juniper.id)
            ],
            designReview.id: [
                .init(
                    id: "m-design", isYours: true,
                    content: "Let’s keep the grouped inset list for settings.", daysAgo: 3,
                    hour: 14, minute: 15)
            ],
        ]

        static let releaseNotesAsk = FixtureHost.Message(
            id: "m-ask", isYours: true, content: "Can you draft the release notes for 0.42?",
            daysAgo: 0, hour: 9, minute: 4)

        static func script(_ fixture: SignInFixture) -> FixtureHost.Script {
            var script = FixtureHost.Script(
                companions: companions, groups: [releaseCrew, designReview],
                messages: listMessages.merging(groupMessages) { listed, _ in listed })
            switch fixture {
            case .conversationsLive:
                script.playsGroupChanges = true
            case .thread:
                script.messages[juniper.id] = [
                    releaseNotesAsk,
                    .init(
                        id: "m-drafted", isYours: false,
                        content:
                            "Drafted. Three sections: new, fixed, under the hood. Applications get the top spot, it’s what people notice first.",
                        daysAgo: 0, hour: 9, minute: 12),
                    .init(
                        id: "m-waiting", isYours: false, content: "They’re waiting for your read.",
                        daysAgo: 0, hour: 9, minute: 12),
                ]
            case .noCompanion:
                script.companions = []
                script.groups = []
            case .loadingCompanions:
                script.answersCompanions = false
            case .emptyThread:
                script.messages[juniper.id] = []
            case .conversationsHostOffline:
                script.hostLeavesAfter = .seconds(2)
            case .workingList:
                script.workingCompanion = juniper.id
            case .conversationsFailed:
                script.refusesCompanions = true
            case .threadFailed:
                script.refusesThread = true
            case .workingThread:
                script.messages[juniper.id] = [releaseNotesAsk]
                script.workingCompanion = juniper.id
                script.workingActivities = (1...6).map { "Read · notes/source-\($0).md" }
            default:
                break
            }
            return script
        }

        static func opening(_ fixture: SignInFixture) -> Companion.ID? {
            switch fixture {
            case .thread, .emptyThread, .workingThread, .threadFailed: juniper.id
            default: nil
            }
        }

        static func relay(_ script: FixtureHost.Script) -> RelayEnvironment {
            RelayEnvironment(
                transport: FixtureHostTransport(script: script), clock: ContinuousRelayClock())
        }
    }

    struct FixtureHost {
        struct Message: Sendable {
            let id: String
            let isYours: Bool
            let content: String
            let daysAgo: Int
            let hour: Int
            let minute: Int
            var author: Companion.ID?

            func json(in conversationId: String, seq: Int) -> String {
                let calendar = Calendar.current
                let day = calendar.date(
                    byAdding: .day, value: -daysAgo, to: calendar.startOfDay(for: .now))!
                let at = calendar.date(bySettingHour: hour, minute: minute, second: 0, of: day)!
                return FixtureHost.messageJSON(
                    id: id, conversationId: conversationId, seq: seq,
                    role: isYours ? "user" : "assistant", content: content,
                    createdAt: at.milliseconds, authorBotId: author)
            }
        }

        struct Group: Sendable {
            let id: String
            let title: String
            let members: [Companion]
            let createdAt: Int

            func renamed(_ title: String) -> Group {
                Group(id: id, title: title, members: members, createdAt: createdAt)
            }

            var json: String {
                let participants = members.enumerated().map { index, companion in
                    let tint = companion.tint.map { #""\#($0.rawValue)""# } ?? "null"
                    let path = companion.picturePath.map { #""\#($0)""# } ?? "null"
                    let role = index == 0 ? "lead" : "assistant"
                    return
                        #"{"botId":"\#(companion.id)","role":"\#(role)","joinedAt":\#(index),"leftAt":null,"name":"\#(companion.name)","avatarBlot":\#(tint),"avatarImagePath":\#(path),"isDeleted":false}"#
                }
                return
                    #"{"id":"\#(id)","spaceId":"\#(FixtureHost.spaceId)","sectionId":null,"pinPosition":null,"title":"\#(title)","instructions":"","createdAt":\#(createdAt),"updatedAt":\#(createdAt),"participants":[\#(participants.joined(separator: ","))]}"#
            }
        }

        struct Script: Sendable {
            var answersCompanions = true
            var refusesCompanions = false
            var refusesThread = false
            var companions: [Companion] = []
            var groups: [Group] = []
            var playsGroupChanges = false
            var messages: [Companion.ID: [Message]] = [:]
            var workingCompanion: Companion.ID?
            var workingActivities: [String] = []
            var hostLeavesAfter: Duration?
        }

        static let spaceId = "space-studio"

        static let picture: String = {
            let side = CGSize(width: 192, height: 192)
            let png = UIGraphicsImageRenderer(size: side).pngData { context in
                let colours = [UIColor.kiroshi(.primary), .kiroshi(.ring)].map(\.cgColor)
                if let gradient = CGGradient(
                    colorsSpace: nil, colors: colours as CFArray, locations: nil)
                {
                    context.cgContext.drawLinearGradient(
                        gradient, start: .zero, end: CGPoint(x: side.width, y: side.height),
                        options: [])
                }
                let figure = UIImage(systemName: "person.fill")?.withTintColor(
                    .kiroshi(.primaryForeground))
                figure?.draw(in: CGRect(x: 48, y: 52, width: 96, height: 92))
            }
            return #"{"contentType":"image/png","base64":"\#(png.base64EncodedString())"}"#
        }()

        static func botJSON(_ companion: Companion) -> String {
            let tint = companion.tint.map { #""\#($0.rawValue)""# } ?? "null"
            let path = companion.picturePath.map { #""\#($0)""# } ?? "null"
            return
                #"{"id":"\#(companion.id)","name":"\#(companion.name)","avatarBlot":\#(tint),"avatarImagePath":\#(path)}"#
        }

        static func chat(of companionId: Companion.ID) -> String {
            "chat-\(companionId)"
        }

        static func scope(_ conversationId: String) -> String {
            let companionId = conversationId.replacingOccurrences(of: "chat-", with: "")
            return
                #"{"conversationId":"\#(conversationId)","botId":"\#(companionId)","runtimeSessionId":"session-1","epoch":1}"#
        }

        static func agentEvent(_ conversationId: String, _ event: String) -> String {
            #"{"event":{"event":"agent://event","payload":{"scope":\#(scope(conversationId)),"event":\#(event),"turn":null}}}"#
        }

        static func activity(_ id: String, _ title: String, _ status: String) -> String {
            #"{"type":"activity","activity":{"id":"\#(id)","title":"\#(title)","kind":"tool","status":"\#(status)"}}"#
        }

        static func chatMessage(_ id: String, _ text: String, _ type: String) -> String {
            #"{"type":"\#(type)","message":{"id":"\#(id)","role":"assistant","text":"\#(text)","completion":"streaming","timestamp":\#(Date.now.milliseconds)}}"#
        }

        static func groupEvent(_ name: String, _ group: Group) -> String {
            #"{"event":{"event":"\#(name)","payload":{"spaceId":"\#(spaceId)","conversation":\#(group.json)}}}"#
        }

        static func groupDeleted(_ group: Group) -> String {
            #"{"event":{"event":"conversation://deleted","payload":{"spaceId":"\#(spaceId)","conversationId":"\#(group.id)"}}}"#
        }

        static func messageJSON(
            id: String, conversationId: String, seq: Int, role: String, content: String,
            createdAt: Int, authorBotId: String? = nil
        ) -> String {
            let author = authorBotId.map { #""\#($0)""# } ?? "null"
            return
                #"{"id":"\#(id)","conversationId":"\#(conversationId)","turnId":"turn-\#(id)","seq":\#(seq),"role":"\#(role)","content":"\#(content)","completion":"complete","createdAt":\#(createdAt),"authorBotId":\#(author),"authorAccountId":null,"authorName":null,"repliedToMessageId":null,"runtimeSessionId":null}"#
        }
    }

    actor FixtureHostTransport: RelayTransport {
        private let script: FixtureHost.Script
        private var opened = 0

        init(script: FixtureHost.Script) {
            self.script = script
        }

        func open(_ request: URLRequest) async throws -> any RelaySocket {
            if script.hostLeavesAfter != nil, opened > 0 {
                throw RelayClosure(code: RelayClosure.hostOffline)
            }
            opened += 1
            return FixtureHostSocket(script: script)
        }
    }

    actor FixturePageCount {
        private var count = 0

        func next() -> Int {
            count += 1
            return count
        }
    }

    final class FixtureHostSocket: RelaySocket {
        enum Inbound: Sendable {
            case frame(String, after: Duration = .zero)
            case close(Int, after: Duration = .zero)
        }

        private let script: FixtureHost.Script
        private let pages = FixturePageCount()
        private let inbound: AsyncStream<Inbound>
        private let inboundContinuation: AsyncStream<Inbound>.Continuation

        init(script: FixtureHost.Script) {
            self.script = script
            (inbound, inboundContinuation) = AsyncStream.makeStream()
        }

        func push(_ message: Inbound) {
            inboundContinuation.yield(message)
        }

        func send(_ text: String) async throws {
            guard
                let call = try? JSONSerialization.jsonObject(with: Data(text.utf8))
                    as? [String: Any],
                let id = call["id"] as? Int, let command = call["command"] as? String
            else { return }
            let args = call["args"] as? [String: Any] ?? [:]
            answer(id, command, args)
            guard command == "conversation_message_page", let leaving = script.hostLeavesAfter,
                await pages.next() == script.companions.count + script.groups.count
            else { return }
            push(.close(RelayClosure.hostOffline, after: leaving))
        }

        func receive() async throws -> String {
            var iterator = inbound.makeAsyncIterator()
            switch await iterator.next() {
            case .frame(let text, let delay):
                try await ContinuousClock().sleep(for: delay)
                return text
            case .close(let code, let delay):
                try await ContinuousClock().sleep(for: delay)
                throw RelayClosure(code: code)
            case nil:
                throw CancellationError()
            }
        }

        func ping() async throws {}

        func close() {
            push(.close(1000))
        }

        private func reply(_ id: Int, _ body: String) {
            push(.frame(#"{"id":\#(id),"status":200,"body":\#(body)}"#))
        }

        private func refuse(_ id: Int) {
            push(
                .frame(
                    #"{"id":\#(id),"status":500,"body":{"kind":"unavailable","failure":{"kind":"locked"}}}"#
                ))
        }

        private func answer(_ id: Int, _ command: String, _ args: [String: Any]) {
            switch command {
            case "relay_shared_space":
                reply(id, #"{"spaceId":"\#(FixtureHost.spaceId)"}"#)
            case "conversation_bots" where script.refusesCompanions:
                refuse(id)
            case "conversation_message_page"
            where script.refusesThread && args["limit"] as? Int != 1:
                refuse(id)
            case "conversation_bots":
                guard script.answersCompanions else { return }
                let bots = script.companions.map(FixtureHost.botJSON)
                reply(id, "[\(bots.joined(separator: ","))]")
                if let working = script.workingCompanion {
                    push(
                        .frame(
                            FixtureHost.agentEvent(
                                FixtureHost.chat(of: working),
                                #"{"type":"turnChanged","state":"running"}"#)))
                }
            case "conversation_list":
                reply(id, "[\(script.groups.map(\.json).joined(separator: ","))]")
                if script.playsGroupChanges {
                    playGroupChanges()
                }
            case "conversation_main_chat":
                let companionId = args["botId"] as? String ?? ""
                reply(
                    id,
                    #"{"id":"\#(FixtureHost.chat(of: companionId))","createdAt":0,"updatedAt":0}"#)
            case "conversation_message_page":
                let conversationId = args["conversationId"] as? String ?? ""
                let limit = args["limit"] as? Int ?? 50
                answerPage(id, conversationId, limit)
            case "conversation_send_turn":
                guard let message = args["message"] as? [String: Any] else { return }
                reply(id, "1")
                playTurn(after: message)
            case "agent_cancel_turn":
                reply(id, "null")
            case "relay_avatar" where args["file"] as? String == "shoto.png":
                reply(id, FixtureHost.picture)
            default:
                push(
                    .frame(#"{"id":\#(id),"status":403,"body":"this command belongs to the host"}"#)
                )
            }
        }

        private func playGroupChanges() {
            let launchPlan = FixtureHost.Group(
                id: "group-launch", title: "Launch plan",
                members: [
                    Companion(id: "juniper-6", name: "Juniper", tint: .green),
                    Companion(id: "pico-6", name: "Pico", tint: .orange),
                ],
                createdAt: Date.now.milliseconds + 3000)
            let frames = [
                FixtureHost.groupEvent("conversation://created", launchPlan),
                FixtureHost.groupEvent(
                    "conversation://updated", launchPlan.renamed("Launch checklist")),
                FixtureHost.groupDeleted(launchPlan),
            ]
            Task { [inboundContinuation] in
                for frame in frames {
                    try? await ContinuousClock().sleep(for: .seconds(3))
                    inboundContinuation.yield(.frame(frame))
                }
            }
        }

        private func answerPage(_ id: Int, _ conversationId: String, _ limit: Int) {
            let companionId = conversationId.replacingOccurrences(of: "chat-", with: "")
            let messages = script.messages[companionId] ?? []
            let page = messages.enumerated().map { $1.json(in: conversationId, seq: $0 + 1) }
                .suffix(limit)
            reply(
                id,
                #"{"conversationId":"\#(conversationId)","messages":[\#(page.joined(separator: ","))],"arrivals":[],"hasMore":false}"#
            )
            guard companionId == script.workingCompanion else { return }
            push(
                .frame(
                    FixtureHost.agentEvent(
                        conversationId, #"{"type":"turnChanged","state":"running"}"#)))
            for (index, title) in script.workingActivities.enumerated() {
                push(
                    .frame(
                        FixtureHost.agentEvent(
                            conversationId, FixtureHost.activity("tool-\(index)", title, "running")),
                        after: .milliseconds(150)))
            }
        }

        private func playTurn(after sent: [String: Any]) {
            let conversationId = sent["conversationId"] as? String ?? ""
            let event = { (event: String) in FixtureHost.agentEvent(conversationId, event) }
            push(
                .frame(
                    #"{"event":{"event":"conversation://message-stored","payload":\#(FixtureHost.messageJSON(id: sent["id"] as? String ?? "", conversationId: conversationId, seq: 99, role: "user", content: sent["content"] as? String ?? "", createdAt: sent["createdAt"] as? Int ?? 0))}}"#
                ))
            push(
                .frame(
                    event(#"{"type":"turnChanged","state":"running"}"#), after: .milliseconds(300)))
            let tools = [
                "Read · notes/changelog.md", "Read · apps/app/package.json",
                "Read · docs/relay/member-socket.md",
                "Bash · List the merged pull requests", "Bash · Show the last tag",
            ]
            for (index, title) in tools.enumerated() {
                push(
                    .frame(
                        event(FixtureHost.activity("live-\(index)", title, "running")),
                        after: .milliseconds(500)))
            }
            let reply = "Drafted. Three sections: new, fixed, under the hood."
            push(
                .frame(
                    event(FixtureHost.chatMessage("live-reply", "", "messageStarted")),
                    after: .milliseconds(400)))
            for word in reply.split(separator: " ") {
                push(
                    .frame(
                        event(
                            #"{"type":"messageDelta","id":"live-reply","seq":1,"text":"\#(word) "}"#
                        ),
                        after: .milliseconds(120)))
            }
            push(.frame(event(FixtureHost.chatMessage("live-reply", reply, "messageCompleted"))))
            push(
                .frame(
                    event(
                        FixtureHost.activity(
                            "live-write", "Write · notes/release-0.42.md", "succeeded")),
                    after: .milliseconds(500)))
            let closing = "They’re waiting for your read."
            push(
                .frame(
                    event(FixtureHost.chatMessage("live-closing", closing, "messageCompleted")),
                    after: .milliseconds(500)))
            push(
                .frame(
                    event(#"{"type":"turnEnded","ended":{"sessionId":null,"outcome":"success"}}"#)))
            push(.frame(event(#"{"type":"turnChanged","state":"idle"}"#)))
        }
    }
#endif
