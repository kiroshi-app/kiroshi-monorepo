import Foundation

@testable import Kiroshi

struct TestCall: Sendable {
    let id: Int
    let command: String
    let text: String

    func args<Args: Decodable>(as type: Args.Type) throws -> Args {
        try JSONDecoder().decode(Envelope<Args>.self, from: Data(text.utf8)).args
    }

    private struct Envelope<Args: Decodable>: Decodable {
        let args: Args
    }
}

final class TestHost: Sendable {
    typealias Answer = @Sendable (TestCall) -> String?

    let socket = ScriptedRelaySocket(sharedSpaceId: "s-1")
    let calls: AsyncStream<TestCall>
    private let callsContinuation: AsyncStream<TestCall>.Continuation
    private let listening: Task<Void, Never>

    init(
        companions: [Companion] = [],
        groups: [FixtureHost.Group] = [],
        messages: [String: [String]] = [:],
        holding: Set<String> = [],
        answer: @escaping Answer = { _ in nil }
    ) {
        let (calls, callsContinuation) = AsyncStream.makeStream(of: TestCall.self)
        self.calls = calls
        self.callsContinuation = callsContinuation
        let socket = socket
        listening = Task {
            for await text in socket.sent {
                guard let head = try? JSONDecoder().decode(Head.self, from: Data(text.utf8)),
                    head.command != "relay_shared_space"
                else { continue }
                let call = TestCall(id: head.id, command: head.command, text: text)
                callsContinuation.yield(call)
                guard !holding.contains(call.command) else { continue }
                let body =
                    answer(call)
                    ?? Self.standard(
                        call, companions: companions, groups: groups, messages: messages)
                if let body {
                    socket.push(.frame(body))
                }
            }
        }
    }

    deinit {
        listening.cancel()
    }

    func push(event name: String, payload: String) {
        socket.push(.frame(#"{"event":{"event":"\#(name)","payload":\#(payload)}}"#))
    }

    func pushAgent(_ conversationId: String, _ event: String) {
        push(
            event: "agent://event",
            payload:
                #"{"scope":{"conversationId":"\#(conversationId)","botId":"bot","runtimeSessionId":"session-1","epoch":1},"event":\#(event),"turn":{"turnId":"turn-1","conversationId":"\#(conversationId)"}}"#
        )
    }

    func reply(_ frame: String) {
        socket.push(.frame(frame))
    }

    static let unavailable = #"{"kind":"unavailable","failure":{"kind":"locked"}}"#

    func nextCall(_ command: String) async -> TestCall? {
        for await call in calls where call.command == command {
            return call
        }
        return nil
    }

    static func ok(_ call: TestCall, _ body: String) -> String {
        #"{"id":\#(call.id),"status":200,"body":\#(body)}"#
    }

    static func refused(_ call: TestCall, status: Int, _ body: String) -> String {
        #"{"id":\#(call.id),"status":\#(status),"body":\#(body)}"#
    }

    static func message(
        _ id: String, in conversationId: String, seq: Int, isYours: Bool, _ content: String,
        at createdAt: Int, by author: Companion.ID? = nil
    ) -> String {
        FixtureHost.messageJSON(
            id: id, conversationId: conversationId, seq: seq,
            role: isYours ? "user" : "assistant", content: content, createdAt: createdAt,
            authorBotId: author)
    }

    private static func standard(
        _ call: TestCall, companions: [Companion], groups: [FixtureHost.Group],
        messages: [String: [String]]
    ) -> String? {
        switch call.command {
        case "conversation_list":
            return ok(call, "[\(groups.map(\.json).joined(separator: ","))]")
        case "conversation_page":
            guard let args = try? call.args(as: ListPageArgs.self) else { return nil }
            let rows = groups.map { group in
                pageRow(group, last: messages[group.id]?.last.flatMap(transcriptMessage))
            }
            return ok(
                call, FixtureHost.conversationPage(rows, cursor: args.cursor, limit: args.limit))
        case "conversation_bots":
            let bots = companions.map { FixtureHost.botJSON($0) }
            return ok(call, "[\(bots.joined(separator: ","))]")
        case "agent_pending_questions", "section_list":
            return ok(call, "[]")
        case "conversation_main_chat":
            guard let args = try? call.args(as: BotArgs.self) else { return nil }
            return ok(call, #"{"id":"chat-\#(args.botId)","createdAt":0,"updatedAt":0}"#)
        case "conversation_message_page":
            guard let args = try? call.args(as: PageArgs.self) else { return nil }
            let earlier = (messages[args.conversationId] ?? []).filter { message in
                args.beforeSeq.map { (transcriptMessage(message)?.seq ?? 0) < $0 } ?? true
            }
            return ok(
                call,
                messagePage(
                    args.conversationId, Array(earlier.suffix(args.limit)),
                    hasMore: earlier.count > args.limit))
        default:
            return nil
        }
    }

    static func messagePage(_ conversationId: String, _ messages: [String], hasMore: Bool)
        -> String
    {
        #"{"conversationId":"\#(conversationId)","messages":[\#(messages.joined(separator: ","))],"arrivals":[],"hasMore":\#(hasMore)}"#
    }

    static func pageRow(_ group: FixtureHost.Group, last: TranscriptMessage?)
        -> FixtureHost.PageRow
    {
        FixtureHost.PageRow(
            group: group, lastActivityAt: max(group.createdAt, last?.createdAt ?? 0),
            lastWord: last.map {
                FixtureHost.lastWordJSON(
                    text: $0.content, at: $0.createdAt,
                    by: $0.role == .user ? nil : $0.authorBotId)
            })
    }

    static func transcriptMessage(_ json: String) -> TranscriptMessage? {
        try? JSONDecoder().decode(TranscriptMessage.self, from: Data(json.utf8))
    }

    private struct Head: Decodable {
        let id: Int
        let command: String
    }

    struct BotArgs: Decodable {
        let botId: String
        let spaceId: String
    }

    struct PageArgs: Decodable {
        let conversationId: String
        let beforeSeq: Int?
        let limit: Int
    }

    struct ListPageArgs: Decodable {
        let spaceId: String
        let cursor: String?
        let limit: Int
    }
}
