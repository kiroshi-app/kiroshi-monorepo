import Foundation
import Testing

@testable import Kiroshi

struct ConversationAttachmentsTests {
    static let mebibyte = 1 << 20

    @Test func theLimitsAreTheHostOnes() {
        #expect(AttachmentRejection.maxBytes == 10_485_760)
        #expect(AttachmentRejection.maxAttachments == 20)
        #expect(AttachmentRejection.maxTotalBytes == 31_457_280)
    }

    @Test func aFileAtTheLimitPassesAndOneByteOverIsTooLarge() {
        #expect(AttachmentRejection.of([file(AttachmentRejection.maxBytes)]) == nil)
        #expect(AttachmentRejection.of([file(AttachmentRejection.maxBytes + 1)]) == .tooLarge)
    }

    @Test func filesAtTheTotalPassAndOneByteOverAreTooLargeTogether() {
        let atTheTotal = [10, 10, 10].map { file($0 * Self.mebibyte) }
        #expect(AttachmentRejection.of(atTheTotal) == nil)
        #expect(AttachmentRejection.of(atTheTotal + [file(1)]) == .tooLargeTogether)
    }

    @Test func twentyFilesPassAndTwentyOneAreTooMany() {
        #expect(AttachmentRejection.of(Array(repeating: file(1), count: 20)) == nil)
        #expect(AttachmentRejection.of(Array(repeating: file(1), count: 21)) == .tooMany)
    }

    @Test func noFileBreaksNoLimit() {
        #expect(AttachmentRejection.of([]) == nil)
    }

    @Test func theRequestCarriesEachFileAsBase64AndNoBytes() async throws {
        let picked = [
            PickedAttachment(id: UUID(), name: "photo.jpg", data: Data([0xFF, 0xD8, 0xFF])),
            PickedAttachment(id: UUID(), name: "notes.txt", data: Data("hi".utf8)),
        ]

        let request = await ConversationAttachments.encoding(picked, in: "chat-juniper")
        let json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(request))
        let object = try #require(json as? [String: Any])
        let attachments = try #require(object["attachments"] as? [[String: Any]])

        #expect(object["conversationId"] as? String == "chat-juniper")
        #expect(attachments.map { $0["name"] as? String } == ["photo.jpg", "notes.txt"])
        #expect(attachments.map { $0["base64"] as? String } == ["/9j/", "aGk="])
        #expect(attachments.allSatisfy { $0["bytes"] == nil })
        #expect(attachments.allSatisfy { Set($0.keys) == ["name", "base64"] })
    }

    private func file(_ bytes: Int) -> PickedAttachment {
        PickedAttachment(id: UUID(), name: "Photo.jpg", data: Data(count: bytes))
    }
}
