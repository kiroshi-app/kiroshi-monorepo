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

    enum Creation: Equatable {
        case idle
        case creating
        case failed
    }

    static let onlineDeadline = Duration.seconds(30)

    private(set) var phase = Phase.loading
    private(set) var isOnline = false
    private var listed: [ConversationSummary] = []
    private(set) var companions: [Companion] = []
    private(set) var creation = Creation.idle
    var path: [ConversationsRoute] = []
    var isPickingCompanions = false

    var opened: ConversationSubject? {
        get {
            guard case .conversation(let subject) = path.first else { return nil }
            return subject
        }
        set { path = newValue.map { [.conversation($0)] } ?? [] }
    }

    var showsMissions: Bool {
        path.contains(where: \.showsMissions)
    }

    @ObservationIgnored private var instanceId: Space.ID?
    @ObservationIgnored private var spaceId: String?
    @ObservationIgnored private var relay: ConversationRelay?
    @ObservationIgnored private var opening: Companion.ID?
    @ObservationIgnored private var loading: Task<Void, Never>?
    @ObservationIgnored private var creating: Task<Void, Never>?
    @ObservationIgnored private let work: CompanionWork
    @ObservationIgnored private let now: () -> Date
    @ObservationIgnored private let calendar: Calendar
    @ObservationIgnored private let clock: any RelayClock

    init(
        work: CompanionWork, opening: Companion.ID? = nil, now: @escaping () -> Date = Date.init,
        calendar: Calendar = .current, clock: any RelayClock = ContinuousRelayClock()
    ) {
        self.work = work
        self.opening = opening
        self.now = now
        self.calendar = calendar
        self.clock = clock
    }

    var summaries: [ConversationSummary] {
        listed.map { summary in
            var summary = summary
            summary.workingCompanionIds = Set(
                work.workers(in: summary.conversationId).map(\.companionId))
            guard summary.isWorking else { return summary }
            let working = String(localized: "working…")
            summary.timeLabel = String(localized: "Now")
            switch summary.subject {
            case .companion:
                summary.preview = working
            case .group(let group):
                let worker = group.members.first { summary.workingCompanionIds.contains($0.id) }
                summary.preview = worker.map { "\($0.name): \(working)" } ?? summary.preview
            }
            return summary
        }
    }

    func follow(_ connection: RelayConnection) async {
        if instanceId != connection.instanceId {
            instanceId = connection.instanceId
            spaceId = nil
            phase = .loading
            listed = []
            companions = []
            opened = nil
            stopPicking()
        }
        relay = ConversationRelay(connection: connection)
        isOnline = false
        for await update in await connection.updates() {
            guard isFollowing(connection) else { return }
            switch update {
            case .state(.online(let sharedSpaceId)):
                spaceId = sharedSpaceId
                isOnline = true
                reload()
            case .state:
                isOnline = false
            case .event(let event):
                guard let event = ConversationEvent(event) else { continue }
                apply(event)
            }
        }
        guard isFollowing(connection) else { return }
        isOnline = false
        loading?.cancel()
        loading = nil
    }

    @discardableResult
    func reload() -> Task<Void, Never>? {
        guard let relay else { return nil }
        guard isOnline, let spaceId else { return waitForOnline() }
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

    private func isFollowing(_ connection: RelayConnection) -> Bool {
        relay?.connection === connection
    }

    private func waitForOnline() -> Task<Void, Never>? {
        guard phase == .failed else { return nil }
        phase = .loading
        loading?.cancel()
        let task = Task { await failUnlessOnlineInTime() }
        loading = task
        return task
    }

    private func failUnlessOnlineInTime() async {
        do {
            try await clock.sleep(for: Self.onlineDeadline)
        } catch {
            return
        }
        guard !Task.isCancelled else { return }
        phase = .failed
    }

    func pickCompanions() {
        creation = .idle
        isPickingCompanions = true
    }

    func stopPicking() {
        creating?.cancel()
        creating = nil
        creation = .idle
        isPickingCompanions = false
    }

    @discardableResult
    func createGroup(with companionIds: [Companion.ID]) -> Task<Void, Never>? {
        guard let spaceId, let relay, creation != .creating, !companionIds.isEmpty else {
            return nil
        }
        creation = .creating
        let task = Task { await create(companionIds, in: spaceId, through: relay) }
        creating = task
        return task
    }

    private func create(
        _ companionIds: [Companion.ID], in spaceId: String, through relay: ConversationRelay
    ) async {
        do {
            let group = try await relay.createGroup(in: spaceId, with: companionIds)
            guard !Task.isCancelled, self.spaceId == spaceId else { return }
            creating = nil
            creation = .idle
            admit(group)
            isPickingCompanions = false
            opened = .group(group)
        } catch is CancellationError {
            return
        } catch {
            guard !Task.isCancelled, self.spaceId == spaceId else { return }
            creating = nil
            creation = .failed
        }
    }

    private func admit(_ group: GroupConversation) {
        guard phase == .loaded, !listed.contains(where: { $0.id == group.id }) else { return }
        publish(listed + [summary(of: group, lastMessage: nil)])
    }

    private func apply(_ event: ConversationEvent) {
        switch event {
        case .messageStored(let message):
            update(message.conversationId) { $0.lastMessage = MessagePreview(message) }
        case .agent(let agent):
            guard let scope = agent.scope, case .messageCompleted(let message) = agent.change
            else { return }
            update(scope.conversationId) {
                $0.lastMessage = MessagePreview(message, by: scope.botId)
            }
        case .companionsChanged:
            reload()
        case .groupCreated(let group):
            admit(group)
        case .groupUpdated(let group):
            guard let index = listed.firstIndex(where: { $0.subject.isGroup(group.id) })
            else { return }
            var changed = listed
            changed[index].subject = .group(group)
            publish(changed)
        case .groupDeleted(let id):
            guard listed.contains(where: { $0.subject.isGroup(id) }) else { return }
            publish(listed.filter { !$0.subject.isGroup(id) })
        }
    }

    private func update(_ conversationId: String, _ change: (inout ConversationSummary) -> Void) {
        guard let index = listed.firstIndex(where: { $0.conversationId == conversationId })
        else { return }
        var changed = listed
        change(&changed[index])
        publish(changed)
    }

    private func summary(of group: GroupConversation, lastMessage: MessagePreview?)
        -> ConversationSummary
    {
        ConversationSummary(
            subject: .group(group), conversationId: group.id, lastMessage: lastMessage)
    }

    private func load(_ spaceId: String, through relay: ConversationRelay) async {
        do {
            async let listedCompanions = relay.companions(in: spaceId)
            async let groups = relay.groups(in: spaceId)
            let companions = try await listedCompanions
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
            publish(subjects.compactMap { loaded[$0.id] })
            self.companions = companions
            phase = .loaded
            if let opening, let subject = subjects.first(where: { $0.id == opening }) {
                self.opening = nil
                opened = subject
            }
        } catch is CancellationError {
            return
        } catch {
            guard !Task.isCancelled, await relay.connection.isRunning, !Task.isCancelled,
                phase != .loaded
            else { return }
            phase = .failed
        }
    }

    private nonisolated static func summary(
        of subject: ConversationSubject, in spaceId: String, through relay: ConversationRelay
    ) async throws -> ConversationSummary {
        let conversationId: String
        switch subject {
        case .companion(let companion):
            do {
                conversationId = try await relay.mainChat(of: companion.id, in: spaceId)
            } catch is ConversationCallError {
                return ConversationSummary(subject: subject)
            }
        case .group(let group):
            conversationId = group.id
        }
        let last: TranscriptMessage?
        do {
            last = try await relay.latestMessages(in: conversationId, limit: 1).last
        } catch is ConversationCallError {
            last = nil
        }
        return ConversationSummary(
            subject: subject, conversationId: conversationId,
            lastMessage: last.map(MessagePreview.init))
    }

    private func publish(_ changed: [ConversationSummary]) {
        let time = ConversationTime(now: now(), calendar: calendar)
        listed = Self.ordered(changed).map { summary in
            var summary = summary
            summary.timeLabel = summary.lastMessage.map { time.listLabel(for: $0.sentAt) }
            switch summary.subject {
            case .companion:
                summary.preview = summary.lastMessage?.line
            case .group(let group):
                summary.preview = summary.lastMessage?.line(among: group.members)
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
