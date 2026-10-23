import Foundation
import Observation

enum ThreadKind: Equatable {
    case conversation
    case mission
}

enum ThreadState: Equatable {
    case loading
    case shown
    case empty
    case failed
}

struct ThreadWorking: Equatable {
    let companion: Companion?
    let name: String
    let isSeveral: Bool
    let since: Date?

    var spoken: String {
        isSeveral
            ? String(localized: "\(name) are working…") : String(localized: "\(name) is working…")
    }
}

struct ThreadOpening: Equatable {
    let day: String
    let line: String
}

@MainActor
protocol ThreadModel: AnyObject, Observable {
    var kind: ThreadKind { get }
    var state: ThreadState { get }
    var entries: [ThreadMessage] { get }
    var lastSentId: ThreadMessage.ID? { get }
    var working: ThreadWorking? { get }
    var draft: String { get set }
    var attachments: [PickedAttachment] { get set }
    var placeholder: String { get }
    var problem: String? { get }
    var canSend: Bool { get }
    var isSending: Bool { get }
    var canStop: Bool { get }
    var mentionCandidates: [Companion] { get }
    var hasOlder: Bool { get }
    var olderFailed: Bool { get }

    func questionCard(_ id: String) -> QuestionCardState?
    func mention(_ companion: Companion)
    @discardableResult func send() -> Task<Void, Never>?
    @discardableResult func stop() -> Task<Void, Never>?
    @discardableResult func answer(_ draft: QuestionDraft) -> Task<Void, Never>?
    @discardableResult func reload() -> Task<Void, Never>?
    func loadOlder()
    func follow(_ connection: RelayConnection) async
}

extension ThreadModel {
    func questionCard(_ id: String) -> QuestionCardState? {
        nil
    }

    @discardableResult func answer(_ draft: QuestionDraft) -> Task<Void, Never>? {
        nil
    }
}
