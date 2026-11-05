import Foundation
import Testing

@testable import Kiroshi

struct CitedMessageTests {
    let folder = "/Users/sam/Library/Application Support/com.kiroshi.app/attachments/c-1"
    var chart: String { "\(folder)/6f1c2e9a-3b4d-4e5f-8a6b-7c8d9e0f1a2b.png" }
    var notes: String { "\(folder)/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d.pdf" }

    func image(_ path: String, _ name: String) -> CitedSegment {
        .attachment(CitedAttachment(path: path, name: name, kind: .image))
    }

    func file(_ path: String, _ name: String) -> CitedSegment {
        .attachment(CitedAttachment(path: path, name: name, kind: .file))
    }

    @Test func aCitedImageShowsInPlace() {
        let message = CitedMessage("![Build times](<\(chart)>)")

        #expect(message.segments == [image(chart, "Build times")])
    }

    @Test func aCitedFileIsAnItem() {
        let message = CitedMessage("[Release notes 4.2.pdf](<\(notes)>)")

        #expect(message.segments == [file(notes, "Release notes 4.2.pdf")])
    }

    @Test func textAndCitesKeepTheirOrder() {
        let message = CitedMessage(
            """
            Here’s the chart:

            ![Build times](<\(chart)>)

            And the notes, [notes](<\(notes)>) for review.
            """)

        #expect(
            message.segments == [
                .text("Here’s the chart:"), image(chart, "Build times"), .text("And the notes, "),
                file(notes, "notes"), .text(" for review."),
            ])
    }

    @Test func aCiteWithoutCaptionTakesTheFileNameAndItsEscapesAreRead() {
        let bare = "/data/attachments/c-1/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d.pdf"
        let message = CitedMessage("![](<\(chart)>) ![a \\[draft\\] \\\\ v2](\(bare))")

        #expect(
            message.segments == [
                image(chart, "6f1c2e9a-3b4d-4e5f-8a6b-7c8d9e0f1a2b.png"),
                file(bare, "a [draft] \\ v2"),
            ])
    }

    @Test func anEscapedDestinationIsReadAsWritten() {
        let path = "/data/<odd>/attachments/c-1/6f1c2e9a-3b4d-4e5f-8a6b-7c8d9e0f1a2b.png"
        let message = CitedMessage(
            "![odd](</data/%3Codd%3E/attachments/c-1/6f1c2e9a-3b4d-4e5f-8a6b-7c8d9e0f1a2b.png>)")

        #expect(message.segments == [image(path, "odd")])
        #expect(
            message.segments.first.map(conversationAndFile) == [
                "c-1", "6f1c2e9a-3b4d-4e5f-8a6b-7c8d9e0f1a2b.png",
            ])
    }

    @Test func aCodePathLinkStaysALink() {
        let texts = [
            "See [ThreadMessage.swift](<apps/ios/Kiroshi/Conversations/ThreadMessage.swift>).",
            "See [main](/Users/sam/code/attachments/c-1/main.swift).",
            "See [notes](<\(folder)/6F1C2E9A-3B4D-4E5F-8A6B-7C8D9E0F1A2B.pdf>).",
            "See [notes](<attachments/c-1/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d.pdf>).",
        ]

        for text in texts {
            #expect(CitedMessage(text).segments == [.text(text)])
        }
    }

    @Test func anImageThatIsNoStoredAttachmentStaysText() {
        let texts = [
            "![Logo](https://kiroshi.app/logo.png)",
            "![Chart](https://cdn.example.com/attachments/c-1/6f1c2e9a-3b4d-4e5f-8a6b-7c8d9e0f1a2b.png)",
            "![Chart](file:///data/attachments/c-1/6f1c2e9a-3b4d-4e5f-8a6b-7c8d9e0f1a2b.png)",
        ]

        for text in texts {
            #expect(CitedMessage(text).segments == [.text(text)])
        }
    }

    @Test func aCiteInsideCodeStaysCode() {
        let text = """
            Write it as `![Chart](<\(chart)>)`:

            ```markdown
            ![Chart](<\(chart)>)
            ```
            """

        #expect(CitedMessage(text).segments == [.text(text)])
    }

    @Test func anImageMarkOnAFileThatIsNoImageIsAnItem() {
        #expect(CitedMessage("![Notes](<\(notes)>)").segments == [file(notes, "Notes")])
    }

    @Test func aWindowsPathIsAStoredAttachmentToo() {
        let path = #"C:\Users\sam\AppData\attachments\c-1\6f1c2e9a-3b4d-4e5f-8a6b-7c8d9e0f1a2b.png"#

        #expect(CitedMessage("![Chart](<\(path)>)").segments == [image(path, "Chart")])
    }

    @Test func theOldBlockOfOneFileTurnsIntoItsFile() {
        let message = CitedMessage(
            """
            Here it is.
            Attached to this message, sent 2026-11-04T16:20:00.000Z, 1 file:
            1/1 \(chart)
            """)

        #expect(message.text == "Here it is.")
        #expect(
            message.segments == [
                .text("Here it is."), file(chart, "6f1c2e9a-3b4d-4e5f-8a6b-7c8d9e0f1a2b.png"),
            ])
    }

    @Test func theOldBlockOfSeveralFilesTurnsIntoTheFilesInOrder() {
        let message = CitedMessage(
            """
            Attached to this message, sent 2026-11-04T16:20:00.000Z, 2 files:
            1/2 \(chart)
            2/2 \(notes)
            """)

        #expect(message.text.isEmpty)
        #expect(
            message.segments == [
                file(chart, "6f1c2e9a-3b4d-4e5f-8a6b-7c8d9e0f1a2b.png"),
                file(notes, "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d.pdf"),
            ])
    }

    @Test func aMalformedBlockStaysText() {
        let texts = [
            "Attached to this message, sent 2026-11-04T16:20:00.000Z, 2 files:\n1/2 \(chart)",
            "Attached to this message, sent 2026-11-04T16:20:00.000Z, 1 file:\n2/1 \(chart)",
            "Attached to this message, sent 2026-11-04T16:20:00.000Z, 1 file:\n1/1 /tmp/notes.pdf",
            "Attached to this message, sent yesterday, 1 file:\n1/1 \(chart)",
        ]

        for text in texts {
            let message = CitedMessage(text)
            #expect(message.text == text)
            #expect(message.segments == [.text(text)])
        }
    }

    @Test func aMalformedCiteStaysText() {
        let texts = [
            "![Chart](<\(chart)",
            "![Chart(<\(chart)>)",
            "![Chart](<>)",
            "[](<)",
            "![Chart](<\(folder)/6f1c2e9a.png>)",
            "",
        ]

        for text in texts {
            #expect(CitedMessage(text).segments == (text.isEmpty ? [] : [.text(text)]))
        }
    }

    @Test func anAgentReplySplitsIntoBubblesAroundItsFiles() {
        let message = ThreadMessage(
            id: "m", writer: .companion("juniper"),
            text: "Here’s the chart:\n\n![Chart](<\(chart)>)\n\nThat’s all.", sentAt: .now)

        #expect(message.bubbles.map(\.id) == ["m-0", "m-1", "m-2"])
        #expect(message.bubbles.map(\.attachment?.name) == [nil, "Chart", nil])
        #expect(message.bubbles.map { $0.markdown != nil } == [true, false, true])
        #expect(
            message.bubbles.first?.markdown?.shownText == message.bubbles.last?.markdown?.shownText)
    }

    @Test func anOldAgentMessageShowsNoBlockText() {
        let message = ThreadMessage(
            id: "m", writer: .companion("juniper"),
            text:
                "Both files.\nAttached to this message, sent 2026-11-04T16:20:00.000Z, 1 file:\n1/1 \(notes)",
            sentAt: .now)

        #expect(String(message.rendered.characters) == "Both files.")
        #expect(message.bubbles.map { $0.attachment?.kind } == [nil, .file])
        #expect(message.attachedFiles.isEmpty)
    }

    @Test func aPersonsMessageIsNeverParsedForCites() {
        let message = ThreadMessage(
            id: "m", writer: .you, text: "![Chart](<\(chart)>)", sentAt: .now)

        #expect(message.bubbles.map(\.attachment) == [nil])
    }

    @Test func aFileNamedOnlyByItsStoredNameIsSpokenByItsKind() {
        let named = CitedAttachment(path: notes, name: "Release notes.pdf", kind: .file)
        let unnamed = CitedAttachment(
            path: notes, name: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d.pdf", kind: .file)

        #expect(named.spokenName == "Release notes.pdf")
        #expect(unnamed.spokenName == "PDF file")
        #expect(named.savedName == "Release notes.pdf")
        #expect(unnamed.savedName == "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d.pdf")
    }

    private func conversationAndFile(_ segment: CitedSegment) -> [String] {
        guard case .attachment(let attachment) = segment else { return [] }
        return [attachment.conversationId, attachment.file]
    }
}
