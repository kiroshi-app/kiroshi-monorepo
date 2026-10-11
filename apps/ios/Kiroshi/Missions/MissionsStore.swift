import Foundation
import Observation

@MainActor
@Observable
final class MissionsStore {
    private(set) var entries: [MissionInSpace] = [] {
        didSet { sections = MissionSection.sections(of: entries) }
    }
    private(set) var sections: [MissionSection] = []
    private(set) var companions: [String: MissionCompanion] = [:]
    private(set) var hasLoaded = false
    private(set) var hasFailed = false

    @ObservationIgnored private let now: () -> Date
    @ObservationIgnored private var instanceId: Space.ID?
    @ObservationIgnored private var rereads: AsyncStream<String>.Continuation?
    @ObservationIgnored private var sharedSpaceId: String?

    init(now: @escaping () -> Date = Date.init) {
        self.now = now
    }

    func companion(of mission: Mission) -> MissionCompanion? {
        companions[mission.botId]
    }

    func follow(_ connection: RelayConnection) async {
        if instanceId != connection.instanceId {
            instanceId = connection.instanceId
            entries = []
            companions = [:]
            hasLoaded = false
        }
        hasFailed = false
        let updates = await connection.updates()
        let (spaceIds, rereads) = AsyncStream.makeStream(
            of: String.self, bufferingPolicy: .bufferingNewest(1))
        self.rereads = rereads
        await withDiscardingTaskGroup { group in
            group.addTask {
                await self.reread(spaceIds, through: MissionsRelay(connection: connection))
            }
            for await update in updates {
                apply(update)
            }
            rereads.finish()
        }
        self.rereads = nil
    }

    func retry() {
        guard let sharedSpaceId else { return }
        hasFailed = false
        rereads?.yield(sharedSpaceId)
    }

    private func apply(_ update: RelayUpdate) {
        switch update {
        case .state(.online(let spaceId)):
            sharedSpaceId = spaceId
            rereads?.yield(spaceId)
        case .state:
            break
        case .event(let event):
            guard let changed = MissionChanged(event), let sharedSpaceId else { return }
            entries = entries.map { entry in
                guard entry.mission.id == changed.missionId else { return entry }
                var moved = entry
                moved.mission = entry.mission.moved(by: changed)
                return moved
            }
            rereads?.yield(sharedSpaceId)
        }
    }

    private func reread(_ spaceIds: AsyncStream<String>, through relay: MissionsRelay) async {
        for await spaceId in spaceIds {
            if let companions = try? await relay.companions(spaceId: spaceId) {
                self.companions = Dictionary(
                    companions.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
            }
            let closedSince = Int(now().timeIntervalSince1970 * 1000)
            do {
                entries = try await relay.feed(spaceId: spaceId, closedSince: closedSince)
                hasLoaded = true
                hasFailed = false
            } catch {
                hasFailed = !hasLoaded
            }
        }
    }
}
