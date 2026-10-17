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
    private(set) var entries: [ThreadMessage] = []
    private(set) var lastSentId: ThreadMessage.ID?
    private(set) var isReachable = false
    private(set) var isSending = false
    private(set) var sendFailure: SendFailure?
    private(set) var isDeleted = false
    private(set) var conversationId: String?
    private(set) var hasOlder = false
    private(set) var olderFailed = false
    private var stopRefused = false
    var draft: String
    var attachments: [PickedAttachment] = []

    @ObservationIgnored private let work: CompanionWork
    @ObservationIgnored private let authorship: ThreadAuthorship
    @ObservationIgnored private var spaceId: String?
    @ObservationIgnored private var relay: ConversationRelay?
    @ObservationIgnored private var loading: Task<Void, Never>?
    @ObservationIgnored private var sending: Task<Void, Never>?
    @ObservationIgnored private var stopping: Task<Void, Never>?
    @ObservationIgnored private var loadingOlder: Task<Void, Never>?
    @ObservationIgnored private var oldestSeq: Int?
    @ObservationIgnored private var generation = 0
    @ObservationIgnored private let now: () -> Date
    @ObservationIgnored private let makeId: () -> String
    @ObservationIgnored private let calendar: Calendar

    init(
        subject: ConversationSubject,
        work: CompanionWork,
        authorship: ThreadAuthorship = .unknownAccount,
        draft: String = "",
        now: @escaping () -> Date = Date.init,
        makeId: @escaping () -> String = { UUID().uuidString.lowercased() },
        calendar: Calendar = .current
    ) {
        self.subject = subject
        self.work = work
        self.authorship = authorship
        self.draft = draft
        self.now = now
        self.makeId = makeId
        self.calendar = calendar
    }

    var workers: [CompanionWorker] {
        work.workers(in: conversationId)
    }

    var isWorking: Bool {
        !workers.isEmpty
    }

    var workingSince: Date? {
        workers.map(\.since).min()
    }

    var runningScope: AgentEvent.Scope? {
        workers.last?.scope
    }

    var stopFailed: Bool {
        stopRefused && isWorking
    }

    var workingCompanions: [Companion] {
        subject.members.filter { companion in
            workers.contains { $0.companionId == companion.id }
        }
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
        for task in [loading, sending, stopping, loadingOlder] {
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
        loadingOlder?.cancel()
        loadingOlder = nil
        generation += 1
        let task = Task { await load(in: spaceId, through: relay) }
        loading = task
        return task
    }

    func loadOlder() {
        guard phase == .loaded, hasOlder, loadingOlder == nil, let relay, let conversationId,
            let oldestSeq
        else { return }
        olderFailed = false
        let generation = generation
        loadingOlder = Task {
            await readOlder(
                before: oldestSeq, in: conversationId, through: relay, generation: generation)
        }
    }

    private func readOlder(
        before seq: Int, in conversationId: String, through relay: ConversationRelay,
        generation: Int
    ) async {
        do {
            let page = try await relay.messages(
                in: conversationId, before: seq, limit: Self.pageSize)
            guard !Task.isCancelled, generation == self.generation else { return }
            let shown = Set(entries.map(\.id))
            entries = page.messages.filter { !shown.contains($0.id) }.map(threadMessage) + entries
            layOut()
            oldestSeq = page.messages.first?.seq ?? oldestSeq
            hasOlder = page.hasMore
        } catch {
            guard !Task.isCancelled, generation == self.generation else { return }
            olderFailed = !(error is CancellationError)
        }
        loadingOlder = nil
    }

    @discardableResult
    func send() -> Task<Void, Never>? {
        guard canSend, let relay, let conversationId else { return nil }
        let outgoing = Outgoing(
            id: makeId(), turnId: makeId(), conversationId: conversationId,
            written: draft.trimmingCharacters(in: .whitespacesAndNewlines), picked: attachments,
            sentAt: now())
        lastSentId = outgoing.id
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
        guard let relay, isWorking else { return nil }
        let scopes = workers.map(\.scope)
        stopRefused = false
        let task = Task {
            for scope in scopes {
                do {
                    try await relay.cancelTurn(scope)
                } catch is CancellationError {
                    return
                } catch {
                    stopRefused = true
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
                    id: message.id, writer: .you, text: message.content,
                    sentAt: message.createdAt))
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

    private func threadMessage(id: String, writer: MessageAuthor, text: String, sentAt: Int)
        -> ThreadMessage
    {
        ThreadMessage(
            id: id, writer: writer, text: text, sentAt: Date(milliseconds: sentAt),
            authors: subject.namedAuthors)
    }

    private func load(in spaceId: String, through relay: ConversationRelay) async {
        let shownBeforeLoad = Set(entries.map(\.id))
        let generation = generation
        do {
            let conversationId =
                switch subject {
                case .companion(let companion):
                    try await relay.mainChat(of: companion.id, in: spaceId)
                case .group(let group): group.id
                }
            guard !Task.isCancelled else { return }
            self.conversationId = conversationId
            let page = try await relay.messages(
                in: conversationId, before: nil, limit: Self.pageSize)
            guard !Task.isCancelled, generation == self.generation else { return }
            merge(page, droppingAnyOf: shownBeforeLoad)
            phase = .loaded
            let questions = try? await relay.pendingQuestions(in: conversationId)
            guard !Task.isCancelled else { return }
            for question in questions ?? [] {
                work.hear(question)
            }
        } catch is CancellationError {
            return
        } catch {
            guard !Task.isCancelled else { return }
            phase = .failed
        }
    }

    private func merge(_ page: TranscriptPage, droppingAnyOf shownBeforeLoad: Set<String>) {
        let paged = page.messages.map(threadMessage)
        let pagedIds = Set(paged.map(\.id))
        let heardDuringLoad = entries.filter {
            !pagedIds.contains($0.id) && !shownBeforeLoad.contains($0.id)
        }
        let olderKept = paged.first.flatMap { first in
            entries.firstIndex { $0.id == first.id }.map { Array(entries[..<$0]) }
        }
        if let olderKept, !olderKept.isEmpty {
            entries = olderKept + paged + heardDuringLoad
        } else {
            entries = paged + heardDuringLoad
            oldestSeq = page.messages.first?.seq
            hasOlder = page.hasMore
        }
        olderFailed = false
        layOut()
    }

    private func threadMessage(_ message: TranscriptMessage) -> ThreadMessage {
        threadMessage(
            id: message.id, writer: authorship.author(of: message), text: message.content,
            sentAt: message.createdAt)
    }

    private func apply(_ event: ConversationEvent) {
        switch event {
        case .messageStored(let message) where message.conversationId == conversationId:
            insert(threadMessage(message))
        case .agent(let agent) where agent.scope?.conversationId == conversationId:
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

    private func apply(_ change: AgentEvent.Change, by authorId: Companion.ID?) {
        switch change {
        case .messageStarted(let message):
            insert(
                threadMessage(
                    id: message.id, writer: .companion(authorId), text: message.text,
                    sentAt: message.timestamp))
        case .messageDelta(let id, let text):
            updateMessage(id) { $0.append(text) }
        case .messageCompleted(let message):
            if !updateMessage(message.id, { $0.replaceText(message.text) }) {
                insert(
                    threadMessage(
                        id: message.id, writer: .companion(authorId), text: message.text,
                        sentAt: message.timestamp))
            }
        case .turn, .activity, .permissionRequested, .questionRequested, .turnEnded, .failed,
            .other:
            break
        }
    }

    private func insert(_ message: ThreadMessage) {
        guard !updateMessage(message.id, { $0.replaceText(message.text) }) else { return }
        entries.append(message)
        layOut()
    }

    @discardableResult
    private func updateMessage(_ id: String, _ change: (inout ThreadMessage) -> Void) -> Bool {
        guard let index = entries.firstIndex(where: { $0.id == id }) else { return false }
        change(&entries[index])
        layOut()
        return true
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
                    "Couldn’t send, the computer hosting this Space is offline. Tap Send again once it’s back."
            )
        case .storageUnreadable:
            String(
                localized:
                    "Couldn’t send. Kiroshi couldn’t read this iPhone’s secure storage. Try again.")
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
