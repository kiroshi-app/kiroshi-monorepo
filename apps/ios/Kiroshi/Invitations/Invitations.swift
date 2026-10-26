import Foundation
import Observation

enum InvitationPhase: Equatable, Sendable {
    case open
    case joining
    case waitingForHost
    case couldNotAccept
    case refused(InvitationRefusal)
}

@MainActor
@Observable
final class Invitations {
    static let listingReads = 3
    static let listingRetry = Duration.milliseconds(500)

    private(set) var pending: [Invitation] = []
    var opened: Invitation?
    private(set) var phases: [Invitation.ID: InvitationPhase] = [:]
    private(set) var details: [Invitation.ID: ValidInvitation] = [:]
    private(set) var isDeclining = false
    private(set) var hasFailedToDecline = false

    @ObservationIgnored private let cloud: CloudInvitations
    @ObservationIgnored private let instances: KiroshiCloud
    @ObservationIgnored private let baseURL: URL
    @ObservationIgnored private let bearer: String
    @ObservationIgnored private let device: RelayDevice
    @ObservationIgnored private let relay: RelayEnvironment
    @ObservationIgnored private let joined: (Space) -> Void
    @ObservationIgnored private let signedOut: () -> Void
    @ObservationIgnored private var linkedId: String?
    @ObservationIgnored private(set) var joins: [Invitation.ID: Task<Void, Never>] = [:]
    @ObservationIgnored private(set) var link: Task<Void, Never>?
    @ObservationIgnored private(set) var declining: Task<Void, Never>?

    init(
        bearer: String, device: RelayDevice, cloud: KiroshiCloud, relay: RelayEnvironment,
        joined: @escaping (Space) -> Void, signedOut: @escaping () -> Void
    ) {
        self.bearer = bearer
        self.device = device
        self.cloud = cloud.invitations
        instances = cloud
        baseURL = cloud.baseURL
        self.relay = relay
        self.joined = joined
        self.signedOut = signedOut
    }

    func phase(of invitation: Invitation) -> InvitationPhase {
        phases[invitation.id] ?? .open
    }

    func refresh() async {
        guard let answer = try? await cloud.list(bearer: bearer) else { return }
        switch answer {
        case .invitations(let listed):
            pending = listed
            if let linkedId {
                await show(linkedId)
            }
        case .unauthenticated: signedOut()
        case .unreachable: break
        }
    }

    func open(_ invitation: Invitation) {
        hasFailedToDecline = false
        opened = invitation
    }

    func openLink(_ invitationId: String) {
        linkedId = invitationId
        link?.cancel()
        link = Task { [weak self] in await self?.refresh() }
    }

    func readState(of invitation: Invitation) async {
        guard details[invitation.id] == nil,
            let answer = try? await cloud.state(of: invitation.id)
        else { return }
        switch answer {
        case .valid(let valid):
            details[invitation.id] = valid
        case .refused(let refusal) where phase(of: invitation) == .open:
            phases[invitation.id] = .refused(refusal)
        case .refused, .unreachable:
            break
        }
    }

    func accept(_ invitation: Invitation) {
        guard joins[invitation.id] == nil else { return }
        phases[invitation.id] = .joining
        joins[invitation.id] = Task { [weak self] in await self?.join(invitation) }
    }

    func decline(_ invitation: Invitation) {
        guard declining == nil else { return }
        isDeclining = true
        hasFailedToDecline = false
        declining = Task { [weak self] in
            await self?.answerNo(to: invitation)
            self?.isDeclining = false
            self?.declining = nil
        }
    }

    func stop() {
        link?.cancel()
        declining?.cancel()
        for join in joins.values {
            join.cancel()
        }
    }

    private func show(_ invitationId: String) async {
        linkedId = nil
        if let listed = pending.first(where: { $0.id == invitationId }) {
            open(listed)
            return
        }
        let answer = try? await cloud.state(of: invitationId)
        var shown = Invitation(id: invitationId, instanceId: "", instanceName: "", inviterEmail: "")
        switch answer {
        case .valid(let valid):
            shown = Invitation(
                id: invitationId, instanceId: "", instanceName: valid.spaceName,
                inviterEmail: valid.inviter, colour: valid.colour)
            details[invitationId] = valid
            phases[invitationId] = .refused(.otherEmail)
        case .refused(let refusal):
            phases[invitationId] = .refused(refusal)
        case .unreachable, nil:
            linkedId = invitationId
            return
        }
        open(shown)
    }

    private func join(_ invitation: Invitation) async {
        defer { joins[invitation.id] = nil }
        let answer = try? await cloud.accept(invitation, bearer: bearer)
        guard !Task.isCancelled else { return }
        switch answer {
        case .done:
            await awaitKey(of: invitation)
        case .refused(let refusal):
            phases[invitation.id] = .refused(refusal)
        case .unauthenticated:
            signedOut()
        case .unreachable, nil:
            phases[invitation.id] = .couldNotAccept
        }
    }

    private func awaitKey(of invitation: Invitation) async {
        let connection = RelayConnection(
            baseURL: baseURL, instanceId: invitation.instanceId, bearer: bearer, device: device,
            spaceKeys: nil, environment: relay)
        let updates = await connection.updates()
        await connection.start()
        for await update in updates {
            guard case .state(let state) = update else { continue }
            switch state {
            case .online:
                await connection.stop()
                let listed = await listedSpace(of: invitation)
                guard !Task.isCancelled else { return }
                finish(invitation, as: listed)
                return
            case .joining:
                phases[invitation.id] = .joining
            case .hostOffline:
                phases[invitation.id] = .waitingForHost
            case .signedOut:
                await connection.stop()
                signedOut()
                return
            case .membershipEnded, .deviceMoved:
                await connection.stop()
                phases[invitation.id] = .couldNotAccept
                return
            case .paused, .connecting, .invitationPending, .unreachable:
                break
            }
        }
        await connection.stop()
    }

    private func listedSpace(of invitation: Invitation) async -> Space? {
        for read in 1...Self.listingReads {
            if case .spaces(let listed) = try? await instances.spaces(bearer: bearer),
                let space = listed.first(where: { $0.id == invitation.instanceId })
            {
                return space
            }
            guard read < Self.listingReads,
                (try? await relay.clock.sleep(for: Self.listingRetry)) != nil
            else { return nil }
        }
        return nil
    }

    private func finish(_ invitation: Invitation, as listed: Space?) {
        pending.removeAll { $0.id == invitation.id }
        phases[invitation.id] = nil
        if opened?.id == invitation.id {
            opened = nil
        }
        joined(
            listed
                ?? Space(
                    id: invitation.instanceId, name: invitation.instanceName, role: .member,
                    isHostOnline: true, colour: invitation.colour))
    }

    private func answerNo(to invitation: Invitation) async {
        let isAccepted = phase(of: invitation) == .waitingForHost
        let answer =
            isAccepted
            ? try? await cloud.leave(invitation, bearer: bearer)
            : try? await cloud.decline(invitation, bearer: bearer)
        guard !Task.isCancelled else { return }
        switch answer {
        case .done:
            joins[invitation.id]?.cancel()
            pending.removeAll { $0.id == invitation.id }
            phases[invitation.id] = nil
            if opened?.id == invitation.id {
                opened = nil
            }
        case .refused(let refusal):
            phases[invitation.id] = .refused(refusal)
        case .unauthenticated:
            signedOut()
        case .unreachable, nil:
            hasFailedToDecline = true
        }
    }
}
