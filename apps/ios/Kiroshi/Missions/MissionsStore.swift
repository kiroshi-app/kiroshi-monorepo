import Foundation
import Observation

@MainActor
@Observable
final class MissionsStore {
    static let prefetchDistance = 5

    private(set) var entries: [MissionInSpace] = [] {
        didSet {
            sections = MissionSection.sections(of: entries)
            sectionsByConversation = Dictionary(grouping: entries, by: \.conversationId)
                .mapValues(MissionSection.sections(of:))
        }
    }
    private(set) var sections: [MissionSection] = []
    private var sectionsByConversation: [String: [MissionSection]] = [:]
    private(set) var companions: [String: MissionCompanion] = [:]
    private(set) var hasLoaded = false
    private(set) var hasFailed = false
    private(set) var nextPage = NextPage.complete

    @ObservationIgnored private let now: () -> Date
    @ObservationIgnored private var instanceId: Space.ID?
    @ObservationIgnored private var sharedSpaceId: String?
    @ObservationIgnored private var relay: MissionsRelay?
    @ObservationIgnored private var reading: Task<Void, Never>?
    @ObservationIgnored private var paging: Task<Void, Never>?
    @ObservationIgnored private var merging: Task<Void, Never>?
    @ObservationIgnored private var nextCursor: String?
    @ObservationIgnored private var closedSince = 0
    @ObservationIgnored private var generation = 0
    @ObservationIgnored private var readsWholeFeed = false

    init(now: @escaping () -> Date = Date.init) {
        self.now = now
    }

    func sections(in conversationId: String?) -> [MissionSection] {
        guard let conversationId else { return sections }
        return sectionsByConversation[conversationId] ?? []
    }

    func companion(of mission: Mission) -> MissionCompanion? {
        companions[mission.botId]
    }

    func detailLine(of mission: Mission) -> String {
        mission.detailLine(companion: companion(of: mission), among: Array(companions.values))
    }

    func live(_ mission: Mission) -> Mission {
        entries.first { $0.mission.id == mission.id }?.mission ?? mission
    }

    func follow(_ connection: RelayConnection) async {
        if instanceId != connection.instanceId {
            instanceId = connection.instanceId
            entries = []
            companions = [:]
            hasLoaded = false
            nextCursor = nil
            nextPage = .complete
            readsWholeFeed = false
        }
        hasFailed = false
        relay = MissionsRelay(connection: connection)
        for await update in await connection.updates() {
            apply(update)
        }
        for task in [reading, paging, merging] {
            task?.cancel()
        }
        reading = nil
        paging = nil
        merging = nil
        relay = nil
    }

    func retry() {
        hasFailed = false
        reread()
    }

    func refresh() async {
        await reread()?.value
    }

    func rowAppeared(_ mission: Mission, in conversationId: String?) {
        let shown = sections(in: conversationId).flatMap(\.missions)
        guard let index = shown.firstIndex(where: { $0.id == mission.id }),
            index >= shown.count - Self.prefetchDistance
        else { return }
        loadMore()
    }

    func loadMore() {
        guard nextPage == .available || nextPage == .failed, let cursor = nextCursor,
            let sharedSpaceId, let relay
        else { return }
        nextPage = .loading
        let generation = generation
        paging = Task {
            await readPage(
                after: cursor, in: sharedSpaceId, through: relay, generation: generation)
        }
    }

    private func apply(_ update: RelayUpdate) {
        switch update {
        case .state(.online(let spaceId)):
            sharedSpaceId = spaceId
            reread()
        case .state:
            break
        case .event(let event):
            guard let changed = MissionChanged(event), sharedSpaceId != nil else { return }
            entries = entries.map { entry in
                guard entry.mission.id == changed.missionId else { return entry }
                var moved = entry
                moved.mission = entry.mission.moved(by: changed)
                return moved
            }
            mergeFirstPage()
        }
    }

    @discardableResult
    private func reread() -> Task<Void, Never>? {
        guard let sharedSpaceId, let relay else { return nil }
        for task in [reading, paging, merging] {
            task?.cancel()
        }
        paging = nil
        merging = nil
        generation += 1
        if nextPage != .complete {
            nextPage = .loading
        }
        let generation = generation
        let task = Task {
            await readFirstPage(in: sharedSpaceId, through: relay, generation: generation)
        }
        reading = task
        return task
    }

    private func readFirstPage(in spaceId: String, through relay: MissionsRelay, generation: Int)
        async
    {
        if let companions = try? await relay.companions(spaceId: spaceId) {
            guard !Task.isCancelled, generation == self.generation else { return }
            self.companions = Dictionary(
                companions.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        }
        let closedSince = Int(now().timeIntervalSince1970 * 1000)
        do {
            let page = try await firstPage(in: spaceId, closedSince: closedSince, through: relay)
            guard !Task.isCancelled, generation == self.generation else { return }
            self.closedSince = closedSince
            entries = Self.unique(page.missions)
            read(page)
            hasLoaded = true
            hasFailed = false
        } catch {
            guard !Task.isCancelled, generation == self.generation else { return }
            nextPage = nextCursor == nil ? .complete : .available
            hasFailed = !hasLoaded
        }
    }

    private func firstPage(in spaceId: String, closedSince: Int, through relay: MissionsRelay)
        async throws -> MissionSpacePage
    {
        if !readsWholeFeed {
            do {
                return try await relay.page(
                    spaceId: spaceId, closedSince: closedSince, after: nil)
            } catch MissionsCallError.unknownToTheHost {
                readsWholeFeed = true
            }
        }
        let feed = try await relay.feed(spaceId: spaceId, closedSince: closedSince)
        return MissionSpacePage(missions: feed, nextCursor: nil)
    }

    private func readPage(
        after cursor: String, in spaceId: String, through relay: MissionsRelay, generation: Int
    ) async {
        do {
            let page = try await relay.page(
                spaceId: spaceId, closedSince: closedSince, after: cursor)
            guard !Task.isCancelled, generation == self.generation else { return }
            paging = nil
            entries = Self.unique(entries + page.missions)
            read(page)
        } catch {
            guard !Task.isCancelled, generation == self.generation else { return }
            paging = nil
            switch error {
            case is CancellationError: nextPage = .available
            case MissionsCallError.unreadableCursor:
                nextCursor = nil
                reread()
            default: nextPage = .failed
            }
        }
    }

    private func mergeFirstPage() {
        guard hasLoaded, merging == nil, let sharedSpaceId, let relay else { return }
        let generation = generation
        merging = Task {
            let closedSince = Int(now().timeIntervalSince1970 * 1000)
            let page = try? await firstPage(
                in: sharedSpaceId, closedSince: closedSince, through: relay)
            guard !Task.isCancelled, generation == self.generation else { return }
            merging = nil
            guard let page else { return }
            guard nextCursor != nil || page.nextCursor != nil else {
                entries = Self.unique(page.missions)
                return
            }
            entries = Self.unique(page.missions + entries)
        }
    }

    private func read(_ page: MissionSpacePage) {
        nextCursor = page.nextCursor
        nextPage = nextCursor == nil ? .complete : .available
    }

    private static func unique(_ entries: [MissionInSpace]) -> [MissionInSpace] {
        var seen = Set<String>()
        return entries.filter { seen.insert($0.mission.id).inserted }
    }
}
