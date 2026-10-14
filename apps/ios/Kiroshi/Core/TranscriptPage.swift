struct TranscriptPage: Decodable, Sendable {
    let conversationId: String
    let messages: [TranscriptMessage]
    let hasMore: Bool
}
