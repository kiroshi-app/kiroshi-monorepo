import Foundation
import Observation

@MainActor
@Observable
final class ThreadStore {
    enum Phase: Equatable {
        case loading
        case loaded
        case failed
    }

    static let pageSize = 50

    let subject: ConversationSubject
    private(set) var phase = Phase.loading
    private(set) var entries: [ThreadEntry] = []
    private(set) var isWorking = false
    private(set) var isReachable = false
    private(set) var isSending = false
    private(set) var runningScope: AgentEvent.Scope?
    private(set) var sendFailure: SendFailure?
    private(set) var stopFailed = false
    var draft: String

    @ObservationIgnored private(set) var conversationId: String?
    @ObservationIgnored private var spaceId: String?
    @ObservationIgnored private var relay: ConversationRelay?
    @ObservationIgnored private var heardTurnWhileLoading = false
    @ObservationIgnored private var loading: Task<Void, Never>?
    @ObservationIgnored private var sending: Task<Void, Never>?
    @ObservationIgnored private var stopping: Task<Void, Never>?
    @ObservationIgnored private let now: () -> Date
    @ObservationIgnored private let makeId: () -> String
    @ObservationIgnored private let calendar: Calendar

    init(
        subject: ConversationSubject,
        draft: String = "",
        now: @escaping () -> Date = Date.init,
        makeId: @escaping () -> String = { UUID().uuidString.lowercased() },
        calendar: Calendar = .current
    ) {
        self.subject = subject
        self.draft = draft
        self.now = now
        self.makeId = makeId
        self.calendar = calendar
    }

    var workingName: String {
        subject.members.first { $0.id == runningScope?.botId }?.name ?? subject.title
    }

    var canSend: Bool {
        isReachable && conversationId != nil && !isSending && !isWorking
            && !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    func follow(_ connection: RelayConnection) async {
        relay = ConversationRelay(connection: connection)
        for await update in await connection.updates() {
            switch update {
            case .state(.online(let sharedSpaceId)):
                isReachable = true
                spaceId = sharedSpaceId
                reload()
            case .state:
                isReachable = false
            case .event(let event):
                guard let event = ConversationEvent(event) else { continue }
                apply(event)
            }
        }
        isReachable = false
        for task in [loading, sending, stopping] {
            task?.cancel()
        }
    }

    @discardableResult
    func reload() -> Task<Void, Never>? {
        guard let spaceId, let relay else { return nil }
        if phase == .failed {
            phase = .loading
        }
        loading?.cancel()
        let task = Task { await load(in: spaceId, through: relay) }
        loading = task
        return task
    }

    @discardableResult
    func send() -> Task<Void, Never>? {
        guard canSend, let relay, let conversationId else { return nil }
        let message = SentMessage(
            id: makeId(), conversationId: conversationId, turnId: makeId(),
            content: draft.trimmingCharacters(in: .whitespacesAndNewlines),
            createdAt: now().milliseconds, repliedToMessageId: nil)
        draft = ""
        sendFailure = nil
        isSending = true
        let task = Task { await deliver(message, through: relay) }
        sending = task
        return task
    }

    @discardableResult
    func stop() -> Task<Void, Never>? {
        guard let relay, let runningScope else { return nil }
        stopFailed = false
        let task = Task {
            do {
                try await relay.cancelTurn(runningScope)
            } catch is CancellationError {
                return
            } catch {
                stopFailed = true
            }
        }
        stopping = task
        return task
    }

    private func deliver(_ message: SentMessage, through relay: ConversationRelay) async {
        defer { isSending = false }
        do {
            try await relay.sendTurn(message, summoning: summoned)
            insert(
                ThreadMessage(
                    id: message.id, isYours: true, text: message.content,
                    sentAt: Date(milliseconds: message.createdAt)))
            isWorking = true
        } catch is CancellationError {
            return
        } catch {
            if draft.isEmpty {
                draft = message.content
            }
            sendFailure = SendFailure(error)
        }
    }

    private var summoned: [Companion.ID] {
        switch subject {
        case .companion(let companion): [companion.id]
        case .group: []
        }
    }

    private func load(in spaceId: String, through relay: ConversationRelay) async {
        heardTurnWhileLoading = false
        let shownBeforeLoad = Set(entries.map(\.id))
        do {
            let conversationId =
                switch subject {
                case .companion(let companion):
                    try await relay.mainChat(of: companion.id, in: spaceId)
                case .group(let group): group.id
                }
            guard !Task.isCancelled else { return }
            self.conversationId = conversationId
            let messages = try await relay.latestMessages(
                in: conversationId, limit: Self.pageSize)
            guard !Task.isCancelled else { return }
            merge(messages, droppingAnyOf: shownBeforeLoad)
            if !heardTurnWhileLoading {
                isWorking = messages.last?.completion.isUnderway ?? false
            }
            phase = .loaded
        } catch is CancellationError {
            return
        } catch {
            guard !Task.isCancelled else { return }
            phase = .failed
        }
    }

    private func merge(_ messages: [TranscriptMessage], droppingAnyOf shownBeforeLoad: Set<String>)
    {
        let paged = messages.map { message in
            ThreadMessage(
                id: message.id, isYours: message.role == .user, text: message.content,
                sentAt: Date(milliseconds: message.createdAt))
        }
        let pagedIds = Set(paged.map(\.id))
        let heardDuringLoad = entries.filter {
            !pagedIds.contains($0.id) && !shownBeforeLoad.contains($0.id)
        }
        entries = paged.map(ThreadEntry.message) + heardDuringLoad
        markDays()
    }

    private func apply(_ event: ConversationEvent) {
        switch event {
        case .messageStored(let message) where message.conversationId == conversationId:
            insert(
                ThreadMessage(
                    id: message.id, isYours: message.role == .user, text: message.content,
                    sentAt: Date(milliseconds: message.createdAt)))
        case .agent(let agent) where agent.scope?.conversationId == conversationId:
            if let scope = agent.scope {
                runningScope = scope
            }
            apply(agent.change)
        case .messageStored, .agent, .companionsChanged, .groupCreated, .groupUpdated,
            .groupDeleted:
            break
        }
    }

    private func apply(_ change: AgentEvent.Change) {
        heardTurnWhileLoading = true
        switch change {
        case .turn(let state):
            isWorking = state.isWorking
            if !state.isWorking {
                stopFailed = false
            }
        case .messageStarted(let message):
            isWorking = true
            insert(
                ThreadMessage(
                    id: message.id, isYours: message.role == .user, text: message.text,
                    sentAt: Date(milliseconds: message.timestamp)))
        case .messageDelta(let id, let text):
            updateMessage(id) { $0.append(text) }
        case .messageCompleted(let message):
            if !updateMessage(message.id, { $0.replaceText(message.text) }) {
                insert(
                    ThreadMessage(
                        id: message.id, isYours: message.role == .user, text: message.text,
                        sentAt: Date(milliseconds: message.timestamp)))
            }
        case .activity(let activity) where activity.kind == .tool:
            isWorking = true
            record(ActivityGroup.Activity(id: activity.id, title: activity.title))
        case .turnEnded:
            isWorking = false
            runningScope = nil
            stopFailed = false
        case .activity, .other:
            break
        }
    }

    private func insert(_ message: ThreadMessage) {
        guard !updateMessage(message.id, { $0.replaceText(message.text) }) else { return }
        entries.append(.message(message))
        markDays()
    }

    @discardableResult
    private func updateMessage(_ id: String, _ change: (inout ThreadMessage) -> Void) -> Bool {
        guard let index = entries.firstIndex(where: { $0.id == id }),
            case .message(var message) = entries[index]
        else { return false }
        change(&message)
        entries[index] = .message(message)
        return true
    }

    private func record(_ activity: ActivityGroup.Activity) {
        guard case .activities(var group) = entries.last else {
            entries.append(
                .activities(
                    ActivityGroup(id: "activities-\(activity.id)", activities: [activity])))
            return
        }
        if let index = group.activities.firstIndex(where: { $0.id == activity.id }) {
            group.activities[index] = activity
        } else {
            group.activities.append(activity)
        }
        entries[entries.count - 1] = .activities(group)
    }

    private func markDays() {
        let time = ConversationTime(now: now(), calendar: calendar)
        var previous: Date?
        for index in entries.indices {
            guard case .message(var message) = entries[index] else { continue }
            let opensDay =
                previous.map { !calendar.isDate($0, inSameDayAs: message.sentAt) } ?? true
            previous = message.sentAt
            let dayLabel = opensDay ? time.threadLabel(for: message.sentAt) : nil
            if message.dayLabel != dayLabel {
                message.dayLabel = dayLabel
                entries[index] = .message(message)
            }
        }
    }
}
