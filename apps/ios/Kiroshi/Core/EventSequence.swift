import Foundation

struct StampedEvent: Sendable {
    let event: RelayEvent
    let epoch: String
    let seq: Int
    let token: String?
}

struct RelayResume: Encodable, Equatable, Sendable {
    let epoch: String
    let since: Int
    let token: String
}

struct SequenceOutcome: Sendable {
    var rereads = false
    var applied: [RelayEvent] = []
    var resume: RelayResume?
}

struct EventSequence: Sendable {
    static let heldFramesBound = 1024
    static let heldBytesBound = 4 * 1024 * 1024

    private struct Applied: Sendable {
        let epoch: String
        var seq: Int
    }

    private struct Resuming: Sendable {
        let token: String
        var held: [Int: RelayEvent] = [:]
        var heldBytes = 0
    }

    private enum State: Sendable {
        case unknown
        case applied(Applied)
        case resuming(Applied, Resuming)
    }

    private var state = State.unknown
    private let makeToken: @Sendable () -> String

    init(makeToken: @escaping @Sendable () -> String = { UUID().uuidString }) {
        self.makeToken = makeToken
    }

    var pendingToken: String? {
        guard case .resuming(_, let resuming) = state else { return nil }
        return resuming.token
    }

    mutating func opened() -> SequenceOutcome {
        switch state {
        case .applied(let applied):
            return resumed(from: applied)
        case .unknown, .resuming:
            state = .unknown
            return SequenceOutcome(rereads: true)
        }
    }

    mutating func closed() {
        guard case .resuming(let applied, _) = state else { return }
        state = .applied(applied)
    }

    mutating func resynced() -> SequenceOutcome {
        switch state {
        case .applied(let applied), .resuming(let applied, _):
            return resumed(from: applied)
        case .unknown:
            return SequenceOutcome(rereads: true)
        }
    }

    mutating func heard(_ stamped: StampedEvent) -> SequenceOutcome {
        if let token = stamped.token, token != pendingToken {
            return SequenceOutcome()
        }
        switch state {
        case .applied(var applied) where applied.epoch == stamped.epoch:
            if stamped.seq <= applied.seq {
                return SequenceOutcome()
            }
            if stamped.seq == applied.seq + 1 {
                applied.seq = stamped.seq
                state = .applied(applied)
                return SequenceOutcome(applied: [stamped.event])
            }
            let outcome = resumed(from: applied)
            hold(stamped)
            return isOverHeldBound ? forgotten() : outcome
        case .resuming(let applied, _) where applied.epoch == stamped.epoch:
            guard stamped.seq > applied.seq else { return SequenceOutcome() }
            hold(stamped)
            return isOverHeldBound ? forgotten() : SequenceOutcome()
        case .unknown:
            return adopted(stamped)
        case .applied, .resuming:
            var outcome = adopted(stamped)
            outcome.rereads = true
            return outcome
        }
    }

    mutating func answered(token: String, isTooOld: Bool) -> SequenceOutcome {
        guard case .resuming(var caughtUp, let resuming) = state, resuming.token == token else {
            return SequenceOutcome()
        }
        guard !isTooOld else { return forgotten() }
        let held = resuming.held.sorted { $0.key < $1.key }
        caughtUp.seq = held.last?.key ?? caughtUp.seq
        state = .applied(caughtUp)
        return SequenceOutcome(applied: held.map(\.value))
    }

    mutating func lapsed(token: String) -> SequenceOutcome {
        guard pendingToken == token else { return SequenceOutcome() }
        return forgotten()
    }

    private var isOverHeldBound: Bool {
        guard case .resuming(_, let resuming) = state else { return false }
        return resuming.held.count > Self.heldFramesBound
            || resuming.heldBytes > Self.heldBytesBound
    }

    private mutating func resumed(from applied: Applied) -> SequenceOutcome {
        let token = makeToken()
        state = .resuming(applied, Resuming(token: token))
        return SequenceOutcome(
            resume: RelayResume(epoch: applied.epoch, since: applied.seq, token: token))
    }

    private mutating func hold(_ stamped: StampedEvent) {
        guard case .resuming(let applied, var resuming) = state else { return }
        if let replaced = resuming.held.updateValue(stamped.event, forKey: stamped.seq) {
            resuming.heldBytes -= replaced.frame.count
        }
        resuming.heldBytes += stamped.event.frame.count
        state = .resuming(applied, resuming)
    }

    private mutating func adopted(_ stamped: StampedEvent) -> SequenceOutcome {
        state = .applied(Applied(epoch: stamped.epoch, seq: stamped.seq))
        return SequenceOutcome(applied: [stamped.event])
    }

    private mutating func forgotten() -> SequenceOutcome {
        state = .unknown
        return SequenceOutcome(rereads: true)
    }
}
