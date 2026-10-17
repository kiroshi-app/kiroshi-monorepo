import Foundation
import Observation

enum MissionSendProblem: Equatable {
    case couldNotSend
    case tooLarge
    case offline
}

@MainActor
@Observable
final class MissionThreadStore {
    let mission: Mission
    let missions: MissionsStore
    var draft = ""
    var attachments: [PickedAttachment] = []
    private(set) var messages: [MissionThreadMessage] = [] {
        didSet { transcribe() }
    }
    private(set) var transcript = MissionTranscript()
    private(set) var hasLoaded = false
    private(set) var hasFailed = false
    private(set) var isOnline = false
    private(set) var isSending = false
    private(set) var sendProblem: MissionSendProblem?
    private(set) var lastSentId: ThreadMessage.ID?

    @ObservationIgnored private let work: CompanionWork
    @ObservationIgnored private let authorship: ThreadAuthorship
    @ObservationIgnored private let now: () -> Date
    @ObservationIgnored private let newId: () -> String
    @ObservationIgnored private let calendar: Calendar
    @ObservationIgnored private var relay: MissionsRelay?
    @ObservationIgnored private var rereads: AsyncStream<Void>.Continuation?
    @ObservationIgnored private var sending: Task<Void, Never>?
    @ObservationIgnored private var seeding: Task<Void, Never>?

    init(
        mission: Mission,
        missions: MissionsStore,
        work: CompanionWork,
        authorship: ThreadAuthorship = .hostedSignedOut,
        now: @escaping () -> Date = Date.init,
        newId: @escaping () -> String = { UUID().uuidString.lowercased() },
        calendar: Calendar = .current
    ) {
        self.mission = mission
        self.missions = missions
        self.work = work
        self.authorship = authorship
        self.now = now
        self.newId = newId
        self.calendar = calendar
        transcribe()
    }

    var workers: [CompanionWorker] {
        work.workers(in: mission.threadConversationId)
    }

    var companion: Companion? {
        missions.companion(of: mission)
    }

    var isLoading: Bool {
        !hasLoaded && !hasFailed && messages.isEmpty
    }

    var canSend: Bool {
        isOnline && !isSending
            && (!draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                || !attachments.isEmpty)
    }

    func follow(_ connection: RelayConnection) async {
        let relay = MissionsRelay(connection: connection)
        self.relay = relay
        let updates = await connection.updates()
        let (signals, rereads) = AsyncStream.makeStream(
            of: Void.self, bufferingPolicy: .bufferingNewest(1))
        self.rereads = rereads
        await withDiscardingTaskGroup { group in
            group.addTask { await self.reread(signals, through: relay) }
            for await update in updates {
                apply(update)
                if case .state(.online) = update {
                    seeding?.cancel()
                    seeding = Task { await seedPendingQuestions(through: relay) }
                }
            }
            rereads.finish()
        }
        self.rereads = nil
        isOnline = false
        seeding?.cancel()
    }

    @discardableResult
    func send() -> Task<Void, Never>? {
        guard canSend, let relay else { return nil }
        let id = newId()
        lastSentId = id
        isSending = true
        let task = Task { await deliver(id, through: relay) }
        sending = task
        return task
    }

    @discardableResult
    func reload() -> Task<Void, Never>? {
        hasFailed = false
        rereads?.yield()
        return nil
    }

    private func transcribe() {
        transcript = MissionTranscript(
            of: messages,
            openedAt: Date(timeIntervalSince1970: TimeInterval(mission.openedAt) / 1000),
            time: ConversationTime(now: now(), calendar: calendar), authorship: authorship)
    }

    private func deliver(_ id: String, through relay: MissionsRelay) async {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        let picked = attachments
        sendProblem = nil
        defer { isSending = false }
        do {
            let sentAt = now()
            var content = text
            if !picked.isEmpty {
                let paths = try await relay.store(
                    ConversationAttachments(
                        conversationId: mission.threadConversationId,
                        attachments: picked.map { .init(name: $0.name, bytes: Array($0.data)) }))
                content = AttachmentBlock.prompt(text: text, paths: paths, sentAt: sentAt)
            }
            let message = MissionAnswer.Message(
                id: id, conversationId: mission.threadConversationId, turnId: newId(),
                content: content, createdAt: Int(sentAt.timeIntervalSince1970 * 1000))
            try await relay.answer(MissionAnswer(message: message, summoned: [mission.botId]))
            messages = MissionTranscript.upserting(
                MissionThreadMessage(
                    id: message.id, conversationId: message.conversationId, seq: .max,
                    role: .user, content: content, createdAt: message.createdAt, authorBotId: nil,
                    authorAccountId: authorship.accountId),
                into: messages)
            if draft.trimmingCharacters(in: .whitespacesAndNewlines) == text {
                draft = ""
            }
            if attachments == picked {
                attachments = []
            }
        } catch MissionsCallError.refused(status: 413) {
            sendProblem = .tooLarge
        } catch RelayCallError.notConnected {
            sendProblem = .offline
        } catch {
            sendProblem = .couldNotSend
        }
    }

    private func apply(_ update: RelayUpdate) {
        switch update {
        case .state(.online):
            isOnline = true
            rereads?.yield()
        case .state:
            isOnline = false
        case .event(let event):
            switch MissionThreadFrame(event, conversationId: mission.threadConversationId) {
            case .stored(let message):
                messages = MissionTranscript.upserting(message, into: messages)
            case .reread: rereads?.yield()
            case nil: break
            }
        }
    }

    private func seedPendingQuestions(through relay: MissionsRelay) async {
        let questions = try? await ConversationRelay(connection: relay.connection)
            .pendingQuestions(in: mission.threadConversationId)
        guard !Task.isCancelled else { return }
        for question in questions ?? [] {
            work.hear(question)
        }
    }

    private func reread(_ signals: AsyncStream<Void>, through relay: MissionsRelay) async {
        for await _ in signals {
            do {
                let page = try await relay.thread(conversationId: mission.threadConversationId)
                for message in page.messages {
                    messages = MissionTranscript.upserting(message, into: messages)
                }
                hasLoaded = true
                hasFailed = false
            } catch {
                guard !Task.isCancelled else { return }
                hasFailed = !hasLoaded
            }
        }
    }
}

extension MissionThreadStore: ThreadModel {
    var kind: ThreadKind { .mission }

    var state: ThreadState {
        if hasFailed { return .failed }
        return isLoading ? .loading : .shown
    }

    var entries: [ThreadMessage] {
        transcript.entries
    }

    var working: ThreadWorking? {
        guard let since = workers.map(\.since).min() else { return nil }
        return ThreadWorking(
            companion: companion, name: companion?.name ?? String(localized: "The companion"),
            isSeveral: false,
            since: since)
    }

    var placeholder: String {
        String(localized: "Answer this mission…")
    }

    var problem: String? {
        if !isOnline, hasLoaded {
            return String(
                localized: "The host’s computer is offline. You can send again once it’s back.")
        }
        return switch sendProblem {
        case .couldNotSend: String(localized: "Couldn’t send your answer. Send it again.")
        case .tooLarge:
            String(
                localized:
                    "Couldn’t send your files: they’re too large. Remove one and send again.")
        case .offline:
            String(
                localized:
                    "Couldn’t send: the host’s computer is offline. Send again once it’s back.")
        case nil: nil
        }
    }

    var canStop: Bool { false }

    var mentionCandidates: [Companion] { [] }

    func mention(_ companion: Companion) {}

    var hasOlder: Bool { false }

    var olderFailed: Bool { false }

    func loadOlder() {}

    @discardableResult
    func stop() -> Task<Void, Never>? { nil }
}
