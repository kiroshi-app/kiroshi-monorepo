import Foundation
import Observation

struct CompanionWorker: Equatable, Sendable {
    let scope: AgentEvent.Scope
    let conversationId: String
    let since: Date

    var companionId: Companion.ID {
        scope.botId
    }
}

struct WaitingQuestion: Equatable, Sendable {
    let scope: AgentEvent.Scope
    let turnId: String?
    let request: QuestionRequest

    var conversationId: String {
        scope.conversationId
    }
}

@MainActor
@Observable
final class CompanionWork {
    private(set) var workers: [CompanionWorker] = []
    private(set) var questions: [WaitingQuestion] = []

    @ObservationIgnored private var settledQuestionIds: Set<String> = []
    @ObservationIgnored private let now: () -> Date

    init(now: @escaping () -> Date = Date.init) {
        self.now = now
    }

    func workers(in conversationId: String?) -> [CompanionWorker] {
        guard let conversationId else { return [] }
        return workers.filter { $0.conversationId == conversationId }
    }

    func question(in conversationId: String?) -> WaitingQuestion? {
        guard let conversationId else { return nil }
        return questions.first { $0.conversationId == conversationId }
    }

    func question(_ id: String) -> WaitingQuestion? {
        questions.first { $0.request.id == id }
    }

    func settleQuestion(_ id: String) {
        settledQuestionIds.insert(id)
        questions.removeAll { $0.request.id == id }
    }

    func apply(_ update: RelayUpdate) {
        switch update {
        case .state(.online):
            break
        case .state:
            forget()
        case .event(let event):
            guard case .agent(let agent)? = ConversationEvent(event) else { return }
            hear(agent)
        }
    }

    func hear(_ event: AgentEvent) {
        guard let scope = event.scope else { return }
        hearQuestion(event.change, in: scope, turnId: event.turn?.turnId)
        guard let turn = event.turn else { return }
        let index = workers.firstIndex { $0.scope.isSameRun(as: scope) }
        if event.change.closesWork, let index {
            workers.remove(at: index)
        } else if event.change.opensWork, index == nil {
            workers.append(
                CompanionWorker(scope: scope, conversationId: turn.conversationId, since: now()))
        }
    }

    func forget() {
        workers = []
        questions = []
        settledQuestionIds = []
    }

    private func hearQuestion(
        _ change: AgentEvent.Change, in scope: AgentEvent.Scope, turnId: String?
    ) {
        switch change {
        case .questionRequested(let request):
            guard !request.questions.isEmpty, !settledQuestionIds.contains(request.id),
                question(request.id) == nil
            else { return }
            questions.append(WaitingQuestion(scope: scope, turnId: turnId, request: request))
        case .permissionResolved(let id):
            settleQuestion(id)
        case .turnEnded, .failed:
            for asked in questions where asked.scope.isSameRun(as: scope) {
                settleQuestion(asked.request.id)
            }
        default:
            break
        }
    }
}
