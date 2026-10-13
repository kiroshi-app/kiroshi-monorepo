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
    var working: ThreadWorking? { get }
    var draft: String { get set }
    var attachments: [PickedAttachment] { get set }
    var placeholder: String { get }
    var problem: String? { get }
    var canSend: Bool { get }
    var isSending: Bool { get }
    var canStop: Bool { get }
    var mentionCandidates: [Companion] { get }

    func mention(_ companion: Companion)
    @discardableResult func send() -> Task<Void, Never>?
    @discardableResult func stop() -> Task<Void, Never>?
    @discardableResult func reload() -> Task<Void, Never>?
    func follow(_ connection: RelayConnection) async
}
