import Foundation
import Observation

enum MissionSendProblem: Equatable {
    case couldNotSend
    case olderHost
    case tooLarge
    case tooMany
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
        didSet {
            transcribe()
            settleRefusedSend()
        }
    }
    private(set) var transcript = MissionTranscript()
    private(set) var hasLoaded = false
    private(set) var hasFailed = false
    private(set) var isOnline = false
    private(set) var isHostOffline = false
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
    @ObservationIgnored private var refusedSend: Outgoing?
    @ObservationIgnored private var seeding: Task<Void, Never>?
    @ObservationIgnored private var isRelayRereading = false
    @ObservationIgnored private var hasTrailingRelayReread = false

    init(
        mission: Mission,
        missions: MissionsStore,
        work: CompanionWork,
        authorship: ThreadAuthorship = .unknownAccount,
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
            }
            rereads.finish()
        }
        self.rereads = nil
        isRelayRereading = false
        hasTrailingRelayReread = false
        isOnline = false
        isHostOffline = false
        seeding?.cancel()
    }

    @discardableResult
    func send() -> Task<Void, Never>? {
        guard canSend, let relay else { return nil }
        if let rejection = AttachmentRejection.of(attachments) {
            sendProblem = rejection == .tooMany ? .tooMany : .tooLarge
            return nil
        }
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        let outgoing =
            refusedSend.flatMap { $0.repeats(text, with: attachments) ? $0 : nil }
            ?? Outgoing(
                in: mission.threadConversationId, written: text, content: text,
                picked: attachments, sentAt: now(), makeId: newId)
        lastSentId = outgoing.id
        isSending = true
        let task = Task { await deliver(outgoing, through: relay) }
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

    private func deliver(_ outgoing: Outgoing, through relay: MissionsRelay) async {
        var outgoing = outgoing
        sendProblem = nil
        refusedSend = nil
        defer { isSending = false }
        do {
            let content = try await outgoing.prompt(
                storingFilesBy: { try await relay.store($0, callKey: $1) }, makeId: newId)
            let message = MissionAnswer.Message(
                id: outgoing.id, conversationId: outgoing.conversationId, turnId: outgoing.turnId,
                content: content, createdAt: Int(outgoing.sentAt.timeIntervalSince1970 * 1000))
            try await relay.answer(MissionAnswer(message: message, summoned: [mission.botId]))
            messages = MissionTranscript.upserting(
                MissionThreadMessage(
                    id: message.id, conversationId: message.conversationId, seq: .max,
                    role: .user, content: content, createdAt: message.createdAt, authorBotId: nil,
                    authorAccountId: authorship.accountId),
                into: messages)
            clearDraft(sent: outgoing.written, picked: outgoing.picked)
        } catch is CancellationError {
            return
        } catch RelayCallError.alreadyRan {
            clearDraft(sent: outgoing.written, picked: outgoing.picked)
        } catch {
            guard !messages.contains(where: { $0.id == outgoing.id }) else {
                clearDraft(sent: outgoing.written, picked: outgoing.picked)
                return
            }
            sendProblem =
                switch error {
                case MissionsCallError.refused(status: 413): .tooLarge
                case MissionsCallError.unknownToTheHost: .olderHost
                case RelayCallError.hostOffline: .offline
                default: .couldNotSend
                }
            refusedSend = outgoing
        }
    }

    private func clearDraft(sent text: String, picked: [PickedAttachment]) {
        if draft.trimmingCharacters(in: .whitespacesAndNewlines) == text {
            draft = ""
        }
        if attachments == picked {
            attachments = []
        }
    }

    private func settleRefusedSend() {
        guard let refusedSend, messages.contains(where: { $0.id == refusedSend.id }) else {
            return
        }
        self.refusedSend = nil
        sendProblem = nil
        clearDraft(sent: refusedSend.written, picked: refusedSend.picked)
    }

    private func apply(_ update: RelayUpdate) {
        switch update {
        case .state(.online):
            isOnline = true
            isHostOffline = false
            if hasFailed {
                rereads?.yield()
            }
        case .state(.connecting):
            isOnline = false
        case .state(let state):
            isOnline = false
            isHostOffline = state == .hostOffline
        case .reread:
            guard relay != nil else { return }
            guard !isRelayRereading else {
                hasTrailingRelayReread = true
                return
            }
            isRelayRereading = true
            relayReread()
        case .event(let event):
            switch MissionThreadFrame(event, conversationId: mission.threadConversationId) {
            case .stored(let message):
                messages = MissionTranscript.upserting(message, into: messages)
            case .reread: rereads?.yield()
            case nil: break
            }
        }
    }

    private func relayReread() {
        guard let relay else { return }
        rereads?.yield()
        seeding?.cancel()
        seeding = Task { await seedPendingQuestions(through: relay) }
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
            let answersResync = isRelayRereading
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
            guard answersResync else { continue }
            if hasTrailingRelayReread {
                hasTrailingRelayReread = false
                relayReread()
            } else {
                isRelayRereading = false
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
            companion: companion, name: companion?.name ?? String(localized: "The agent"),
            isSeveral: false,
            since: since)
    }

    var placeholder: String {
        String(localized: "Answer this mission…")
    }

    var problem: String? {
        if isHostOffline, hasLoaded {
            return String(
                localized: "The host’s computer is offline. You can send again once it’s back.")
        }
        return switch sendProblem {
        case .couldNotSend: String(localized: "Couldn’t send your answer. Send it again.")
        case .olderHost: OlderHost.problem
        case .tooLarge:
            String(
                localized:
                    "Couldn’t send your files: they’re too large. Remove one and send again.")
        case .tooMany:
            String(
                localized:
                    "Couldn’t send your files: there are more than 20. Remove some and send again.")
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

    var asking: QuestionAsking? { nil }

    func loadOlder() {}

    @discardableResult
    func stop() -> Task<Void, Never>? { nil }
}
