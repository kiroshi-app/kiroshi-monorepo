enum MissionGroup: CaseIterable, Sendable {
    case needsYou
    case working
    case review

    init?(_ state: Mission.State) {
        switch state {
        case .waitingHuman: self = .needsYou
        case .working, .waitingBot: self = .working
        case .readyToMerge: self = .review
        case .failed, .done, .closed: return nil
        }
    }

    init?(_ liveness: Mission.Liveness) {
        switch liveness {
        case .needsYou: self = .needsYou
        case .working, .idle: self = .working
        case .readyToMerge: self = .review
        case .failed, .done, .closed: return nil
        }
    }

    var title: String {
        switch self {
        case .needsYou: "Needs you"
        case .working: "Working"
        case .review: "Review"
        }
    }
}

struct MissionSection: Identifiable, Equatable, Sendable {
    let group: MissionGroup
    let missions: [Mission]

    var id: MissionGroup { group }

    static func sections(of entries: [MissionInSpace]) -> [MissionSection] {
        let ordered = entries.map(\.mission).sorted(by: movedLater)
        return MissionGroup.allCases.compactMap { group in
            let missions = ordered.filter { $0.group == group }
            return missions.isEmpty ? nil : MissionSection(group: group, missions: missions)
        }
    }

    private static func movedLater(_ one: Mission, than other: Mission) -> Bool {
        let (oneMoved, otherMoved) = (one.lastMovedAt, other.lastMovedAt)
        return oneMoved == otherMoved ? one.id < other.id : oneMoved > otherMoved
    }
}

extension Mission {
    var lastMovedAt: Int {
        max(openedAt, lastActivityAt ?? 0, closedAt ?? 0)
    }

    var group: MissionGroup? {
        guard let liveness else { return MissionGroup(state) }
        return MissionGroup(liveness)
    }

    var isWorking: Bool {
        liveness.map { $0 == .working } ?? isAgentRunning
    }

    var statusLine: String {
        if group == .review { return "Ready to merge" }
        if isWorking, group == .working { return "Working now" }
        let written = status?.text.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !written.isEmpty { return written }
        return group == .needsYou ? "Blocked on you" : "Working now"
    }

    func titleLine(companion: MissionCompanion?) -> String {
        [ticket.externalId, companion?.name, companion?.role].compactMap(\.self).joined(
            separator: " · ")
    }

    func detailLine(companion: MissionCompanion?) -> String {
        [companion?.name, statusLine].compactMap(\.self).joined(separator: " · ")
    }

    func moved(by changed: MissionChanged) -> Mission {
        var moved = self
        moved.isAgentRunning = changed.isAgentRunning
        moved.lastActivityAt = changed.lastActivityAt
        if changed.stateSeq >= stateSeq {
            moved.state = changed.state
            moved.stateSeq = changed.stateSeq
            moved.liveness = changed.liveness
        }
        return moved
    }
}
