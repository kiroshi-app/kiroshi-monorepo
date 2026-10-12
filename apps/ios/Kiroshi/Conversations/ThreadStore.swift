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

    private(set) var subject: ConversationSubject
    private(set) var phase = Phase.loading
    private(set) var entries: [ThreadEntry] = []
    private(set) var isWorking = false {
        didSet {
            if isWorking != oldValue {
                workingSince = isWorking ? now() : nil
            }
        }
    }
    private(set) var workingSince: Date?
    private(set) var isReachable = false
    private(set) var isSending = false
    private(set) var runningScopes: [AgentEvent.Scope] = []
    private(set) var summoning: [Companion.ID] = []
    private(set) var sendFailure: SendFailure?
    private(set) var stopFailed = false
    private(set) var isDeleted = false
    var draft: String
    var attachments: [PickedAttachment] = []

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

    var runningScope: AgentEvent.Scope? {
        runningScopes.last
    }

    var workingCompanions: [Companion] {
        let ids = runningScopes.isEmpty ? summoning : runningScopes.map(\.botId)
        return ids.compactMap { id in subject.members.first { $0.id == id } }
    }

    var workingName: String {
        let names = workingCompanions.map(\.name)
        return names.isEmpty ? subject.title : names.formatted(.list(type: .and))
    }

    var mentionCandidates: [Companion] {
        guard case .group(let group) = subject, let query = Mentions.query(in: draft) else {
            return []
        }
        return Mentions.candidates(for: query, among: group.members)
    }

    func mention(_ companion: Companion) {
        draft = Mentions.picking(companion, in: draft)
    }

    var canSend: Bool {
        isReachable && conversationId != nil && !isSending && !isWorking
            && (!draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                || !attachments.isEmpty)
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
        let outgoing = Outgoing(
            id: makeId(), turnId: makeId(), conversationId: conversationId,
            written: draft.trimmingCharacters(in: .whitespacesAndNewlines), picked: attachments,
            sentAt: now())
        draft = ""
        attachments = []
        sendFailure = nil
        isSending = true
        let task = Task { await deliver(outgoing, through: relay) }
        sending = task
        return task
    }

    @discardableResult
    func stop() -> Task<Void, Never>? {
        guard let relay, !runningScopes.isEmpty else { return nil }
        let scopes = runningScopes
        stopFailed = false
        let task = Task {
            for scope in scopes {
                do {
                    try await relay.cancelTurn(scope)
                } catch is CancellationError {
                    return
                } catch {
                    stopFailed = true
                }
            }
        }
        stopping = task
        return task
    }

    private func deliver(_ outgoing: Outgoing, through relay: ConversationRelay) async {
        defer { isSending = false }
        do {
            var content = content(of: outgoing.written)
            if !outgoing.picked.isEmpty {
                let paths = try await relay.storeAttachments(
                    ConversationAttachments(
                        conversationId: outgoing.conversationId,
                        attachments: outgoing.picked.map {
                            .init(name: $0.name, bytes: Array($0.data))
                        }))
                content = AttachmentBlock.prompt(
                    text: content, paths: paths, sentAt: outgoing.sentAt)
            }
            let message = SentMessage(
                id: outgoing.id, conversationId: outgoing.conversationId, turnId: outgoing.turnId,
                content: content, createdAt: outgoing.sentAt.milliseconds,
                repliedToMessageId: nil)
            let summoned = summoned(by: message.content)
            try await relay.sendTurn(message, summoning: summoned)
            insert(
                threadMessage(
                    id: message.id, isYours: true, text: message.content,
                    sentAt: message.createdAt))
            summoning = summoned.isEmpty ? answering : summoned
            isWorking = true
        } catch is CancellationError {
            return
        } catch {
            if draft.isEmpty {
                draft = outgoing.written
            }
            if attachments.isEmpty {
                attachments = outgoing.picked
            }
            sendFailure = SendFailure(error)
        }
    }

    private func content(of written: String) -> String {
        guard case .group(let group) = subject else { return written }
        return Mentions.tokens(in: written, among: group.members)
    }

    private func summoned(by content: String) -> [Companion.ID] {
        switch subject {
        case .companion(let companion): [companion.id]
        case .group(let group): Mentions.summoned(in: content, among: group.members)
        }
    }

    private var answering: [Companion.ID] {
        guard case .group(let group) = subject else { return [] }
        return group.leadId.map { [$0] } ?? []
    }

    private func threadMessage(
        id: String, isYours: Bool, text: String, sentAt: Int, authorId: Companion.ID? = nil
    ) -> ThreadMessage {
        ThreadMessage(
            id: id, isYours: isYours, text: text, sentAt: Date(milliseconds: sentAt),
            authorId: authorId, authors: subject.namedAuthors)
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
            threadMessage(
                id: message.id, isYours: message.role == .user, text: message.content,
                sentAt: message.createdAt, authorId: message.authorBotId)
        }
        let pagedIds = Set(paged.map(\.id))
        let heardDuringLoad = entries.filter {
            !pagedIds.contains($0.id) && !shownBeforeLoad.contains($0.id)
        }
        entries = paged.map(ThreadEntry.message) + heardDuringLoad
        layOut()
    }

    private func apply(_ event: ConversationEvent) {
        switch event {
        case .messageStored(let message) where message.conversationId == conversationId:
            insert(
                threadMessage(
                    id: message.id, isYours: message.role == .user, text: message.content,
                    sentAt: message.createdAt, authorId: message.authorBotId))
        case .agent(let agent) where agent.scope?.conversationId == conversationId:
            if let scope = agent.scope {
                track(scope, through: agent.change)
            }
            apply(agent.change, by: agent.scope?.botId)
        case .groupUpdated(let group) where subject.isGroup(group.id):
            subject = .group(group)
        case .groupDeleted(let id) where subject.isGroup(id):
            isDeleted = true
        case .messageStored, .agent, .companionsChanged, .groupCreated, .groupUpdated,
            .groupDeleted:
            break
        }
    }

    private func track(_ scope: AgentEvent.Scope, through change: AgentEvent.Change) {
        let index = runningScopes.firstIndex { $0.botId == scope.botId }
        let ends =
            switch change {
            case .turnEnded: true
            case .turn(let state): !state.isWorking
            default: false
            }
        if ends {
            if let index {
                runningScopes.remove(at: index)
            }
        } else if let index {
            runningScopes[index] = scope
        } else {
            runningScopes.append(scope)
        }
    }

    private func apply(_ change: AgentEvent.Change, by authorId: Companion.ID?) {
        heardTurnWhileLoading = true
        switch change {
        case .turn(let state):
            isWorking = state.isWorking || !runningScopes.isEmpty
            if !isWorking {
                settle()
            }
        case .messageStarted(let message):
            isWorking = true
            insert(
                threadMessage(
                    id: message.id, isYours: message.role == .user, text: message.text,
                    sentAt: message.timestamp, authorId: authorId))
        case .messageDelta(let id, let text):
            updateMessage(id) { $0.append(text) }
        case .messageCompleted(let message):
            if !updateMessage(message.id, { $0.replaceText(message.text) }) {
                insert(
                    threadMessage(
                        id: message.id, isYours: message.role == .user, text: message.text,
                        sentAt: message.timestamp, authorId: authorId))
            }
        case .activity(let activity) where activity.kind == .tool:
            isWorking = true
            record(ActivityGroup.Activity(id: activity.id, title: activity.title))
        case .turnEnded:
            isWorking = !runningScopes.isEmpty
            if !isWorking {
                settle()
            }
        case .activity, .other:
            break
        }
    }

    private func settle() {
        stopFailed = false
        summoning = []
    }

    private func insert(_ message: ThreadMessage) {
        guard !updateMessage(message.id, { $0.replaceText(message.text) }) else { return }
        entries.append(.message(message))
        layOut()
    }

    @discardableResult
    private func updateMessage(_ id: String, _ change: (inout ThreadMessage) -> Void) -> Bool {
        guard let index = entries.firstIndex(where: { $0.id == id }),
            case .message(var message) = entries[index]
        else { return false }
        change(&message)
        entries[index] = .message(message)
        layOut()
        return true
    }

    private func record(_ activity: ActivityGroup.Activity) {
        guard case .activities(var group) = entries.last else {
            entries.append(
                .activities(
                    ActivityGroup(id: "activities-\(activity.id)", activities: [activity])))
            layOut()
            return
        }
        if let index = group.activities.firstIndex(where: { $0.id == activity.id }) {
            group.activities[index] = activity
        } else {
            group.activities.append(activity)
        }
        entries[entries.count - 1] = .activities(group)
    }

    private func layOut() {
        entries = ThreadLayout.mark(entries, time: ConversationTime(now: now(), calendar: calendar))
    }
}

private struct Outgoing {
    let id: String
    let turnId: String
    let conversationId: String
    let written: String
    let picked: [PickedAttachment]
    let sentAt: Date
}

extension ThreadStore: ThreadModel {
    var kind: ThreadKind { .conversation }

    var state: ThreadState {
        switch phase {
        case .failed: .failed
        case _ where !entries.isEmpty || isWorking: .shown
        case .loading: .loading
        case .loaded: .empty
        }
    }

    var working: ThreadWorking? {
        guard isWorking else { return nil }
        return ThreadWorking(
            companion: workingCompanions.first ?? subject.members.first, name: workingName,
            isSeveral: workingCompanions.count > 1, since: workingSince)
    }

    var placeholder: String {
        String(localized: "Message \(subject.title)")
    }

    var problem: String? {
        if stopFailed {
            return String(localized: "Couldn’t stop \(workingName). Tap Stop to try again.")
        }
        return switch sendFailure {
        case .hostOffline:
            String(
                localized:
                    "Couldn’t send, the Mac hosting this Space is offline. Tap Send again once it’s back."
            )
        case .stillWorking:
            String(
                localized:
                    "Couldn’t send, \(workingName) is still working. Tap Send again once it answers."
            )
        case .tooLarge:
            String(
                localized:
                    "Couldn’t send your files, they’re too large. Remove one and tap Send again.")
        case .refused: String(localized: "Couldn’t send. Tap Send to try again.")
        case nil: nil
        }
    }

    var canStop: Bool {
        runningScope != nil
    }
}
