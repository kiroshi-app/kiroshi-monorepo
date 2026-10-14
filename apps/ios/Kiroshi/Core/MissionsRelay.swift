import Foundation

enum MissionsCallError: Error, Equatable {
    case refused(status: Int)
    case unreadableCursor
    case unknownToTheHost
}

struct MissionsRelay: Sendable {
    static let threadPageSize = 50
    static let listPageSize = 30

    let connection: RelayConnection

    func feed(spaceId: String, closedSince: Int) async throws -> [MissionInSpace] {
        try await ok(
            "mission_space_feed", args: FeedArgs(spaceId: spaceId, closedSince: closedSince))
    }

    func page(spaceId: String, closedSince: Int, after cursor: String?) async throws
        -> MissionSpacePage
    {
        try await ok(
            "mission_space_page",
            args: SpacePageArgs(
                spaceId: spaceId, closedSince: closedSince, cursor: cursor,
                limit: Self.listPageSize))
    }

    func companions(spaceId: String) async throws -> [MissionCompanion] {
        try await ok("conversation_bots", args: SpaceArgs(spaceId: spaceId))
    }

    func thread(conversationId: String) async throws -> MissionThreadPage {
        try await ok(
            "conversation_message_page",
            args: PageArgs(conversationId: conversationId, limit: Self.threadPageSize))
    }

    func store(_ attachments: ConversationAttachments) async throws -> [String] {
        try await ok("chat_store_attachments", args: attachments)
    }

    func answer(_ answer: MissionAnswer) async throws {
        let _: Int = try await ok("conversation_send_turn", args: answer)
    }

    private func ok<Body: Decodable>(_ command: String, args: some Encodable & Sendable)
        async throws -> Body
    {
        let answer = try await connection.call(command, args: args)
        guard answer.status == 200 else { throw Self.refusal(of: answer) }
        return try answer.body(as: Body.self)
    }

    private static func refusal(of answer: RelayAnswer) -> MissionsCallError {
        if answer.isUnknownToTheHost { return .unknownToTheHost }
        if (try? answer.body(as: Refusal.self))?.kind == "unreadableCursor" {
            return .unreadableCursor
        }
        return .refused(status: answer.status)
    }
}

private struct Refusal: Decodable {
    let kind: String
}

private struct SpacePageArgs: Encodable {
    enum CodingKeys: String, CodingKey {
        case spaceId
        case closedSince
        case cursor
        case limit
    }

    let spaceId: String
    let closedSince: Int
    let cursor: String?
    let limit: Int

    func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(spaceId, forKey: .spaceId)
        try container.encode(closedSince, forKey: .closedSince)
        try container.encode(cursor, forKey: .cursor)
        try container.encode(limit, forKey: .limit)
    }
}

private struct FeedArgs: Encodable {
    let spaceId: String
    let closedSince: Int
}

private struct SpaceArgs: Encodable {
    let spaceId: String
}

private struct PageArgs: Encodable {
    let conversationId: String
    let limit: Int
}
