import Foundation
import Testing

@testable import Kiroshi

struct MissionTranscriptTests {
    static let day = 1_791_619_860_000

    let time: ConversationTime = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return ConversationTime(
            now: Date(timeIntervalSince1970: TimeInterval(day) / 1000 + 3_600), calendar: calendar,
            locale: Locale(identifier: "en_US"))
    }()

    func transcript(_ messages: [String], openedAt: Int = day - 60_000) -> MissionTranscript {
        MissionTranscript(
            of: messages.map(MissionTesting.decoded),
            openedAt: Date(timeIntervalSince1970: TimeInterval(openedAt) / 1000), time: time)
    }

    @Test func thePromptAndTheCompanionShowInBubblesAndTheSummonsIsHidden() {
        let shown = transcript([
            MissionTesting.message(
                id: "reply", seq: 3, role: "assistant", content: "Done.",
                createdAt: Self.day + 60_000,
                botId: "b-1"),
            MissionTesting.message(
                id: "summons", seq: 1, content: "Carry out this mission.", createdAt: Self.day),
            MissionTesting.message(
                id: "prompt", seq: 2, content: "Split it.", createdAt: Self.day + 30_000),
            MissionTesting.message(
                id: "writing", seq: 4, role: "assistant", content: "", createdAt: Self.day + 90_000,
                botId: "b-1"),
        ])

        #expect(
            MissionTesting.shown(shown) == [
                .init(id: "prompt", isYours: true, bubbles: ["Split it."]),
                .init(id: "reply", isYours: false, bubbles: ["Done."]),
            ])
    }

    @Test func theCompanionSpeaksInOneBubblePerMessageLikeTheConversationThread() {
        let shown = transcript([
            MissionTesting.message(
                id: "reply", seq: 1, role: "assistant",
                content: "Done. Both are in Linear.\\n\\nWhich one goes first?",
                createdAt: Self.day,
                botId: "b-1")
        ])

        let reply = shown.entries.first
        #expect(reply?.bubbles.map(\.position) == [.alone])
        #expect(reply?.authorId == "b-1")
        #expect(reply?.closesRun == true)
        #expect(reply?.time == "8:11\u{202F}AM")
    }

    @Test func theDayTheMissionOpenedIsShownOnceAboveItsFirstMessages() {
        let shown = transcript([
            MissionTesting.message(id: "first", seq: 1, content: "One", createdAt: Self.day),
            MissionTesting.message(
                id: "next", seq: 2, content: "Two", createdAt: Self.day + 86_400_000),
        ])

        #expect(shown.openedDay == "Today")
        #expect(shown.entries.first?.dayLabel == nil)
        #expect(shown.entries.last?.dayLabel != nil)
    }

    @Test func attachedFilesAreNamedUnderTheTextTheyCameWith() {
        let shown = transcript([
            MissionTesting.message(
                id: "with-text", seq: 1,
                content:
                    "Here it is.\\nAttached to this message, sent 2026-10-11T08:31:00.000Z, 1 file:\\n1/1 /tmp/a/flow.png",
                createdAt: Self.day),
            MissionTesting.message(
                id: "alone", seq: 2,
                content:
                    "Attached to this message, sent 2026-10-11T08:31:00.000Z, 2 files:\\n1/2 /tmp/a/one.png\\n2/2 /tmp/a/two.pdf",
                createdAt: Self.day),
        ])

        #expect(
            MissionTesting.shown(shown) == [
                .init(id: "with-text", isYours: true, bubbles: ["Here it is."]),
                .init(id: "alone", isYours: true, bubbles: ["one.png\ntwo.pdf"]),
            ])
        #expect(shown.entries.first?.attachedFiles == ["flow.png"])
        #expect(shown.entries.last?.attachedFiles == [])
    }

    @Test func theOpenedLineNamesTheCompanion() {
        #expect(
            MissionTranscript.openedLine(by: Companion(id: "b-1", name: "Atlas"))
                == "Mission opened by Atlas")
        #expect(MissionTranscript.openedLine(by: nil) == "Mission opened by the companion")
    }

    @Test func aStoredMessageReplacesTheOneSentWithTheSameId() {
        let sent = MissionTesting.decoded(MissionTesting.message(id: "a", seq: .max, content: "Hi"))
        let stored = MissionTesting.decoded(MissionTesting.message(id: "a", seq: 7, content: "Hi"))
        let earlier = MissionTesting.decoded(MissionTesting.message(id: "b", seq: 6, content: "Yo"))

        let messages = MissionTranscript.upserting(stored, into: [sent, earlier])

        #expect(messages.map(\.id) == ["b", "a"])
        #expect(messages.last?.seq == 7)
    }
}
