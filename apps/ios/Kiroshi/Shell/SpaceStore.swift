import Foundation
import Observation

enum ShellExit: Equatable {
    case signedOut
    case deviceMoved
    case noSpaceLeft
}

@MainActor
@Observable
final class SpaceStore {
    private(set) var spaces: [Space]
    private(set) var currentSpaceId: Space.ID
    private(set) var connection: RelayConnection?
    private(set) var pictures: CompanionPictures?
    private(set) var spaceIdsToJoin: Set<Space.ID> = []
    let email: String
    let accountId: String?
    let work = CompanionWork()

    @ObservationIgnored private let cloud: KiroshiCloud
    @ObservationIgnored private let bearer: String
    @ObservationIgnored private let device: RelayDevice
    @ObservationIgnored private let lastSpace: any LastSpaceStore
    @ObservationIgnored private let relay: RelayEnvironment
    @ObservationIgnored private let exit: (ShellExit) -> Void
    @ObservationIgnored private var hasLeft = false
    @ObservationIgnored private var leaving: Task<Void, Never>?

    init(
        spaces: [Space],
        session: Session,
        device: RelayDevice,
        cloud: KiroshiCloud,
        lastSpace: any LastSpaceStore,
        relay: RelayEnvironment,
        exit: @escaping (ShellExit) -> Void
    ) {
        self.spaces = spaces
        email = session.email
        accountId = session.userId
        bearer = session.bearer
        self.device = device
        self.cloud = cloud
        self.lastSpace = lastSpace
        self.relay = relay
        self.exit = exit
        let last = lastSpace.load()
        currentSpaceId = spaces.first { $0.id == last }?.id ?? spaces.first?.id ?? ""
    }

    var currentSpace: Space? {
        spaces.first { $0.id == currentSpaceId }
    }

    var authorship: ThreadAuthorship {
        ThreadAuthorship(accountId: accountId, isHostedByYou: currentSpace?.role != .member)
    }

    var accountInitial: String {
        email.first.map { String($0).uppercased() } ?? ""
    }

    var offlineSpace: Space? {
        currentSpace.flatMap { $0.isHostOnline ? nil : $0 }
    }

    var spaceToJoin: Space? {
        currentSpace.flatMap { spaceIdsToJoin.contains($0.id) ? $0 : nil }
    }

    func select(_ id: Space.ID) {
        guard spaces.contains(where: { $0.id == id }) else { return }
        currentSpaceId = id
        lastSpace.save(id)
    }

    func follow() async {
        guard !hasLeft else { return }
        let spaceId = currentSpaceId
        work.forget()
        let spaceKeys = await relay.spaceKeys.keys(for: spaceId, openedWith: device.keys)
        guard !hasLeft else { return }
        let connection = RelayConnection(
            baseURL: cloud.baseURL, instanceId: spaceId, bearer: bearer, device: device,
            spaceKeys: spaceKeys, environment: relay)
        self.connection = connection
        pictures = CompanionPictures(connection: connection)
        let updates = await connection.updates()
        if !hasLeft {
            await connection.start()
            for await update in updates {
                work.apply(update)
                guard case .state(let state) = update else { continue }
                apply(state, to: spaceId)
            }
        }
        await connection.stop()
        if self.connection === connection {
            self.connection = nil
            pictures = nil
            work.forget()
        }
    }

    func leave() {
        hasLeft = true
        guard let connection else { return }
        leaving = Task { await connection.stop() }
    }

    func refreshSpaces() async {
        guard let answer = try? await cloud.spaces(bearer: bearer), !hasLeft else { return }
        switch answer {
        case .spaces(let fresh) where fresh.isEmpty:
            exit(.noSpaceLeft)
        case .spaces(let fresh):
            spaces = fresh
            if currentSpace == nil, let first = fresh.first {
                select(first.id)
            }
        case .unauthenticated:
            exit(.signedOut)
        case .unreachable:
            break
        }
    }

    private func apply(_ state: RelayState, to spaceId: Space.ID) {
        guard !hasLeft else { return }
        switch state {
        case .online:
            spaceIdsToJoin.remove(spaceId)
            setHost(of: spaceId, online: true)
        case .hostOffline: setHost(of: spaceId, online: false)
        case .joining: spaceIdsToJoin.insert(spaceId)
        case .signedOut: exit(.signedOut)
        case .deviceMoved: exit(.deviceMoved)
        case .membershipEnded: forget(spaceId)
        case .paused, .connecting, .invitationPending, .unreachable: break
        }
    }

    private func setHost(of spaceId: Space.ID, online: Bool) {
        guard let index = spaces.firstIndex(where: { $0.id == spaceId }) else { return }
        spaces[index].isHostOnline = online
    }

    private func forget(_ spaceId: Space.ID) {
        spaces.removeAll { $0.id == spaceId }
        if lastSpace.load() == spaceId {
            lastSpace.clear()
        }
        guard let first = spaces.first else {
            exit(.noSpaceLeft)
            return
        }
        if currentSpaceId == spaceId {
            currentSpaceId = first.id
        }
    }
}
