import Foundation

struct ConversationAttachments: Encodable, Sendable {
    struct Attachment: Encodable, Sendable {
        let name: String
        let base64: String
    }

    let conversationId: String
    let attachments: [Attachment]

    @concurrent static func encoding(_ picked: [PickedAttachment], in conversationId: String) async
        -> ConversationAttachments
    {
        ConversationAttachments(
            conversationId: conversationId,
            attachments: picked.map { .init(name: $0.name, base64: $0.data.base64EncodedString()) })
    }
}

enum AttachmentRejection: Error, Equatable {
    static let maxBytes = 10_485_760
    static let maxAttachments = 20
    static let maxTotalBytes = 31_457_280

    case tooMany
    case tooLarge
    case tooLargeTogether

    static func of(_ picked: [PickedAttachment]) -> AttachmentRejection? {
        let sizes = picked.map(\.data.count)
        if sizes.count > maxAttachments { return .tooMany }
        if sizes.contains(where: { $0 > maxBytes }) { return .tooLarge }
        if sizes.reduce(0, +) > maxTotalBytes { return .tooLargeTogether }
        return nil
    }
}
