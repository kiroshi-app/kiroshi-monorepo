enum ConversationCallError: Error, Equatable {
    case refused(status: Int, kind: String?)
    case unreadable
}

struct ConversationRelay: Sendable {
    let connection: RelayConnection

    func companions(in spaceId: String) async throws -> [Companion] {
        try await ask("conversation_bots", SpaceArgs(spaceId: spaceId), as: [Companion].self)
    }

    func groups(in spaceId: String) async throws -> [GroupConversation] {
        try await ask(
            "conversation_list", SpaceArgs(spaceId: spaceId), as: [GroupConversation].self)
    }

    func mainChat(of companionId: Companion.ID, in spaceId: String) async throws -> String {
        let args = MainChatArgs(botId: companionId, spaceId: spaceId)
        return try await ask("conversation_main_chat", args, as: MainChat.self).id
    }

    func latestMessages(in conversationId: String, limit: Int) async throws -> [TranscriptMessage] {
        let args = PageArgs(conversationId: conversationId, beforeSeq: nil, limit: limit)
        let page = try await ask("conversation_message_page", args, as: TranscriptPage.self)
        return page.messages.sorted { $0.seq < $1.seq }
    }

    func sendTurn(_ message: SentMessage, summoning companionIds: [Companion.ID]) async throws {
        let args = SendTurnArgs(message: message, summoned: companionIds)
        _ = try await ask("conversation_send_turn", args, as: Int.self)
    }

    func cancelTurn(_ scope: AgentEvent.Scope) async throws {
        let answer = try await connection.call("agent_cancel_turn", args: CancelArgs(scope: scope))
        guard answer.status == 200 else { throw Self.refusal(of: answer) }
    }

    private func ask<Body: Decodable>(
        _ command: String, _ args: some Encodable & Sendable, as type: Body.Type
    ) async throws -> Body {
        let answer = try await connection.call(command, args: args)
        guard answer.status == 200 else { throw Self.refusal(of: answer) }
        guard let body = try? answer.body(as: Body.self) else {
            throw ConversationCallError.unreadable
        }
        return body
    }

    private static func refusal(of answer: RelayAnswer) -> ConversationCallError {
        let kind = (try? answer.body(as: StoreError.self))?.kind
        return .refused(status: answer.status, kind: kind)
    }
}

private struct StoreError: Decodable {
    let kind: String
}

private struct MainChat: Decodable {
    let id: String
}

private struct SpaceArgs: Encodable {
    let spaceId: String
}

private struct MainChatArgs: Encodable {
    let botId: String
    let spaceId: String
}

private struct PageArgs: Encodable {
    enum CodingKeys: String, CodingKey {
        case conversationId
        case beforeSeq
        case limit
    }

    let conversationId: String
    let beforeSeq: Int?
    let limit: Int

    func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(conversationId, forKey: .conversationId)
        try container.encode(beforeSeq, forKey: .beforeSeq)
        try container.encode(limit, forKey: .limit)
    }
}

private struct SendTurnArgs: Encodable {
    let message: SentMessage
    let summoned: [String]
}

private struct CancelArgs: Encodable {
    let scope: AgentEvent.Scope
}
