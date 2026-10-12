import Foundation
import Testing

@testable import Kiroshi

struct AttachmentBlockTests {
    let sentAt = Date(timeIntervalSince1970: 1_791_619_860.5)
    let paths = [
        "/data/attachments/thread-1/6f1c2e9a-3b4d-4e5f-8a6b-7c8d9e0f1a2b.png",
        "/data/attachments/thread-1/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d.pdf",
    ]

    @Test func thePromptCarriesTheBlockTheDesktopWrites() {
        #expect(
            AttachmentBlock.prompt(text: "  Here  ", paths: paths, sentAt: sentAt) == """
                Here
                Attached to this message, sent 2026-10-10T08:11:00.500Z, 2 files:
                1/2 /data/attachments/thread-1/6f1c2e9a-3b4d-4e5f-8a6b-7c8d9e0f1a2b.png
                2/2 /data/attachments/thread-1/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d.pdf
                """)
        #expect(
            AttachmentBlock.prompt(text: "Only text", paths: [], sentAt: sentAt)
                == "Only text")
    }

    @Test func aPromptSplitsBackIntoItsTextAndFileNames() {
        let content = AttachmentBlock.prompt(text: "Here", paths: paths, sentAt: sentAt)

        #expect(
            AttachmentBlock.split(content)
                == .init(
                    text: "Here",
                    names: [
                        "6f1c2e9a-3b4d-4e5f-8a6b-7c8d9e0f1a2b.png",
                        "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d.pdf",
                    ]))
    }

    @Test func aBlockWithTheWrongCountStaysText() {
        let content = """
            Here
            Attached to this message, sent 2026-10-10T19:31:00.500Z, 2 files:
            1/2 /data/attachments/thread-1/a.png
            """

        #expect(AttachmentBlock.split(content) == .init(text: content, names: []))
    }
}
