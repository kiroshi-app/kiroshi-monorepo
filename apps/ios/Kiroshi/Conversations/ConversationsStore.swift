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

    enum PinChange: Equatable {
        case pin
        case unpin
    }

    struct PinFailure: Equatable {
        let change: PinChange
        let title: String
    }

    static let onlineDeadline = Duration.seconds(30)
    static let prefetchDistance = 5

    private(set) var phase = Phase.loading
    private(set) var isOnline = false
    private(set) var nextPage = NextPage.complete
    private(set) var summaries: [ConversationSummary] = []
    private(set) var pinned: [ConversationSummary] = []
    private(set) var pinFailure: PinFailure?
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
    @ObservationIgnored private var authorship = ThreadAuthorship.unknownAccount
    @ObservationIgnored private var spaceId: String?
    @ObservationIgnored private var relay: ConversationRelay?
    @ObservationIgnored private var opening: Companion.ID?
    @ObservationIgnored private var loading: Task<Void, Never>?
    @ObservationIgnored private var creating: Task<Void, Never>?
    @ObservationIgnored private var paging: Task<Void, Never>?
    @ObservationIgnored private var merging: Task<Void, Never>?
    @ObservationIgnored private var pinning: Task<Void, Never>?
    @ObservationIgnored private var companionPins: [Companion.ID: Int] = [:]
    @ObservationIgnored private var rows: [ConversationSummary] = []
    @ObservationIgnored private var pinnedIds: [String] = []
    @ObservationIgnored private var nextCursor: String?
    @ObservationIgnored private var horizon: Date?
    @ObservationIgnored private var generation = 0
    @ObservationIgnored private var readsWholeList = false
    @ObservationIgnored private let now: () -> Date
    @ObservationIgnored private let calendar: Calendar
    @ObservationIgnored private let clock: any RelayClock

    init(
        opening: Companion.ID? = nil, now: @escaping () -> Date = Date.init,
        calendar: Calendar = .current, clock: any RelayClock = ContinuousRelayClock()
    ) {
        self.opening = opening
        self.now = now
        self.calendar = calendar
        self.clock = clock
    }

    var canPin: Bool {
        phase == .loaded && !readsWholeList
    }

    var isShowingPinFailure: Bool {
        get { pinFailure != nil }
        set {
            if !newValue {
                pinFailure = nil
            }
        }
    }

    func follow(
        _ connection: RelayConnection, as authorship: ThreadAuthorship = .unknownAccount
    ) async {
        self.authorship = authorship
        if instanceId != connection.instanceId {
            instanceId = connection.instanceId
            spaceId = nil
            phase = .loading
            rows = []
            summaries = []
            pinned = []
            pinnedIds = []
            companionPins = [:]
            pinning?.cancel()
            pinning = nil
            pinFailure = nil
            nextCursor = nil
            horizon = nil
            nextPage = .complete
            readsWholeList = false
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
        for task in [loading, paging, merging, pinning] {
            task?.cancel()
        }
        loading = nil
        paging = nil
        merging = nil
        pinning = nil
    }

    @discardableResult
    func reload() -> Task<Void, Never>? {
        guard let relay else { return nil }
        guard isOnline, let spaceId else { return waitForOnline() }
        if phase == .failed {
            phase = .loading
        }
        loading?.cancel()
        paging?.cancel()
        merging?.cancel()
        paging = nil
        merging = nil
        generation += 1
        if nextPage != .complete {
            nextPage = .loading
        }
        let task = Task { await load(spaceId, through: relay) }
        loading = task
        return task
    }

    func refresh() async {
        await reload()?.value
    }

    func rowAppeared(_ id: ConversationSummary.ID) {
        guard let index = summaries.firstIndex(where: { $0.id == id }),
            index >= summaries.count - Self.prefetchDistance
        else { return }
        loadMore()
    }

    func loadMore() {
        guard nextPage == .available || nextPage == .failed, let cursor = nextCursor,
            let spaceId, let relay
        else { return }
        nextPage = .loading
        let generation = generation
        paging = Task {
            await readPage(after: cursor, in: spaceId, through: relay, generation: generation)
        }
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

    @discardableResult
    func pin(_ id: ConversationSummary.ID) -> Task<Void, Never>? {
        repin(id, .pin)
    }

    @discardableResult
    func unpin(_ id: ConversationSummary.ID) -> Task<Void, Never>? {
        repin(id, .unpin)
    }

    private func repin(_ id: ConversationSummary.ID, _ change: PinChange) -> Task<Void, Never>? {
        guard canPin, pinning == nil, let spaceId, let relay,
            let title = (pinned + summaries).first(where: { $0.id == id })?.subject.title
        else { return nil }
        let task = Task {
            do {
                let pins = try await relay.pins(in: spaceId)
                let changed =
                    change == .pin
                    ? RosterPins.pinning(id, in: pins) : RosterPins.unpinning(id, in: pins)
                try await relay.pin(changed, in: spaceId)
                guard !Task.isCancelled else { return }
                pinning = nil
                guard self.spaceId == spaceId else { return }
                await reload()?.value
            } catch is CancellationError {
                return
            } catch {
                guard !Task.isCancelled else { return }
                pinning = nil
                guard self.spaceId == spaceId else { return }
                pinFailure = PinFailure(change: change, title: title)
            }
        }
        pinning = task
        return task
    }

    private func admit(_ group: GroupConversation) {
        guard phase == .loaded, !rows.contains(where: { $0.id == group.id }) else { return }
        publish(rows + [summary(of: group, lastMessage: nil)])
    }

    private func apply(_ event: ConversationEvent) {
        switch event {
        case .messageStored(let message):
            let preview = MessagePreview(message, authorship: authorship)
            guard update(message.conversationId, { $0.lastMessage = preview })
            else { return mergeFirstPage() }
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
            guard let index = rows.firstIndex(where: { $0.subject.isGroup(group.id) })
            else { return }
            var changed = rows
            changed[index].subject = .group(group)
            publish(changed)
        case .groupDeleted(let id):
            guard rows.contains(where: { $0.subject.isGroup(id) }) else { return }
            publish(rows.filter { !$0.subject.isGroup(id) })
        case .stateChanged(let changed):
            update(changed.conversationId) { $0.state = changed.state }
        }
    }

    @discardableResult
    private func update(_ conversationId: String, _ change: (inout ConversationSummary) -> Void)
        -> Bool
    {
        guard let index = rows.firstIndex(where: { $0.conversationId == conversationId })
        else { return false }
        var changed = rows
        change(&changed[index])
        publish(changed)
        return true
    }

    private func summary(of group: GroupConversation, lastMessage: MessagePreview?)
        -> ConversationSummary
    {
        ConversationSummary(
            subject: .group(group), conversationId: group.id, lastMessage: lastMessage)
    }

    private func load(_ spaceId: String, through relay: ConversationRelay) async {
        let generation = generation
        do {
            async let listedCompanions = relay.companions(in: spaceId)
            let page = try await firstPage(in: spaceId, through: relay)
            let roster = try await listedCompanions
            let companions = roster.map(\.companion)
            let groups = page == nil ? try await relay.groups(in: spaceId) : []
            let paged = Self.summaries(of: page, among: companions, authorship: authorship)
            let pagedIds = Set(paged.map(\.id))
            let subjects =
                groups.map(ConversationSubject.group)
                + companions.filter { !pagedIds.contains($0.id) }.map(ConversationSubject.companion)
            let authorship = authorship
            let loaded = try await withThrowingTaskGroup(of: ConversationSummary.self) { tasks in
                for subject in subjects {
                    tasks.addTask {
                        try await Self.summary(
                            of: subject, in: spaceId, through: relay, authorship: authorship)
                    }
                }
                var loaded: [String: ConversationSummary] = [:]
                for try await summary in tasks {
                    loaded[summary.id] = summary
                }
                return loaded
            }
            guard !Task.isCancelled, generation == self.generation else { return }
            companionPins = Dictionary(
                uniqueKeysWithValues: roster.compactMap { entry in
                    entry.place.pinPosition.map { (entry.companion.id, $0) }
                })
            pinnedIds = page.map { pinnedIds(of: $0, among: companions) } ?? []
            read(page)
            publish(paged + subjects.compactMap { loaded[$0.id] })
            self.companions = companions
            phase = .loaded
            if let opening, let subject = rows.first(where: { $0.id == opening })?.subject {
                self.opening = nil
                opened = subject
            }
        } catch is CancellationError {
            return
        } catch {
            guard !Task.isCancelled, generation == self.generation else { return }
            nextPage = nextCursor == nil ? .complete : .available
            guard await relay.connection.isRunning, !Task.isCancelled,
                generation == self.generation, phase != .loaded
            else { return }
            phase = .failed
        }
    }

    private func firstPage(in spaceId: String, through relay: ConversationRelay) async throws
        -> ConversationPage?
    {
        guard !readsWholeList else { return nil }
        do {
            return try await relay.page(in: spaceId, after: nil)
        } catch ConversationCallError.unknownToTheHost {
            readsWholeList = true
            return nil
        }
    }

    private func readPage(
        after cursor: String, in spaceId: String, through relay: ConversationRelay,
        generation: Int
    ) async {
        do {
            let page = try await relay.page(in: spaceId, after: cursor)
            guard !Task.isCancelled, generation == self.generation else { return }
            paging = nil
            read(page)
            absorb(page)
        } catch {
            guard !Task.isCancelled, generation == self.generation else { return }
            paging = nil
            if error is CancellationError {
                nextPage = .available
            } else if (error as? ConversationCallError)?.isUnreadableCursor == true {
                nextCursor = nil
                reload()
            } else {
                nextPage = .failed
            }
        }
    }

    private func mergeFirstPage() {
        guard phase == .loaded, nextPage != .complete, merging == nil, let spaceId, let relay
        else { return }
        let generation = generation
        merging = Task {
            let page = try? await relay.page(in: spaceId, after: nil)
            guard !Task.isCancelled, generation == self.generation else { return }
            merging = nil
            guard let page else { return }
            pinnedIds = pinnedIds(of: page, among: companions)
            absorb(page)
        }
    }

    private func absorb(_ page: ConversationPage) {
        let paged = Self.summaries(of: page, among: companions, authorship: authorship)
        let states = Dictionary(paged.map { ($0.id, $0.state) }) { _, last in last }
        let known = rows.map { row in
            var row = row
            row.state = states[row.id] ?? row.state
            return row
        }
        let knownIds = Set(rows.map(\.id))
        publish(known + paged.filter { !knownIds.contains($0.id) })
    }

    private func pinnedIds(of page: ConversationPage, among companions: [Companion]) -> [String] {
        let paged = page.pinned.map { row in
            (id: Self.subject(of: row, among: companions).id, position: row.pinPosition ?? 0)
        }
        let pagedIds = Set(paged.map(\.id))
        let unpaged = companions.compactMap { companion in
            companionPins[companion.id].flatMap { position in
                pagedIds.contains(companion.id) ? nil : (id: companion.id, position: position)
            }
        }
        return (paged + unpaged).enumerated().sorted { left, right in
            left.element.position == right.element.position
                ? left.offset < right.offset : left.element.position < right.element.position
        }
        .map(\.element.id)
    }

    private func read(_ page: ConversationPage?) {
        nextCursor = page?.nextCursor
        horizon =
            nextCursor == nil
            ? nil : page?.conversations.last.map { Date(milliseconds: $0.lastActivityAt) }
        nextPage = nextCursor == nil ? .complete : .available
    }

    private static func summaries(
        of page: ConversationPage?, among companions: [Companion], authorship: ThreadAuthorship
    ) -> [ConversationSummary] {
        guard let page else { return [] }
        return (page.pinned + page.conversations).map { row in
            ConversationSummary(
                subject: subject(of: row, among: companions), conversationId: row.group.id,
                lastMessage: row.lastWord.map { MessagePreview($0, authorship: authorship) },
                activeAt: Date(milliseconds: row.lastActivityAt), state: row.state)
        }
    }

    private static func subject(of row: ConversationInPage, among companions: [Companion])
        -> ConversationSubject
    {
        guard let soloBotId = row.soloBotId,
            let companion = companions.first(where: { $0.id == soloBotId })
                ?? row.group.authors.first(where: { $0.id == soloBotId })
        else { return .group(row.group) }
        return .companion(companion)
    }

    private nonisolated static func summary(
        of subject: ConversationSubject, in spaceId: String, through relay: ConversationRelay,
        authorship: ThreadAuthorship
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
            lastMessage: last.map { MessagePreview($0, authorship: authorship) })
    }

    private func publish(_ changed: [ConversationSummary]) {
        let time = ConversationTime(now: now(), calendar: calendar)
        rows = changed.map { summary in
            var summary = summary
            summary.timeLabel = summary.lastMessage.map { time.listLabel(for: $0.sentAt) }
            let lastMessage = summary.lastMessage?.naming(summary.subject.namedAuthors)
            switch summary.subject {
            case .companion:
                summary.preview = lastMessage?.line
            case .group(let group):
                summary.preview = lastMessage?.line(among: group.members)
            }
            if summary.state != .idle {
                summary.timeLabel = String(localized: "Now")
            }
            if summary.isWorking {
                summary.preview = String(localized: "working…")
            }
            return summary
        }
        pinned = pinnedIds.compactMap { id in rows.first { $0.id == id } }
        let unpinned = rows.filter { !pinnedIds.contains($0.id) && isWithinReadPages($0) }
        summaries = Self.ordered(unpinned)
    }

    private func isWithinReadPages(_ summary: ConversationSummary) -> Bool {
        guard case .companion = summary.subject, let horizon else { return true }
        return summary.lastActivity >= horizon
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
