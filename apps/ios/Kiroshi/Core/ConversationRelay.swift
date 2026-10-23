enum ConversationCallError: Error, Equatable {
    case refused(status: Int, kind: String?)
    case unreadable
    case unknownToTheHost

    var isUnreadableCursor: Bool {
        guard case .refused(_, let kind) = self else { return false }
        return kind == "unreadableCursor"
    }
}

struct ConversationRelay: Sendable {
    static let listPageSize = 30

    let connection: RelayConnection

    func companions(in spaceId: String) async throws -> [CompanionInRoster] {
        try await ask(
            "conversation_bots", SpaceArgs(spaceId: spaceId), as: [CompanionInRoster].self)
    }

    func pins(in spaceId: String) async throws -> [RosterPin] {
        async let sections = ask(
            "section_list", SpaceArgs(spaceId: spaceId), as: [RosterSection].self)
        async let companions = companions(in: spaceId)
        let page = try await page(in: spaceId, after: nil)
        let rows = (try await companions).map(\.place) + page.pinned.compactMap(\.groupPlace)
        return try await RosterPins.of(rows, sections: sections)
    }

    func pin(_ pins: [RosterPin], in spaceId: String) async throws {
        let args = RosterPinArgs(spaceId: spaceId, pins: pins)
        let answer = try await connection.call("roster_pin", args: args)
        guard answer.status == 200 else { throw Self.refusal(of: answer) }
    }

    func groups(in spaceId: String) async throws -> [GroupConversation] {
        try await ask(
            "conversation_list", SpaceArgs(spaceId: spaceId), as: [GroupConversation].self)
    }

    func page(in spaceId: String, after cursor: String?) async throws -> ConversationPage {
        let args = ListPageArgs(spaceId: spaceId, cursor: cursor, limit: Self.listPageSize)
        return try await ask("conversation_page", args, as: ConversationPage.self)
    }

    func createGroup(in spaceId: String, with companionIds: [Companion.ID]) async throws
        -> GroupConversation
    {
        let args = CreateArgs(spaceId: spaceId, sectionId: nil, title: "", botIds: companionIds)
        return try await ask("conversation_create", args, as: GroupConversation.self)
    }

    func mainChat(of companionId: Companion.ID, in spaceId: String) async throws -> String {
        let args = MainChatArgs(botId: companionId, spaceId: spaceId)
        return try await ask("conversation_main_chat", args, as: MainChat.self).id
    }

    func latestMessages(in conversationId: String, limit: Int) async throws -> [TranscriptMessage] {
        try await messages(in: conversationId, before: nil, limit: limit).messages
    }

    func messages(in conversationId: String, before seq: Int?, limit: Int) async throws
        -> TranscriptPage
    {
        let args = PageArgs(conversationId: conversationId, beforeSeq: seq, limit: limit)
        let page = try await ask("conversation_message_page", args, as: TranscriptPage.self)
        return TranscriptPage(
            conversationId: page.conversationId,
            messages: page.messages.sorted { $0.seq < $1.seq }, hasMore: page.hasMore)
    }

    func storeAttachments(_ attachments: ConversationAttachments) async throws -> [String] {
        try await ask("chat_store_attachments", attachments, as: [String].self)
    }

    func sendTurn(_ message: SentMessage, summoning companionIds: [Companion.ID]) async throws {
        let args = SendTurnArgs(message: message, summoned: companionIds)
        _ = try await ask("conversation_send_turn", args, as: Int.self)
    }

    func pendingQuestions(in conversationId: String) async throws -> [AgentEvent] {
        try await ask(
            "agent_pending_questions", InConversationArgs(conversationId: conversationId),
            as: [AgentEvent].self)
    }

    func answerQuestion(
        _ id: String, askedIn scope: AgentEvent.Scope, with answers: [String: String]
    ) async throws {
        let args = AnswerArgs(scope: scope, id: id, answers: answers)
        let answer = try await connection.call("agent_answer_question", args: args)
        guard answer.status == 200 else { throw Self.refusal(of: answer) }
    }

    func recordAnswer(_ message: SentMessage) async throws {
        _ = try await ask(
            "conversation_append_user_message", AppendArgs(message: AnswerMessage(message)),
            as: Int.self)
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
        guard !answer.isUnknownToTheHost else { return .unknownToTheHost }
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

private struct InConversationArgs: Encodable {
    let conversationId: String
}

private struct SpaceArgs: Encodable {
    let spaceId: String
}

private struct RosterPinArgs: Encodable {
    let spaceId: String
    let pins: [RosterPin]
}

private struct CreateArgs: Encodable {
    enum CodingKeys: String, CodingKey {
        case spaceId
        case sectionId
        case title
        case botIds
    }

    let spaceId: String
    let sectionId: String?
    let title: String
    let botIds: [String]

    func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(spaceId, forKey: .spaceId)
        try container.encode(sectionId, forKey: .sectionId)
        try container.encode(title, forKey: .title)
        try container.encode(botIds, forKey: .botIds)
    }
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

private struct ListPageArgs: Encodable {
    enum CodingKeys: String, CodingKey {
        case spaceId
        case cursor
        case limit
    }

    let spaceId: String
    let cursor: String?
    let limit: Int

    func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(spaceId, forKey: .spaceId)
        try container.encode(cursor, forKey: .cursor)
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

private struct AnswerArgs: Encodable {
    let scope: AgentEvent.Scope
    let id: String
    let answers: [String: String]
}

private struct AppendArgs: Encodable {
    let message: AnswerMessage
}

private struct AnswerMessage: Encodable {
    enum CodingKeys: String, CodingKey {
        case authorBotId
    }

    let sent: SentMessage

    init(_ sent: SentMessage) {
        self.sent = sent
    }

    func encode(to encoder: any Encoder) throws {
        try sent.encode(to: encoder)
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeNil(forKey: .authorBotId)
    }
}
