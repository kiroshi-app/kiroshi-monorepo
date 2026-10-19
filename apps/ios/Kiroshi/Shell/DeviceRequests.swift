import CryptoKit
import Foundation
import Observation

struct DeviceRequest: Equatable, Identifiable {
    static let approvalWindow: TimeInterval = 30 * 60

    let device: AccountDevice
    let fingerprint: [String]

    var id: String { device.id }

    var askedAt: Date? {
        device.approvalExpiresAt?.addingTimeInterval(-Self.approvalWindow)
    }
}

enum DeviceRequestProblem: Equatable {
    case couldNotApprove
    case couldNotRefuse
    case expired
}

@MainActor
@Observable
final class DeviceRequests {
    static let checkInterval = Duration.seconds(15)

    private(set) var asking: DeviceRequest?
    private(set) var isDeciding = false
    private(set) var problem: DeviceRequestProblem?

    @ObservationIgnored private let bearer: String
    @ObservationIgnored private let cloud: KiroshiCloud
    @ObservationIgnored private let states: any DeviceStates
    @ObservationIgnored private let clock: any RelayClock
    @ObservationIgnored private let now: @Sendable () -> Date
    @ObservationIgnored private var answered: Set<AccountDevice.ID> = []
    @ObservationIgnored private var words: [String]?
    @ObservationIgnored private(set) var decision: Task<Void, Never>?

    init(
        bearer: String, cloud: KiroshiCloud, states: any DeviceStates, clock: any RelayClock,
        now: @escaping @Sendable () -> Date = Date.init
    ) {
        self.bearer = bearer
        self.cloud = cloud
        self.states = states
        self.clock = clock
        self.now = now
    }

    func watch() async {
        while !Task.isCancelled {
            guard let answer = try? await states.devices(bearer: bearer) else { return }
            if case .devices(let devices) = answer, asking == nil {
                await ask(about: devices)
            }
            do {
                try await clock.sleep(for: Self.checkInterval)
            } catch {
                return
            }
        }
    }

    func approve() {
        decide(failing: .couldNotApprove) { [cloud, bearer] id in
            try await cloud.approveDevice(id, bearer: bearer)
        }
    }

    func refuse() {
        decide(failing: .couldNotRefuse) { [cloud, bearer] id in
            try await cloud.refuseDevice(id, bearer: bearer)
        }
    }

    func dismiss() {
        decision?.cancel()
        if let asking {
            answered.insert(asking.id)
        }
        asking = nil
        isDeciding = false
        problem = nil
    }

    private func ask(about devices: [AccountDevice]) async {
        let moment = now()
        guard
            let device = devices.first(where: {
                $0.isAsking(at: moment) && !answered.contains($0.id)
            }),
            let key = try? Curve25519.Signing.PublicKey(rawRepresentation: device.signingKey)
        else { return }
        if words == nil {
            words = await Self.bundledWords()
        }
        guard asking == nil, let words else { return }
        asking = DeviceRequest(device: device, fingerprint: Fingerprint.of(key, words: words))
        problem = nil
    }

    private func decide(
        failing failure: DeviceRequestProblem,
        _ call: @escaping @Sendable (String) async throws -> DeviceDecisionAnswer
    ) {
        guard let asking, !isDeciding else { return }
        isDeciding = true
        problem = nil
        decision = Task { [weak self] in
            let answer = try? await call(asking.id)
            self?.settle(asking, with: answer, failing: failure)
        }
    }

    private func settle(
        _ request: DeviceRequest, with answer: DeviceDecisionAnswer?,
        failing failure: DeviceRequestProblem
    ) {
        guard asking == request else { return }
        isDeciding = false
        switch answer {
        case .decided, .alreadyApproved, .notFound:
            answered.insert(request.id)
            asking = nil
        case .expired: problem = .expired
        case .unauthenticated, .unreachable: problem = failure
        case nil: break
        }
    }

    @concurrent private static func bundledWords() async -> [String]? {
        Fingerprint.bundledWords()
    }
}
