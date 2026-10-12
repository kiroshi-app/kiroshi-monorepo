import Foundation

enum MissionsCallError: Error, Equatable {
    case refused(status: Int)
}

struct MissionsRelay: Sendable {
    static let threadPageSize = 50

    let connection: RelayConnection

    func feed(spaceId: String, closedSince: Int) async throws -> [MissionInSpace] {
        try await ok(
            "mission_space_feed", args: FeedArgs(spaceId: spaceId, closedSince: closedSince))
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
        guard answer.status == 200 else { throw MissionsCallError.refused(status: answer.status) }
        return try answer.body(as: Body.self)
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
