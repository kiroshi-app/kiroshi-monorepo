import Foundation
import Testing

@testable import Kiroshi

struct MessageAuthorTests {
    let hosted = ThreadAuthorship(accountId: "acc-sam", isHostedByYou: true)
    let joined = ThreadAuthorship(accountId: "acc-sam", isHostedByYou: false)

    @Test func yourAccountIsYouWhereverTheSpaceIsHosted() {
        for authorship in [hosted, joined] {
            #expect(
                authorship.author(role: .user, botId: nil, accountId: "acc-sam", name: "Sam")
                    == .you)
        }
    }

    @Test func anotherMemberIsAPersonNamedByTheirAccount() {
        for authorship in [hosted, joined] {
            #expect(
                authorship.author(role: .user, botId: nil, accountId: "acc-ada", name: "Ada")
                    == .person(accountId: "acc-ada", name: "Ada"))
        }
    }

    @Test func aCompanionStaysACompanion() {
        #expect(
            joined.author(role: .assistant, botId: "atlas", accountId: nil, name: nil)
                == .companion("atlas"))
        #expect(
            hosted.author(role: .user, botId: "atlas", accountId: nil, name: nil)
                == .companion("atlas"))
    }

    @Test func noAuthorIsYouInASpaceYouHost() {
        #expect(hosted.author(role: .user, botId: nil, accountId: nil, name: nil) == .you)
    }

    @Test func noAuthorIsTheHostInASpaceYouJoined() {
        #expect(
            joined.author(role: .user, botId: nil, accountId: nil, name: "Ignored")
                == .person(accountId: nil, name: "No name"))
    }

    @Test func aMemberWithoutANameIsNoName() {
        for name in [nil, "", "   "] {
            #expect(
                joined.author(role: .user, botId: nil, accountId: "acc-ada", name: name)
                    == .person(accountId: "acc-ada", name: "No name"))
        }
    }

    @Test func withoutYourAccountIdEveryPersonsMessageStaysYours() {
        let olderSession = ThreadAuthorship(accountId: nil, isHostedByYou: false)
        for authorship in [olderSession, .unknownAccount] {
            #expect(
                authorship.author(role: .user, botId: nil, accountId: "acc-sam", name: "Sam")
                    == .you)
            #expect(authorship.author(role: .user, botId: nil, accountId: nil, name: nil) == .you)
            #expect(
                authorship.author(role: .assistant, botId: "atlas", accountId: nil, name: nil)
                    == .companion("atlas"))
        }
    }

    @Test func initialsAreTheFirstLetterOfTheFirstTwoWords() {
        #expect(Initials.of("Ada Lovelace") == "AL")
        #expect(Initials.of("ada") == "A")
        #expect(Initials.of("Jean Paul Sartre") == "JP")
        #expect(Initials.of("  émile   zola ") == "ÉZ")
        #expect(Initials.of("No name") == "NN")
    }

    @Test func readsTheAuthorAccountOfAStoredMessage() throws {
        let json = FixtureHost.messageJSON(
            id: "m1", conversationId: "c1", seq: 1, role: "user", content: "Hi", createdAt: 1,
            authorAccountId: "acc-ada", authorName: "Ada")
        let message = try JSONDecoder().decode(TranscriptMessage.self, from: Data(json.utf8))
        let mission = try JSONDecoder().decode(MissionThreadMessage.self, from: Data(json.utf8))

        #expect(message.authorAccountId == "acc-ada")
        #expect(message.authorName == "Ada")
        #expect(mission.authorAccountId == "acc-ada")
        #expect(mission.authorName == "Ada")
    }

    @Test func aMessageWithoutTheAuthorFieldsStillReads() throws {
        let json =
            #"{"id":"m1","conversationId":"c1","seq":1,"role":"user","content":"Hi","completion":"complete","createdAt":1,"authorBotId":null}"#
        let message = try JSONDecoder().decode(TranscriptMessage.self, from: Data(json.utf8))
        let mission = try JSONDecoder().decode(MissionThreadMessage.self, from: Data(json.utf8))

        #expect(message.authorAccountId == nil)
        #expect(message.authorName == nil)
        #expect(mission.authorAccountId == nil)
    }

    @Test func onlyYourOwnMessagesReadYouInTheList() {
        let sentAt = Date(milliseconds: 1)
        let atlas = Companion(id: "atlas", name: "Atlas")

        #expect(MessagePreview(text: "Hi", writer: .you, sentAt: sentAt).line == "You: Hi")
        #expect(
            MessagePreview(
                text: "Hi", writer: .person(accountId: "acc-ada", name: "Ada"), sentAt: sentAt
            ).line(among: [atlas]) == "Hi")
        #expect(
            MessagePreview(text: "Hi", writer: .companion("atlas"), sentAt: sentAt).line(
                among: [atlas]) == "Atlas: Hi")
        #expect(
            MessagePreview(text: "Hi", writer: .companion("atlas"), sentAt: sentAt).line == "Hi")
    }

    @Test func aLastWordWithoutACompanionReadsAsTheHosts() {
        let word = LastWord(text: "Hi", at: 1, authorBotId: nil)
        let spoken = LastWord(text: "Hi", at: 1, authorBotId: "atlas")

        #expect(MessagePreview(word, authorship: hosted).line == "You: Hi")
        #expect(MessagePreview(word, authorship: joined).line == "Hi")
        #expect(MessagePreview(spoken, authorship: hosted).writer == .companion("atlas"))
    }
}
