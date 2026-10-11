import Foundation

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
            let missions = ordered.filter { MissionGroup($0.state) == group }
            return missions.isEmpty ? nil : MissionSection(group: group, missions: missions)
        }
    }

    static func sections(
        _ sections: [MissionSection], matching query: String,
        companions: [String: MissionCompanion]
    ) -> [MissionSection] {
        let query = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return sections }
        return sections.compactMap { section in
            let missions = section.missions.filter {
                $0.matches(query, companion: companions[$0.botId])
            }
            return missions.isEmpty ? nil : MissionSection(group: section.group, missions: missions)
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

    var statusLine: String {
        if state == .readyToMerge { return "Ready to merge" }
        if isAgentRunning, MissionGroup(state) == .working { return "Working now" }
        let written = status?.text.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !written.isEmpty { return written }
        return state == .waitingHuman ? "Blocked on you" : "Working now"
    }

    func titleLine(companion: MissionCompanion?) -> String {
        [ticket.externalId, companion?.name].compactMap(\.self).joined(separator: " · ")
    }

    func detailLine(companion: MissionCompanion?) -> String {
        [companion?.name, statusLine].compactMap(\.self).joined(separator: " · ")
    }

    func matches(_ query: String, companion: MissionCompanion?) -> Bool {
        [objective, ticket.externalId, companion?.name].compactMap(\.self)
            .contains { $0.localizedStandardContains(query) }
    }

    func moved(by changed: MissionChanged) -> Mission {
        var moved = self
        moved.isAgentRunning = changed.isAgentRunning
        moved.lastActivityAt = changed.lastActivityAt
        if changed.stateSeq >= stateSeq {
            moved.state = changed.state
            moved.stateSeq = changed.stateSeq
        }
        return moved
    }
}
