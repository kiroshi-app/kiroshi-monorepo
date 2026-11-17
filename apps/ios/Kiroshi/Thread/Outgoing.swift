import Foundation

struct Outgoing {
    let id: String
    let turnId: String
    let conversationId: String
    let written: String
    let content: String
    let picked: [PickedAttachment]
    let storeCallKey: String?
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

    func repeats(_ written: String, with picked: [PickedAttachment]) -> Bool {
        self.written == written && self.picked == picked
    }
}
