import Foundation
import Testing

@testable import Kiroshi

@MainActor
struct ThreadLayoutTests {
    let juniper = Companion(id: "juniper", name: "Juniper")
    let atlas = Companion(id: "atlas", name: "Atlas")
    let time: ConversationTime = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return ConversationTime(
            now: Date(timeIntervalSince1970: 1_791_625_200), calendar: calendar,
            locale: Locale(identifier: "en_US"))
    }()

    func at(_ hour: Int, _ minute: Int, daysAgo: Int = 0) -> Date {
        let day = time.calendar.date(
            byAdding: .day, value: -daysAgo, to: time.calendar.startOfDay(for: time.now))!
        return time.calendar.date(bySettingHour: hour, minute: minute, second: 0, of: day)!
    }

    func message(
        _ id: String, _ text: String, at date: Date, by author: Companion? = nil,
        isYours: Bool = false, inGroup: Bool = false
    ) -> ThreadMessage {
        ThreadMessage(
            id: id, writer: isYours ? .you : .companion(author?.id), text: text, sentAt: date,
            authors: inGroup ? [juniper, atlas] : [])
    }

    var releaseNotes: [ThreadMessage] {
        [
            message(
                "ask", "Can you draft the release notes for 0.42?", at: at(9, 38), isYours: true),
            message(
                "drafted",
                "Drafted. Three sections: new, fixed, under the hood.\n\nApplications get the top spot, it’s what people notice first.",
                at: at(9, 39)),
            message("waiting", "They’re waiting for your read.", at: at(9, 40)),
        ]
    }

    @Test func aRunJoinsItsBubblesAndPutsTheAvatarUnderTheLastOne() {
        let shown = ThreadLayout.mark(releaseNotes, time: time)

        #expect(shown.map(\.bubbles.count) == [1, 2, 1])
        #expect(shown.map(\.opensRun) == [true, true, false])
        #expect(shown.map(\.closesRun) == [true, false, true])
        #expect(shown[0].bubbles.map(\.position) == [.alone])
        #expect(shown[1].bubbles.map(\.position) == [.first, .middle])
        #expect(shown[2].bubbles.map(\.position) == [.last])
        #expect(shown[1].bubbles.map(\.id) == ["drafted-0", "drafted-1"])
    }

    @Test func aLongPauseClosesTheRun() {
        let entries = [
            message("a", "First.", at: at(9, 0)),
            message("b", "Right after.", at: at(9, 1)),
            message("c", "Much later.", at: at(9, 30)),
        ]
        let shown = ThreadLayout.mark(entries, time: time)

        #expect(shown.map(\.opensRun) == [true, false, true])
        #expect(shown.map(\.closesRun) == [false, true, true])
        #expect(shown.flatMap(\.bubbles).map(\.position) == [.first, .last, .alone])
    }

    @Test func aPersonsMessageIsOneBubbleWhateverItHolds() {
        let text =
            "Compare the last two releases.\n\nI want three things:\n- what shipped\n- what broke\n\n```\nlet a = 1\n\nlet b = 2\n```\n\nKeep each one to a line.\n"
        let shown = ThreadLayout.mark(
            [message("ask", text, at: at(9, 0), isYours: true)], time: time)

        #expect(shown[0].bubbles.map(\.id) == ["ask-0"])
        #expect(
            shown[0].bubbles.map { String($0.text.characters) } == [
                text.trimmingCharacters(in: .whitespacesAndNewlines)
            ])
        #expect(shown[0].bubbles.map(\.position) == [.alone])
    }

    @Test func twoMessagesSentInARowAreTwoBubbles() {
        let entries = [
            message("compare", "Compare them.\n\nKeep it short.", at: at(9, 0), isYours: true),
            message("figures", "Use the real numbers.", at: at(9, 1), isYours: true),
        ]
        let shown = ThreadLayout.mark(entries, time: time)

        #expect(shown.map(\.bubbles.count) == [1, 1])
        #expect(shown.flatMap(\.bubbles).map(\.position) == [.first, .last])
    }

    @Test func aCompanionsMessageSplitsIntoOneBubblePerParagraph() {
        let text = "Drafted.\n\nThree sections.\n\n- new\n- fixed"
        let shown = ThreadLayout.mark([message("reply", text, at: at(9, 0))], time: time)

        #expect(shown[0].bubbles.map(\.id) == ["reply-0", "reply-1", "reply-2"])
        #expect(shown[0].bubbles.map(\.position) == [.first, .middle, .last])
        #expect(shown[0].bubbles.map { $0.markdown?.blocks.count } == [1, 1, 1])
        #expect(shown[0].bubbles.allSatisfy { $0.markdown?.shownText == text })
    }

    @Test func aStreamingReplyKeepsEachBubbleItAlreadyShows() {
        var reply = message("reply", "Drafted.", at: at(9, 0))
        reply.append("\n\nTag it with")
        let before = reply.bubbles.map(\.id)
        reply.append(":\n\n```sh\ngit tag v4.2.0\n```\n\nDone")

        #expect(before == ["reply-0", "reply-1"])
        #expect(reply.bubbles.map(\.id) == ["reply-0", "reply-1", "reply-2"])
        #expect(reply.bubbles[1].markdown?.blocks.count == 2)
    }

    @Test func aPersonsMessageIsNeverParsed() {
        let shown = ThreadLayout.mark(
            [message("ask", "# Not a heading\n\n- nor a list", at: at(9, 0), isYours: true)],
            time: time)

        #expect(shown[0].bubbles[0].markdown == nil)
        #expect(String(shown[0].bubbles[0].text.characters) == "# Not a heading\n\n- nor a list")
    }

    @Test func eachDayOpensWithItsSeparatorAndEachMessageCarriesItsTime() {
        let entries = [
            message("old", "Last week.", at: at(14, 5, daysAgo: 9)),
            message("yesterday", "Yesterday.", at: at(18, 20, daysAgo: 1)),
            message("today", "Today.", at: at(9, 38), isYours: true),
            message("again", "Still today.", at: at(9, 39), isYours: true),
        ]
        let shown = ThreadLayout.mark(entries, time: time)

        #expect(shown.map(\.dayLabel) == ["10/01", "Yesterday", "Today", nil])
        #expect(
            shown.map(\.time) == [
                "2:05\u{202F}PM", "6:20\u{202F}PM", "9:38\u{202F}AM", "9:39\u{202F}AM",
            ])
    }

    @Test func aPersonsRunShowsTheNameOnItsFirstMessageAndTheAvatarOnItsLast() {
        let ada = MessageAuthor.person(accountId: "acc-ada", name: "Ada Lovelace")
        let host = MessageAuthor.person(accountId: nil, name: ThreadAuthorship.unnamed)
        let entries = [
            ThreadMessage(id: "you", writer: .you, text: "Ship it?", sentAt: at(9, 0)),
            ThreadMessage(id: "ada-1", writer: ada, text: "Not yet.", sentAt: at(9, 1)),
            ThreadMessage(id: "ada-2", writer: ada, text: "One fix left.", sentAt: at(9, 2)),
            ThreadMessage(id: "host", writer: host, text: "Go ahead.", sentAt: at(9, 3)),
            ThreadMessage(id: "ada-3", writer: ada, text: "Fine.", sentAt: at(9, 4)),
            message("bot", "Tagging.", at: at(9, 5), by: atlas, inGroup: true),
        ]
        let shown = ThreadLayout.mark(entries, time: time)

        #expect(shown.map(\.opensRun) == [true, true, false, true, true, true])
        #expect(shown.map(\.closesRun) == [true, false, true, true, true, true])
        #expect(
            shown.map(\.authorName) == [
                nil, "Ada Lovelace", "Ada Lovelace", "No name", "Ada Lovelace", "Atlas",
            ])
        #expect(shown.map(\.initials) == ["", "AL", "AL", "NN", "AL", ""])
        #expect(shown.map(\.isYours) == [true, false, false, false, false, false])
        #expect(shown[1].bubbles.map(\.position) == [.first])
        #expect(shown[2].bubbles.map(\.position) == [.last])
    }

    @Test func aPersonsMessageKeepsItsParagraphsInOneBubble() {
        let ada = MessageAuthor.person(accountId: "acc-ada", name: "Ada")
        let shown = ThreadLayout.mark(
            [ThreadMessage(id: "ada", writer: ada, text: "One.\n\nTwo.", sentAt: at(9, 0))],
            time: time)

        #expect(shown[0].bubbles.map { String($0.text.characters) } == ["One.\n\nTwo."])
    }

    @Test func aGroupRunNamesItsAuthorOnceAndBreaksWhenTheAuthorChanges() {
        let entries = [
            message("m1", "Merged.", at: at(9, 4), by: juniper, inGroup: true),
            message("m2", "Tagging next.", at: at(9, 5), by: juniper, inGroup: true),
            message("m3", "Splitting.", at: at(9, 6), by: atlas, inGroup: true),
        ]
        let shown = ThreadLayout.mark(entries, time: time)

        #expect(shown.map(\.author?.name) == ["Juniper", "Juniper", "Atlas"])
        #expect(shown.map(\.opensRun) == [true, false, true])
        #expect(shown.map(\.closesRun) == [false, true, true])
    }

    @Test func aSoloReplyHasNoNamedAuthor() {
        let shown = ThreadLayout.mark(releaseNotes, time: time)

        #expect(shown.map(\.author) == [nil, nil, nil])
    }

    @Test func aMessageStillEmptyTakesNoPlaceInTheRun() {
        let entries = [
            message("a", "Before.", at: at(9, 0)),
            message("streaming", "", at: at(9, 1)),
        ]
        let shown = ThreadLayout.mark(entries, time: time)

        #expect(shown[0].closesRun)
        #expect(shown[0].bubbles.map(\.position) == [.alone])
        #expect(shown[1].bubbles.isEmpty)
    }

    @Test func theWorkingClockReadsLikeTheMac() {
        let start = Date(timeIntervalSince1970: 0)

        #expect(ConversationTime.elapsed(since: start, at: start.addingTimeInterval(12)) == "12s")
        #expect(
            ConversationTime.elapsed(since: start, at: start.addingTimeInterval(65)) == "1m 05s")
        #expect(ConversationTime.elapsed(since: start, at: start.addingTimeInterval(-3)) == "0s")
    }
}

extension ThreadStoreTests {
    @Test func theThreadSplitsARepliedParagraphIntoBubblesAndTimesEachMessage() async {
        let host = TestHost(messages: [
            "chat-juniper": [
                TestHost.message(
                    "m1", in: "chat-juniper", seq: 1, isYours: false,
                    "Drafted.\n\nApplications first.",
                    at: 1_791_000_000_000)
            ]
        ])
        let store = makeStore()
        let (connection, following) = await follow(host, store)

        let shown = store.entries
        #expect(
            shown.first?.bubbles.map(\.markdown?.blocks) == [
                [.paragraph(MarkdownInline(plain: "Drafted."))],
                [.paragraph(MarkdownInline(plain: "Applications first."))],
            ])
        #expect(shown.first?.dayLabel == "Today")
        #expect(shown.first?.time.isEmpty == false)
        following.cancel()
        await connection.stop()
    }

    @Test func anEmptyThreadLoadsWithNoEntryAndNobodyWorking() async {
        let store = makeStore()
        let (connection, following) = await follow(TestHost(), store)

        #expect(store.phase == .loaded)
        #expect(store.entries.isEmpty)
        #expect(!store.isWorking)
        #expect(store.workingSince == nil)
        following.cancel()
        await connection.stop()
    }

    @Test func theWorkingClockStartsWithTheTurnAndStopsWithIt() async {
        let host = TestHost()
        let store = makeStore()
        let (connection, following) = await follow(host, store)

        host.pushAgent("chat-juniper", #"{"type":"turnChanged","state":"running"}"#)
        await waitUntil { store.isWorking }
        #expect(store.workingSince == sentAt)

        host.pushAgent(
            "chat-juniper", #"{"type":"turnEnded","ended":{"sessionId":null,"outcome":"success"}}"#)
        await waitUntil { !store.isWorking }
        #expect(store.workingSince == nil)
        following.cancel()
        await connection.stop()
    }

    @Test func anOfflineHostKeepsTheBubblesOnScreen() async {
        let host = TestHost(messages: ["chat-juniper": twoDays])
        let store = makeStore()
        let (connection, following) = await follow(host, store)

        host.socket.push(.close(RelayClosure.hostOffline))
        await waitUntil { !store.isReachable }

        #expect(store.entries.map(\.bubbles.count) == [1, 1, 1])
        #expect(!store.canSend)
        following.cancel()
        await connection.stop()
    }
}
