struct ConversationAttachments: Encodable, Sendable {
    struct Attachment: Encodable, Sendable {
        let name: String
        let bytes: [UInt8]
    }

    let conversationId: String
    let attachments: [Attachment]
}
