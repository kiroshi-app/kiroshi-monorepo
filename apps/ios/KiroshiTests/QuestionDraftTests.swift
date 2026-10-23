import Foundation
import Testing

@testable import Kiroshi

struct QuestionDraftTests {
    static let format = QuestionRequest.Asked(
        header: "Format", question: "Which format should the release notes take?",
        options: [
            QuestionRequest.Option(label: "Summary", description: "One line per change"),
            QuestionRequest.Option(label: "Full changelog", description: nil),
            QuestionRequest.Option(label: "Blog post", description: nil),
        ], multiSelect: false)
    static let sections = QuestionRequest.Asked(
        header: "Sections", question: "Which sections should the notes include?",
        options: [
            QuestionRequest.Option(label: "New features", description: nil),
            QuestionRequest.Option(label: "Fixes", description: nil),
            QuestionRequest.Option(label: "Breaking changes", description: nil),
        ], multiSelect: true)
    static let audience = QuestionRequest.Asked(
        header: "Audience", question: "Who reads these notes first?",
        options: [
            QuestionRequest.Option(label: "People using the app", description: nil),
            QuestionRequest.Option(label: "Developers", description: nil),
        ], multiSelect: false)

    func draft(_ questions: QuestionRequest.Asked...) -> QuestionDraft {
        QuestionDraft(request: QuestionRequest(id: "q1", questions: questions))
    }

    @Test func decodesTheWholeQuestionTheAgentAsks() throws {
        let json = #"""
            {"scope":{"conversationId":"c-1","botId":"juniper","runtimeSessionId":"r1","epoch":2},
             "turn":{"turnId":"t1","conversationId":"c-1"},
             "event":{"type":"questionRequested","request":{"id":"q1","subject":null,"questions":[
               {"header":"Format","question":"Which format?","multiSelect":false,"options":[
                 {"label":"Summary","description":"One line per change","preview":null},
                 {"label":"Full changelog","description":null,"preview":"## 4.2"}]},
               {"header":"Sections","question":"Which sections?","multiSelect":true,"options":[
                 {"label":"Fixes","description":"Bugs closed","preview":null},
                 {"label":"New","description":null,"preview":null}]}]}}}
            """#

        let event = try JSONDecoder().decode(AgentEvent.self, from: Data(json.utf8))

        let request = QuestionRequest(
            id: "q1",
            questions: [
                QuestionRequest.Asked(
                    header: "Format", question: "Which format?",
                    options: [
                        QuestionRequest.Option(
                            label: "Summary", description: "One line per change"),
                        QuestionRequest.Option(label: "Full changelog", description: nil),
                    ], multiSelect: false),
                QuestionRequest.Asked(
                    header: "Sections", question: "Which sections?",
                    options: [
                        QuestionRequest.Option(label: "Fixes", description: "Bugs closed"),
                        QuestionRequest.Option(label: "New", description: nil),
                    ], multiSelect: true),
            ])
        #expect(event.change == .questionRequested(request))
        #expect(event.turn?.turnId == "t1")
        #expect(request.messageId == "question-q1")
    }

    @Test func decodesTheResolutionOfAQuestion() throws {
        let json =
            #"{"scope":null,"event":{"type":"permissionResolved","id":"q1","decision":"allowOnce"}}"#

        let event = try JSONDecoder().decode(AgentEvent.self, from: Data(json.utf8))

        #expect(event.change == .permissionResolved(id: "q1"))
    }

    @Test func aQuestionWithoutItsRequestIsNoQuestion() throws {
        let json = #"{"scope":null,"event":{"type":"questionRequested"}}"#

        let event = try JSONDecoder().decode(AgentEvent.self, from: Data(json.utf8))

        #expect(event.change == .other)
    }

    @Test func readsTheQuestionIdOfItsStoredRow() {
        #expect(QuestionRequest.id(ofMessage: "question-q1") == "q1")
        #expect(QuestionRequest.id(ofMessage: "m-1") == nil)
        #expect(QuestionRequest.id(ofMessage: nil) == nil)
    }

    @Test func aSingleSelectAnswersWithThePickedLabel() {
        var draft = draft(Self.format)
        #expect(!draft.canGoOn)

        draft.pick(Self.format.options[0])
        draft.pick(Self.format.options[1])

        #expect(draft.canGoOn)
        #expect(draft.isLast)
        #expect(draft.answers == [Self.format.question: "Full changelog"])
        #expect(draft.lines == [QuestionAnswerLine(header: "Format", answer: "Full changelog")])
    }

    @Test func aSegmentIsMarkedAnsweredOnceItsQuestionIsAnsweredAndLeft() {
        var draft = draft(Self.format, Self.audience, Self.sections)
        #expect(!draft.isMarkedAnswered(0))

        draft.pick(Self.format.options[0])
        #expect(!draft.isMarkedAnswered(0))

        _ = draft.goOn()
        draft.pick(Self.audience.options[0])
        #expect(draft.isMarkedAnswered(0))
        #expect(!draft.isMarkedAnswered(1))
        #expect(!draft.isMarkedAnswered(2))

        draft.show(0)
        #expect(!draft.isMarkedAnswered(0))
        #expect(draft.isMarkedAnswered(1))
    }

    @Test func aSkippedSegmentIsNotMarkedAnswered() {
        var draft = draft(Self.format, Self.audience)

        _ = draft.skip()

        #expect(draft.shown == 1)
        #expect(!draft.isMarkedAnswered(0))
    }

    @Test func aMultiSelectJoinsItsLabelsInPickOrder() {
        var draft = draft(Self.sections)

        draft.pick(Self.sections.options[1])
        draft.pick(Self.sections.options[0])
        draft.pick(Self.sections.options[2])
        draft.pick(Self.sections.options[2])

        #expect(draft.answers == [Self.sections.question: "Fixes, New features"])
    }

    @Test func otherTypedReplacesThePicksAndAPickClearsIt() {
        var draft = draft(Self.format)
        draft.pick(Self.format.options[0])

        draft.other = "  Changelog, user-facing only "
        #expect(!draft.isPicked(Self.format.options[0]))
        #expect(draft.answers == [Self.format.question: "Changelog, user-facing only"])

        draft.pick(Self.format.options[2])
        #expect(draft.other.isEmpty)
        #expect(draft.answers == [Self.format.question: "Blog post"])
    }

    @Test func blankOtherIsNoAnswer() {
        var draft = draft(Self.format)

        draft.other = "   "

        #expect(!draft.canGoOn)
        #expect(draft.answers.isEmpty)
    }

    @Test func severalQuestionsGoOnToTheNextOneWaitingThenSend() {
        var draft = draft(Self.format, Self.audience, Self.sections)
        draft.pick(Self.format.options[0])
        #expect(!draft.isLast)

        let sendsAfterFormat = draft.goOn()
        #expect(!sendsAfterFormat)
        #expect(draft.shown == 1)
        draft.pick(Self.audience.options[0])
        let sendsAfterAudience = draft.goOn()
        #expect(!sendsAfterAudience)
        #expect(draft.shown == 2)
        draft.pick(Self.sections.options[1])

        #expect(draft.isLast)
        let sendsAfterSections = draft.goOn()
        #expect(sendsAfterSections)
        #expect(
            draft.lines == [
                QuestionAnswerLine(header: "Format", answer: "Summary"),
                QuestionAnswerLine(header: "Audience", answer: "People using the app"),
                QuestionAnswerLine(header: "Sections", answer: "Fixes"),
            ])
    }

    @Test func skipLeavesTheQuestionUnansweredAndGoesOn() {
        var draft = draft(Self.format, Self.audience)
        draft.pick(Self.format.options[0])

        let sendsAfterSkippingFormat = draft.skip()
        #expect(!sendsAfterSkippingFormat)
        #expect(draft.shown == 1)
        #expect(draft.answers.isEmpty)

        draft.pick(Self.audience.options[1])
        #expect(draft.isLast)
        #expect(draft.answers == [Self.audience.question: "Developers"])
        #expect(draft.lines == [QuestionAnswerLine(header: "Audience", answer: "Developers")])

        draft.show(0)
        draft.pick(Self.format.options[1])
        #expect(draft.answers.count == 2)
        let sendsAfterSkippingTheLastOneWaiting = draft.skip()
        #expect(sendsAfterSkippingTheLastOneWaiting)
    }

    @Test func skippingTheOnlyQuestionSendsNoAnswer() {
        var draft = draft(Self.format)

        let sendsAfterSkippingTheOnlyOne = draft.skip()
        #expect(sendsAfterSkippingTheOnlyOne)
        #expect(draft.answers.isEmpty)
        #expect(draft.lines.isEmpty)
    }

    @Test func theRecordedAnswerJoinsEachAnswerInQuestionOrder() {
        let request = QuestionRequest(id: "q1", questions: [Self.format, Self.audience])

        let content = QuestionDraft.content(
            of: [Self.audience.question: "Developers", Self.format.question: "Summary"],
            to: request)

        #expect(content == "Summary\n\nDevelopers")
        #expect(
            QuestionDraft.lines(of: content, to: request) == [
                QuestionAnswerLine(header: "Format", answer: "Summary"),
                QuestionAnswerLine(header: "Audience", answer: "Developers"),
            ])
    }

    @Test func aRecordedAnswerThatDoesNotSplitKeepsItsWholeText() {
        let one = QuestionRequest(id: "q1", questions: [Self.format])
        let two = QuestionRequest(id: "q2", questions: [Self.format, Self.audience])

        #expect(
            QuestionDraft.lines(of: "A\n\nB", to: one) == [
                QuestionAnswerLine(header: "Format", answer: "A\n\nB")
            ])
        #expect(
            QuestionDraft.lines(of: "Summary", to: two) == [
                QuestionAnswerLine(header: nil, answer: "Summary")
            ])
        #expect(
            QuestionDraft.lines(of: "Summary", to: nil) == [
                QuestionAnswerLine(header: nil, answer: "Summary")
            ])
    }
}
