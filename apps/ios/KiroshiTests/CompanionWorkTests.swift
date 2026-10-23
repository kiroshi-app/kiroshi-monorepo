import Foundation
import Testing

@testable import Kiroshi

@MainActor
struct CompanionWorkTests {
    let startedAt = Date(milliseconds: 1_791_000_000_000)

    nonisolated static let format = QuestionRequest(
        id: "q1",
        questions: [
            QuestionRequest.Asked(
                header: "Format", question: "Which format should the release notes take?",
                options: [
                    QuestionRequest.Option(label: "Summary", description: nil),
                    QuestionRequest.Option(label: "Full changelog", description: nil),
                ], multiSelect: false)
        ])

    @Test func aQuestionWaitsInItsConversationUntilItIsAnswered() {
        let work = CompanionWork()

        work.hear(event(.questionRequested(Self.format)))
        #expect(work.question(in: "c-1")?.request == Self.format)
        #expect(work.question(in: "c-1")?.turnId == "t-juniper")
        #expect(work.question(in: "c-2") == nil)

        work.hear(event(.permissionResolved(id: "q1")))
        #expect(work.question(in: "c-1") == nil)
    }

    @Test(arguments: [AgentEvent.Change.turnEnded, .failed])
    func aQuestionLeftWhenItsTurnEndsIsDropped(_ change: AgentEvent.Change) {
        let work = CompanionWork()

        work.hear(event(.questionRequested(Self.format)))
        work.hear(event(change, by: "atlas"))
        #expect(work.question("q1") != nil)

        work.hear(event(change))
        #expect(work.questions.isEmpty)
    }

    @Test func aReplayedQuestionAlreadySettledStaysSettled() {
        let work = CompanionWork()
        work.hear(event(.questionRequested(Self.format)))
        work.hear(event(.permissionResolved(id: "q1")))

        work.hear(event(.questionRequested(Self.format)))

        #expect(work.questions.isEmpty)
    }

    @Test func aQuestionHeardTwiceWaitsOnce() {
        let work = CompanionWork()

        work.hear(event(.questionRequested(Self.format)))
        work.hear(event(.questionRequested(Self.format)))

        #expect(work.questions.count == 1)
    }

    @Test func aQuestionWithoutQuestionsNeverWaits() {
        let work = CompanionWork()

        work.hear(event(.questionRequested(QuestionRequest(id: "q0", questions: []))))

        #expect(work.questions.isEmpty)
        #expect(working(work) == ["juniper"])
    }

    @Test func aDroppedSocketForgetsTheQuestionsAndTheirSettling() {
        let work = CompanionWork()
        work.hear(event(.questionRequested(Self.format)))
        work.hear(event(.permissionResolved(id: "q1")))

        work.apply(.state(.unreachable))
        work.hear(event(.questionRequested(Self.format)))

        #expect(work.question("q1") != nil)
    }

    func scope(_ botId: String, in conversationId: String = "c-1", session: String? = nil)
        -> AgentEvent.Scope
    {
        AgentEvent.Scope(
            conversationId: conversationId, botId: botId,
            runtimeSessionId: session ?? "session-\(botId)", epoch: 1)
    }

    func event(
        _ change: AgentEvent.Change, by botId: String = "juniper", in conversationId: String = "c-1"
    ) -> AgentEvent {
        AgentEvent(
            scope: scope(botId, in: conversationId),
            turn: AgentEvent.Turn(turnId: "t-\(botId)", conversationId: conversationId),
            change: change)
    }

    func working(_ work: CompanionWork, in conversationId: String = "c-1") -> [String] {
        work.workers(in: conversationId).map(\.companionId)
    }

    @Test(arguments: [
        AgentEvent.Change.turn(.submitting), .turn(.running), .turn(.stopping),
        .activity(AgentEvent.Activity(kind: .tool)),
        .activity(AgentEvent.Activity(kind: .permission)),
        .permissionRequested, .questionRequested(CompanionWorkTests.format),
    ])
    func whatTheCompanionStartsDoingShowsItWorking(_ change: AgentEvent.Change) {
        let work = CompanionWork(now: { [startedAt] in startedAt })

        work.hear(event(change))

        #expect(working(work) == ["juniper"])
        #expect(work.workers.first?.since == startedAt)
    }

    @Test(arguments: [
        AgentEvent.Change.turn(.idle), .turn(.failed),
        .messageStarted(AgentEvent.Message(id: "m", role: .assistant, text: "", timestamp: 0)),
        .messageDelta(id: "m", text: "Hi"), .turnEnded, .failed, .other,
    ])
    func whatNeverStartsWorkLeavesTheThreadAtRest(_ change: AgentEvent.Change) {
        let work = CompanionWork()

        work.hear(event(change))

        #expect(working(work).isEmpty)
    }

    @Test func aQuestionKeepsTheCompanionWorkingThroughAnIdleTurnUntilItsTurnEnds() {
        let work = CompanionWork()

        work.hear(event(.turn(.running)))
        work.hear(event(.questionRequested(Self.format)))
        work.hear(event(.turn(.idle)))
        work.hear(
            event(
                .messageCompleted(
                    AgentEvent.Message(id: "m", role: .assistant, text: "Which?", timestamp: 0))))
        #expect(working(work) == ["juniper"])

        work.hear(event(.turnEnded))
        #expect(working(work).isEmpty)
    }

    @Test func aFailureClosesTheWorkAndANewActivityReopensIt() {
        let work = CompanionWork()

        work.hear(event(.turn(.running)))
        work.hear(event(.failed))
        #expect(working(work).isEmpty)

        work.hear(event(.activity(AgentEvent.Activity(kind: .tool))))
        #expect(working(work) == ["juniper"])
    }

    @Test func twoCompanionsWorkSideBySideAndEachStopsOnItsOwn() {
        let work = CompanionWork()

        work.hear(event(.turn(.running), by: "juniper"))
        work.hear(event(.turn(.running), by: "atlas"))
        work.hear(event(.activity(AgentEvent.Activity(kind: .tool)), by: "juniper"))
        #expect(working(work) == ["juniper", "atlas"])

        work.hear(event(.turnEnded, by: "juniper"))
        #expect(working(work) == ["atlas"])
    }

    @Test func eachConversationKeepsItsOwnWorkers() {
        let work = CompanionWork()

        work.hear(event(.turn(.running), by: "juniper", in: "c-1"))
        work.hear(event(.turn(.running), by: "atlas", in: "thread-212"))

        #expect(working(work, in: "c-1") == ["juniper"])
        #expect(working(work, in: "thread-212") == ["atlas"])
        #expect(work.workers(in: nil).isEmpty)
    }

    @Test func anEventWithoutATurnOrAScopeIsNotTheConversationsWork() {
        let work = CompanionWork()

        work.hear(AgentEvent(scope: scope("juniper"), change: .turn(.running)))
        work.hear(
            AgentEvent(
                scope: nil, turn: AgentEvent.Turn(turnId: "t", conversationId: "c-1"),
                change: .turn(.running)))

        #expect(work.workers.isEmpty)
    }

    @Test func aDroppedConnectionForgetsWhoWorksSinceNoEventIsReplayed() {
        let work = CompanionWork()
        work.hear(event(.turn(.running)))

        work.apply(.state(.online(sharedSpaceId: "s-1")))
        #expect(working(work) == ["juniper"])

        work.apply(.state(.hostOffline))
        #expect(work.workers.isEmpty)
    }

    @Test func theMemberSocketFrameCarriesTheTurnAndThePrompts() throws {
        let frame =
            #"{"scope":{"conversationId":"c-1","botId":"juniper","runtimeSessionId":"r1","epoch":2},"turn":{"turnId":"t1","conversationId":"c-1"},"event":{"type":"permissionRequested","request":{"id":"p1","toolName":"Bash","title":"Run git push","detail":null}}}"#

        let event = try JSONDecoder().decode(AgentEvent.self, from: Data(frame.utf8))

        #expect(event.turn == AgentEvent.Turn(turnId: "t1", conversationId: "c-1"))
        #expect(event.change == .permissionRequested)
        #expect(
            try JSONDecoder().decode(
                AgentEvent.self,
                from: Data(#"{"scope":null,"event":{"type":"failed","error":"crashed"}}"#.utf8)
            ).change == .failed)
    }
}
