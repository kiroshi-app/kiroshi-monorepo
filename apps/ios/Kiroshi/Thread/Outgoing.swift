import Foundation

struct Outgoing {
    let id: String
    let turnId: String
    let conversationId: String
    let written: String
    let content: String
    let picked: [PickedAttachment]
    private(set) var storeCallKey: String?
    let sentAt: Date
    var storedPaths: [String]?

    init(
        in conversationId: String, written: String, content: String,
        picked: [PickedAttachment], sentAt: Date, makeId: () -> String
    ) {
        id = makeId()
        turnId = makeId()
        self.conversationId = conversationId
        self.written = written
        self.content = content
        self.picked = picked
        storeCallKey = picked.isEmpty ? nil : makeId()
        self.sentAt = sentAt
    }

    @MainActor
    mutating func prompt(
        storingFilesBy store: (ConversationAttachments, String) async throws -> [String],
        makeId: () -> String
    ) async throws -> String {
        if let storeCallKey, storedPaths == nil {
            let files = await ConversationAttachments.encoding(picked, in: conversationId)
            do {
                storedPaths = try await store(files, storeCallKey)
            } catch RelayCallError.alreadyRan {
                let freshKey = makeId()
                self.storeCallKey = freshKey
                storedPaths = try await store(files, freshKey)
            }
        }
        guard let storedPaths else { return content }
        return AttachmentBlock.prompt(text: content, paths: storedPaths, sentAt: sentAt)
    }

    func repeats(_ written: String, with picked: [PickedAttachment]) -> Bool {
        self.written == written && self.picked == picked
    }
}
