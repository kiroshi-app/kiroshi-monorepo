import Foundation
import Observation

@MainActor
@Observable
final class ConversationsStore {
    enum Phase: Equatable {
        case loading
        case loaded
        case failed
    }

    private(set) var phase = Phase.loading
    private(set) var summaries: [ConversationSummary] = []
    var opened: ConversationSubject?

    @ObservationIgnored private var instanceId: Space.ID?
    @ObservationIgnored private var spaceId: String?
    @ObservationIgnored private var relay: ConversationRelay?
    @ObservationIgnored private var opening: Companion.ID?
    @ObservationIgnored private var working: [String: Set<Companion.ID>] = [:]
    @ObservationIgnored private var loading: Task<Void, Never>?
    @ObservationIgnored private let now: () -> Date
    @ObservationIgnored private let calendar: Calendar

    init(
        opening: Companion.ID? = nil, now: @escaping () -> Date = Date.init,
        calendar: Calendar = .current
    ) {
        self.opening = opening
        self.now = now
        self.calendar = calendar
    }

    func follow(_ connection: RelayConnection) async {
        if instanceId != connection.instanceId {
            instanceId = connection.instanceId
            spaceId = nil
            phase = .loading
            summaries = []
            working = [:]
            opened = nil
        }
        relay = ConversationRelay(connection: connection)
        for await update in await connection.updates() {
            switch update {
            case .state(.online(let sharedSpaceId)):
                spaceId = sharedSpaceId
                reload()
            case .state:
                break
            case .event(let event):
                guard let event = ConversationEvent(event) else { continue }
                apply(event)
            }
        }
        loading?.cancel()
        loading = nil
    }

    @discardableResult
    func reload() -> Task<Void, Never>? {
        guard let spaceId, let relay else { return nil }
        if phase == .failed {
            phase = .loading
        }
        loading?.cancel()
        let task = Task { await load(spaceId, through: relay) }
        loading = task
        return task
    }

    func refresh() async {
        await reload()?.value
    }

    private func apply(_ event: ConversationEvent) {
        switch event {
        case .messageStored(let message):
            update(message.conversationId) { $0.lastMessage = MessagePreview(message) }
        case .agent(let agent):
            guard let scope = agent.scope else { return }
            apply(agent.change, by: scope.botId, in: scope.conversationId)
        case .companionsChanged:
            reload()
        case .groupCreated(let group):
            guard phase == .loaded, !summaries.contains(where: { $0.id == group.id }) else {
                return
            }
            publish(summaries + [summary(of: group, lastMessage: nil)])
        case .groupUpdated(let group):
            guard let index = summaries.firstIndex(where: { $0.subject.isGroup(group.id) })
            else { return }
            var changed = summaries
            changed[index].subject = .group(group)
            publish(changed)
        case .groupDeleted(let id):
            guard summaries.contains(where: { $0.subject.isGroup(id) }) else { return }
            working[id] = nil
            publish(summaries.filter { !$0.subject.isGroup(id) })
        }
    }

    private func apply(
        _ change: AgentEvent.Change, by companionId: Companion.ID, in conversationId: String
    ) {
        switch change {
        case .turn(let state):
            setWorking(state.isWorking, companionId, in: conversationId)
        case .messageStarted:
            setWorking(true, companionId, in: conversationId)
        case .messageCompleted(let message):
            update(conversationId) { $0.lastMessage = MessagePreview(message, by: companionId) }
        case .turnEnded:
            setWorking(false, companionId, in: conversationId)
        case .messageDelta, .activity, .other:
            break
        }
    }

    private func setWorking(
        _ isWorking: Bool, _ companionId: Companion.ID, in conversationId: String
    ) {
        var companionIds = working[conversationId, default: []]
        if isWorking {
            companionIds.insert(companionId)
        } else {
            companionIds.remove(companionId)
        }
        working[conversationId] = companionIds.isEmpty ? nil : companionIds
        update(conversationId) { $0.workingCompanionIds = companionIds }
    }

    private func update(_ conversationId: String, _ change: (inout ConversationSummary) -> Void) {
        guard let index = summaries.firstIndex(where: { $0.conversationId == conversationId })
        else { return }
        var changed = summaries
        change(&changed[index])
        publish(changed)
    }

    private func summary(of group: GroupConversation, lastMessage: MessagePreview?)
        -> ConversationSummary
    {
        ConversationSummary(
            subject: .group(group), conversationId: group.id, lastMessage: lastMessage,
            workingCompanionIds: working[group.id] ?? [])
    }

    private func load(_ spaceId: String, through relay: ConversationRelay) async {
        do {
            async let companions = relay.companions(in: spaceId)
            async let groups = relay.groups(in: spaceId)
            let subjects =
                try await groups.map(ConversationSubject.group)
                + companions.map(ConversationSubject.companion)
            let loaded = try await withThrowingTaskGroup(of: ConversationSummary.self) { tasks in
                for subject in subjects {
                    tasks.addTask {
                        try await Self.summary(of: subject, in: spaceId, through: relay)
                    }
                }
                var loaded: [String: ConversationSummary] = [:]
                for try await summary in tasks {
                    loaded[summary.id] = summary
                }
                return loaded
            }
            guard !Task.isCancelled else { return }
            publish(
                subjects.compactMap { loaded[$0.id] }.map { summary in
                    var summary = summary
                    summary.workingCompanionIds =
                        summary.conversationId.flatMap { working[$0] } ?? []
                    return summary
                })
            phase = .loaded
            if let opening, let subject = subjects.first(where: { $0.id == opening }) {
                self.opening = nil
                opened = subject
            }
        } catch is CancellationError {
            return
        } catch {
            guard !Task.isCancelled else { return }
            phase = .failed
        }
    }

    private nonisolated static func summary(
        of subject: ConversationSubject, in spaceId: String, through relay: ConversationRelay
    ) async throws -> ConversationSummary {
        let conversationId =
            switch subject {
            case .companion(let companion): try await relay.mainChat(of: companion.id, in: spaceId)
            case .group(let group): group.id
            }
        let last = try await relay.latestMessages(in: conversationId, limit: 1).last
        return ConversationSummary(
            subject: subject, conversationId: conversationId,
            lastMessage: last.map(MessagePreview.init))
    }

    private func publish(_ changed: [ConversationSummary]) {
        let time = ConversationTime(now: now(), calendar: calendar)
        summaries = Self.ordered(changed).map { summary in
            var summary = summary
            summary.timeLabel =
                summary.isWorking
                ? String(localized: "Now")
                : summary.lastMessage.map { time.listLabel(for: $0.sentAt) }
            switch summary.subject {
            case .companion(let companion):
                summary.preview = summary.lastMessage?.line
                summary.workingName = summary.isWorking ? companion.name : nil
            case .group(let group):
                summary.preview = summary.lastMessage?.line(among: group.members)
                summary.workingName =
                    group.members.first { summary.workingCompanionIds.contains($0.id) }?.name
            }
            return summary
        }
    }

    private static func ordered(_ summaries: [ConversationSummary]) -> [ConversationSummary] {
        summaries.enumerated().sorted { left, right in
            if left.element.lastActivity != right.element.lastActivity {
                return left.element.lastActivity > right.element.lastActivity
            }
            return left.offset < right.offset
        }.map(\.element)
    }
}
