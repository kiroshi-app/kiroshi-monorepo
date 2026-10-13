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

    @ObservationIgnored private let now: () -> Date
    @ObservationIgnored private let newId: () -> String
    @ObservationIgnored private let calendar: Calendar
    @ObservationIgnored private var relay: MissionsRelay?
    @ObservationIgnored private var rereads: AsyncStream<Void>.Continuation?
    @ObservationIgnored private var sending: Task<Void, Never>?

    init(
        mission: Mission,
        now: @escaping () -> Date = Date.init,
        newId: @escaping () -> String = { UUID().uuidString.lowercased() },
        calendar: Calendar = .current
    ) {
        self.mission = mission
        self.now = now
        self.newId = newId
        self.calendar = calendar
        transcribe()
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
        isOnline = false
    }

    @discardableResult
    func send() -> Task<Void, Never>? {
        guard canSend, let relay else { return nil }
        isSending = true
        let task = Task { await deliver(through: relay) }
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
            time: ConversationTime(now: now(), calendar: calendar))
    }

    private func deliver(through relay: MissionsRelay) async {
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
                id: newId(), conversationId: mission.threadConversationId, turnId: newId(),
                content: content, createdAt: Int(sentAt.timeIntervalSince1970 * 1000))
            try await relay.answer(MissionAnswer(message: message, summoned: [mission.botId]))
            messages = MissionTranscript.upserting(
                MissionThreadMessage(
                    id: message.id, conversationId: message.conversationId, seq: .max,
                    role: .user, content: content, createdAt: message.createdAt, authorBotId: nil),
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

    var working: ThreadWorking? { nil }

    var placeholder: String {
        String(localized: "Answer this mission…")
    }

    var problem: String? {
        if !isOnline, hasLoaded {
            return String(
                localized: "The host’s Mac is offline. You can send again once it’s back.")
        }
        return switch sendProblem {
        case .couldNotSend: String(localized: "Couldn’t send your answer. Send it again.")
        case .tooLarge:
            String(
                localized:
                    "Couldn’t send your files: they’re too large. Remove one and send again.")
        case .offline:
            String(
                localized: "Couldn’t send: the host’s Mac is offline. Send again once it’s back.")
        case nil: nil
        }
    }

    var canStop: Bool { false }

    var mentionCandidates: [Companion] { [] }

    func mention(_ companion: Companion) {}

    @discardableResult
    func stop() -> Task<Void, Never>? { nil }
}
