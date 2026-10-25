import CryptoKit
import Foundation
import os

enum RelayCallError: Error, Equatable {
    case notConnected
    case connectionClosed
    case hostOffline
    case timedOut
    case counterUnreadable
    case challengeRefused
}

actor RelayConnection {
    static let pingInterval = Duration.seconds(30)
    static let silentPingsBeforeDrop = 3
    static let sharedSpaceDeadline = Duration.seconds(30)
    static let callDeadline = Duration.seconds(300)
    static let hello = Data(#"{"hello":{}}"#.utf8)
    static let noKeyId: UInt32 = 0

    let instanceId: Space.ID
    private(set) var state: RelayState = .paused
    private let request: URLRequest
    private let device: RelayDevice
    private var spaceKeys: SpaceKeys?
    private let spaceKeyStore: any SpaceKeyStore
    private let transport: any RelayTransport
    private let clock: any RelayClock
    private let counters: FrameCounters
    private var backoff: Backoff
    private var run: Task<Void, Never>?
    private var socket: (any RelaySocket)?
    private var outbox: AsyncStream<RelayOutgoing>.Continuation?
    private var silentPings = 0
    private var nextCallId = 1
    private var challenge: Data?
    private var keyAskedUnder: UInt32?
    private var pendingCalls: [Int: CheckedContinuation<RelayAnswer, any Error>] = [:]
    private var flights: [Int: RelayFlight] = [:]
    private var callTasks: [Int: Task<Void, Never>] = [:]
    private var subscribers: [UUID: AsyncStream<RelayUpdate>.Continuation] = [:]

    init(
        baseURL: URL,
        instanceId: Space.ID,
        bearer: String,
        device: RelayDevice,
        spaceKeys: SpaceKeys?,
        environment: RelayEnvironment,
        backoff: Backoff = Backoff()
    ) {
        self.instanceId = instanceId
        request = Self.memberRequest(
            baseURL: baseURL, instanceId: instanceId, bearer: bearer, device: device.relayId)
        self.device = device
        self.spaceKeys = spaceKeys
        spaceKeyStore = environment.spaceKeys
        transport = environment.transport
        clock = environment.clock
        counters = environment.counters
        self.backoff = backoff
    }

    var isRunning: Bool {
        run != nil
    }

    func updates() -> AsyncStream<RelayUpdate> {
        let (stream, continuation) = AsyncStream.makeStream(
            of: RelayUpdate.self, bufferingPolicy: .bufferingNewest(64))
        let id = UUID()
        continuation.onTermination = { [weak self] _ in
            Task { await self?.drop(id) }
        }
        continuation.yield(.state(state))
        subscribers[id] = continuation
        return stream
    }

    var subscriberCount: Int {
        subscribers.count
    }

    func start() {
        guard run == nil else { return }
        backoff.reset()
        run = Task { await self.connectUntilStopped() }
    }

    func stop() {
        run?.cancel()
        run = nil
        socket?.close()
        socket = nil
        challenge = nil
        failPendingCalls()
        publish(.paused)
        for subscriber in subscribers.values {
            subscriber.finish()
        }
        subscribers = [:]
    }

    func call(_ command: String) async throws -> RelayAnswer {
        try await call(command, args: RelayNoArgs?.none, deadline: Self.callDeadline)
    }

    func call(_ command: String, args: some Encodable & Sendable) async throws -> RelayAnswer {
        try await call(command, args: args, deadline: Self.callDeadline)
    }

    private func call(
        _ command: String, args: (some Encodable)?, deadline: Duration
    ) async throws -> RelayAnswer {
        guard socket != nil, outbox != nil else { throw RelayCallError.notConnected }
        let id = nextCallId
        nextCallId += 1
        let frame = try JSONEncoder().encode(RelayCallFrame(id: id, command: command, args: args))
        return try await withCheckedThrowingContinuation { continuation in
            pendingCalls[id] = continuation
            flights[id] = RelayFlight(plaintext: frame, stage: .awaitingChallenge)
            if challenge != nil {
                queue(id)
            }
            callTasks[id] = Task { [clock] in
                do {
                    try await clock.sleep(for: deadline)
                } catch {
                    return
                }
                self.settle(id, with: .failure(RelayCallError.timedOut))
            }
        }
    }

    private func connectUntilStopped() async {
        while !Task.isCancelled {
            publish(.connecting)
            let ending = await connectOnce()
            guard !Task.isCancelled else { return }
            publish(ending.state)
            guard ending.retries else {
                run = nil
                return
            }
            do {
                try await clock.sleep(for: backoff.next())
            } catch {
                return
            }
        }
    }

    private func connectOnce() async -> RelayEnding {
        let opened: any RelaySocket
        do {
            opened = try await transport.open(request)
        } catch let refusal as RelayRefusal {
            return RelayEnding(handshakeStatus: refusal.status)
        } catch let closure as RelayClosure {
            return RelayEnding(closeCode: closure.code)
        } catch {
            return RelayEnding(.unreachable, retries: true)
        }
        guard !Task.isCancelled else {
            opened.close()
            return RelayEnding(.paused, retries: false)
        }
        if spaceKeys == nil {
            switch await awaitKey(on: opened) {
            case .keyed: break
            case .ended(let ending): return ending
            }
            guard !Task.isCancelled else {
                opened.close()
                return RelayEnding(.paused, retries: false)
            }
        }
        let (outgoing, outbox) = AsyncStream.makeStream(
            of: RelayOutgoing.self, bufferingPolicy: .unbounded)
        socket = opened
        challenge = nil
        keyAskedUnder = nil
        self.outbox = outbox
        outbox.yield(.hello)
        backoff.reset()
        silentPings = 0
        let ending = await withTaskGroup(of: RelayEnding?.self) { group in
            group.addTask { await self.receiveUntilClosed(opened) }
            group.addTask { await self.sendUntilClosed(opened, outgoing) }
            group.addTask { await self.keepAlive(opened) }
            group.addTask { await self.askSharedSpace() }
            var ending = RelayEnding(.unreachable, retries: true)
            for await finished in group {
                if let finished {
                    ending = finished
                    break
                }
            }
            opened.close()
            group.cancelAll()
            return ending
        }
        outbox.finish()
        if !Task.isCancelled {
            socket = nil
            self.outbox = nil
            challenge = nil
            failPendingCalls(with: ending.state == .hostOffline ? .hostOffline : .connectionClosed)
        }
        return ending
    }

    private func awaitKey(on socket: any RelaySocket) async -> KeyWait {
        publish(.joining)
        silentPings = 0
        return await withTaskGroup(of: KeyWait?.self) { group in
            group.addTask { await self.receiveKey(on: socket) }
            group.addTask { await self.askForKey(on: socket) }
            group.addTask { await self.keepAlive(socket).map(KeyWait.ended) }
            var outcome = KeyWait.ended(RelayEnding(.unreachable, retries: true))
            for await finished in group {
                if let finished {
                    outcome = finished
                    break
                }
            }
            if case .ended = outcome {
                socket.close()
            }
            group.cancelAll()
            return outcome
        }
    }

    private func receiveKey(on socket: any RelaySocket) async -> KeyWait? {
        do {
            while true {
                let text = try await socket.receive()
                silentPings = 0
                if let keys = await keys(handedIn: text) {
                    return .keyed(keys)
                }
            }
        } catch let closure as RelayClosure {
            return .ended(RelayEnding(closeCode: closure.code))
        } catch {
            return .ended(RelayEnding(.unreachable, retries: true))
        }
    }

    private func keys(handedIn text: String) async -> SpaceKeys? {
        guard let handed = try? await Self.verifying(text, instance: instanceId, device: device)
        else { return nil }
        await persist(handed)
        if let held = spaceKeys {
            return held
        }
        spaceKeys = handed.spaceKeys
        return handed.spaceKeys
    }

    private func persist(_ handed: HandedSpaceKey) async {
        do {
            try await spaceKeyStore.save(handed, for: instanceId, sealedTo: device.keys)
        } catch {
            relayLog.error(
                "The key of a joined Space wasn't stored: \(String(describing: error), privacy: .public)"
            )
        }
    }

    private func askForKey(on socket: any RelaySocket) async -> KeyWait? {
        while true {
            do {
                try await socket.send(try await Self.keyRequest(in: instanceId, from: device))
            } catch {
                return .ended(RelayEnding(.unreachable, retries: true))
            }
            do {
                try await clock.sleep(for: Self.pingInterval)
            } catch {
                return nil
            }
        }
    }

    @concurrent private static func verifying(
        _ text: String, instance: Space.ID, device: RelayDevice
    ) async throws(RekeyRefusal) -> HandedSpaceKey {
        try SpaceHandover.firstRekey(text, instance: instance, device: device)
    }

    @concurrent private static func keyRequest(in instance: Space.ID, from device: RelayDevice)
        async throws -> String
    {
        guard
            let header = FrameHeader(
                instance: instance, from: device.keys.deviceId, keyId: noKeyId, ctr: 1)
        else { throw RelayCallError.connectionClosed }
        let sealed = try RelayCrypto.seal(
            hello, header: header, spaceKey: SymmetricKey(size: .bits256),
            signer: device.keys.signing)
        let frame = RelayWireFrame(
            v: 2, instance: instance, from: nil, to: nil, keyId: noKeyId, ctr: 1, challenge: nil,
            ct: sealed.ciphertext.base64EncodedString(),
            sig: sealed.signature.base64EncodedString())
        return String(decoding: try JSONEncoder().encode(frame), as: UTF8.self)
    }

    private func receiveUntilClosed(_ socket: any RelaySocket) async -> RelayEnding {
        do {
            while true {
                await heard(try await socket.receive())
            }
        } catch let closure as RelayClosure {
            return RelayEnding(closeCode: closure.code)
        } catch {
            return RelayEnding(.unreachable, retries: true)
        }
    }

    private func sendUntilClosed(_ socket: any RelaySocket, _ outgoing: AsyncStream<RelayOutgoing>)
        async -> RelayEnding?
    {
        for await next in outgoing {
            guard let keys = spaceKeys else { continue }
            switch next {
            case .hello:
                do {
                    let ctr = try await nextCtr(under: keys)
                    try await socket.send(
                        try await sealed(Self.hello, ctr: ctr, challenge: nil, under: keys))
                } catch {
                    failPendingCalls(with: error as? RelayCallError ?? .connectionClosed)
                    return RelayEnding(.unreachable, retries: true)
                }
            case .call(let id):
                await send(id, on: socket, under: keys)
            case .keyRequest:
                do {
                    try await socket.send(try await Self.keyRequest(in: instanceId, from: device))
                } catch {
                    return RelayEnding(.unreachable, retries: true)
                }
            }
        }
        return nil
    }

    private func send(_ id: Int, on socket: any RelaySocket, under keys: SpaceKeys) async {
        do {
            let ctr = try await nextCtr(under: keys)
            guard let flight = flights[id], case .queued = flight.stage, let challenge else {
                return
            }
            let plaintext = flight.plaintext
            flights[id]?.stage = .sent(under: challenge)
            try await socket.send(
                try await sealed(plaintext, ctr: ctr, challenge: challenge, under: keys))
        } catch let failure as RelayCallError {
            settle(id, with: .failure(failure))
        } catch {
            settle(id, with: .failure(RelayCallError.connectionClosed))
        }
    }

    private func nextCtr(under keys: SpaceKeys) async throws -> UInt64 {
        do {
            return try await counters.nextSent(in: instanceId, keyId: keys.keyId)
        } catch {
            throw RelayCallError.counterUnreadable
        }
    }

    private func sealed(
        _ plaintext: Data, ctr: UInt64, challenge: Data?, under keys: SpaceKeys
    ) async throws -> String {
        guard let from = aadDeviceId(ofWire: device.relayId),
            let header = FrameHeader(
                instance: instanceId, from: from, keyId: keys.keyId, ctr: ctr,
                challenge: challenge)
        else { throw RelayCallError.connectionClosed }
        let sealed = try await Self.sealing(
            plaintext, header: header, spaceKey: keys.spaceKey, signer: device.keys.signing)
        let frame = RelayWireFrame(
            v: 2, instance: instanceId, from: nil, to: nil, keyId: keys.keyId, ctr: ctr,
            challenge: challenge?.base64EncodedString(),
            ct: sealed.ciphertext.base64EncodedString(),
            sig: sealed.signature.base64EncodedString())
        return String(decoding: try JSONEncoder().encode(frame), as: UTF8.self)
    }

    private func open(_ frame: RelayWireFrame, under keys: SpaceKeys) async -> RelayOpenedFrame? {
        guard let header = header(of: frame),
            let ciphertext = Data(base64Encoded: frame.ct),
            let signature = Data(base64Encoded: frame.sig),
            let lastAccepted = try? await counters.lastAccepted(
                in: instanceId, from: header.from, keyId: header.keyId),
            let plaintext = try? await Self.opening(
                SealedFrame(ciphertext: ciphertext, signature: signature), header: header,
                lastAccepted: lastAccepted, sender: keys.hostSigningKey, spaceKey: keys.spaceKey)
        else { return nil }
        do {
            try await counters.accept(
                header.ctr, in: instanceId, from: header.from, keyId: header.keyId)
        } catch {
            return nil
        }
        return RelayOpenedFrame(header: header, plaintext: plaintext)
    }

    private func header(of frame: RelayWireFrame) -> FrameHeader? {
        guard let from = frame.from.flatMap(aadDeviceId(ofWire:)) else { return nil }
        var to: String?
        if let wireTo = frame.to {
            guard let mapped = aadDeviceId(ofWire: wireTo) else { return nil }
            to = mapped
        }
        var challenge: Data?
        if let encoded = frame.challenge {
            guard let decoded = Data(base64Encoded: encoded) else { return nil }
            challenge = decoded
        }
        return FrameHeader(
            instance: frame.instance, from: from, to: to, keyId: frame.keyId, ctr: frame.ctr,
            challenge: challenge)
    }

    // TODO: The relay names a device by the UUID POST /devices answered (`?device=`, `from`,
    // `to`), the AAD by the key-derived device_id of docs/relay/v2-protocol.md. This mapping is
    // still being confirmed with the host side and may change.
    private func aadDeviceId(ofWire relayId: String) -> String? {
        if relayId == device.relayId {
            return device.keys.deviceId
        }
        guard let spaceKeys, spaceKeys.hostRelayIds.contains(relayId) else { return nil }
        return RelayCrypto.deviceId(of: spaceKeys.hostSigningKey)
    }

    @concurrent private static func sealing(
        _ plaintext: Data, header: FrameHeader, spaceKey: SymmetricKey,
        signer: Curve25519.Signing.PrivateKey
    ) async throws -> SealedFrame {
        try RelayCrypto.seal(plaintext, header: header, spaceKey: spaceKey, signer: signer)
    }

    @concurrent private static func opening(
        _ frame: SealedFrame, header: FrameHeader, lastAccepted: UInt64,
        sender: Curve25519.Signing.PublicKey, spaceKey: SymmetricKey
    ) async throws(FrameRefusal) -> Data {
        try RelayCrypto.open(
            frame, header: header, lastAccepted: lastAccepted, sender: sender, spaceKey: spaceKey)
    }

    private func keepAlive(_ socket: any RelaySocket) async -> RelayEnding? {
        await withDiscardingTaskGroup { pings in
            while true {
                do {
                    try await clock.sleep(for: Self.pingInterval)
                } catch {
                    return nil
                }
                silentPings += 1
                if silentPings >= Self.silentPingsBeforeDrop {
                    return RelayEnding(.unreachable, retries: true)
                }
                pings.addTask {
                    guard (try? await socket.ping()) != nil else { return }
                    await self.heardPong()
                }
            }
        }
    }

    private func askSharedSpace() async -> RelayEnding? {
        guard
            let answer = try? await call(
                "relay_shared_space", args: RelayNoArgs?.none, deadline: Self.sharedSpaceDeadline),
            answer.status == 200,
            let shared = try? answer.body(as: RelaySharedSpace.self)
        else {
            return RelayEnding(.unreachable, retries: true)
        }
        if !Task.isCancelled {
            publish(.online(sharedSpaceId: shared.spaceId))
        }
        return nil
    }

    private func drop(_ id: UUID) {
        subscribers[id] = nil
    }

    private func heardPong() {
        silentPings = 0
    }

    private func heard(_ text: String) async {
        silentPings = 0
        guard let wire = try? JSONDecoder().decode(RelayWireFrame.self, from: Data(text.utf8))
        else {
            await rotate(by: text)
            return
        }
        guard let spaceKeys, wire.v == 2, wire.instance == instanceId else { return }
        guard wire.keyId == spaceKeys.keyId else {
            dropped(wire, holding: spaceKeys)
            return
        }
        guard let opened = await open(wire, under: spaceKeys), !Task.isCancelled else { return }
        let frame = opened.plaintext
        guard let head = try? JSONDecoder().decode(RelayFrameHead.self, from: frame) else { return }
        if head.hello != nil {
            guard opened.header.to == device.keys.deviceId, let fresh = opened.header.challenge
            else { return }
            heardChallenge(fresh)
        } else if let event = head.event {
            broadcast(.event(RelayEvent(name: event.event, frame: frame)))
        } else if let id = head.id, let status = head.status {
            settle(id, with: .success(RelayAnswer(status: status, frame: frame)))
        }
    }

    private func dropped(_ frame: RelayWireFrame, holding held: SpaceKeys) {
        relayLog.notice(
            "Dropped a frame of Space \(self.instanceId, privacy: .public) under key \(frame.keyId, privacy: .public), holding key \(held.keyId, privacy: .public)"
        )
        guard frame.keyId > held.keyId, keyAskedUnder != held.keyId else { return }
        keyAskedUnder = held.keyId
        outbox?.yield(.keyRequest)
    }

    private func rotate(by text: String) async {
        guard let handed = try? await Self.verifying(text, instance: instanceId, device: device),
            let held = spaceKeys, handed.keyId != held.keyId
        else { return }
        guard handed.keyId > held.keyId else {
            relayLog.notice(
                "Refused key \(handed.keyId, privacy: .public) of Space \(self.instanceId, privacy: .public), holding key \(held.keyId, privacy: .public)"
            )
            return
        }
        guard handed.hostSigningKey.rawRepresentation == held.hostSigningKey.rawRepresentation
        else {
            relayLog.error(
                "Refused key \(handed.keyId, privacy: .public) of Space \(self.instanceId, privacy: .public): another host signed it"
            )
            return
        }
        await persist(handed)
        guard let latest = spaceKeys, handed.keyId > latest.keyId else { return }
        relayLog.notice(
            "Space \(self.instanceId, privacy: .public) moved from key \(latest.keyId, privacy: .public) to key \(handed.keyId, privacy: .public)"
        )
        spaceKeys = handed.spaceKeys
        challenge = nil
        for (id, flight) in flights {
            if case .queued = flight.stage {
                flights[id]?.stage = .awaitingChallenge
            }
        }
        outbox?.yield(.hello)
    }

    private func heardChallenge(_ fresh: Data) {
        challenge = fresh
        for (id, flight) in flights.sorted(by: { $0.key < $1.key }) {
            switch flight.stage {
            case .awaitingChallenge:
                queue(id)
            case .sent(let under) where under != fresh && flight.isResent:
                settle(id, with: .failure(RelayCallError.challengeRefused))
            case .sent(let under) where under != fresh:
                flights[id]?.isResent = true
                queue(id)
            case .queued, .sent:
                break
            }
        }
    }

    private func queue(_ id: Int) {
        flights[id]?.stage = .queued
        outbox?.yield(.call(id))
    }

    private func settle(_ id: Int, with result: Result<RelayAnswer, any Error>) {
        callTasks.removeValue(forKey: id)?.cancel()
        flights[id] = nil
        pendingCalls.removeValue(forKey: id)?.resume(with: result)
    }

    private func failPendingCalls(with failure: RelayCallError = .connectionClosed) {
        for id in pendingCalls.keys {
            settle(id, with: .failure(failure))
        }
    }

    private func publish(_ new: RelayState) {
        guard state != new else { return }
        state = new
        broadcast(.state(new))
    }

    private func broadcast(_ update: RelayUpdate) {
        for subscriber in subscribers.values {
            subscriber.yield(update)
        }
    }

    private static func memberRequest(
        baseURL: URL, instanceId: Space.ID, bearer: String, device: String
    ) -> URLRequest {
        let http = baseURL.appending(path: "instances/\(instanceId)/relay/member")
        var components = URLComponents(url: http, resolvingAgainstBaseURL: false)
        let scheme = http.scheme == "http" ? "ws" : "wss"
        components?.scheme = scheme
        components?.queryItems = [URLQueryItem(name: "device", value: device)]
        var request = URLRequest(url: components?.url ?? http)
        request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
        return request
    }
}

private struct RelayEnding: Sendable {
    let state: RelayState
    let retries: Bool

    init(_ state: RelayState, retries: Bool) {
        self.state = state
        self.retries = retries
    }

    init(handshakeStatus: Int) {
        switch handshakeStatus {
        case 401: self.init(.signedOut, retries: false)
        case 403: self.init(.invitationPending, retries: true)
        case 404: self.init(.membershipEnded, retries: false)
        default: self.init(.unreachable, retries: true)
        }
    }

    init(closeCode: Int) {
        switch closeCode {
        case RelayClosure.hostOffline: self.init(.hostOffline, retries: true)
        case RelayClosure.membershipEnded: self.init(.membershipEnded, retries: false)
        case RelayClosure.sessionRevoked: self.init(.signedOut, retries: false)
        case RelayClosure.serverRestarting: self.init(.connecting, retries: true)
        case RelayClosure.deviceRevoked: self.init(.deviceMoved, retries: false)
        default: self.init(.unreachable, retries: true)
        }
    }
}

private enum KeyWait: Sendable {
    case keyed(SpaceKeys)
    case ended(RelayEnding)
}

private let relayLog = Logger(subsystem: "com.kiroshi.app.ios", category: "relay")

private struct RelayNoArgs: Encodable {}

private enum RelayOutgoing: Sendable {
    case hello
    case call(Int)
    case keyRequest
}

private struct RelayFlight: Sendable {
    enum Stage: Sendable {
        case awaitingChallenge
        case queued
        case sent(under: Data)
    }

    let plaintext: Data
    var stage: Stage
    var isResent = false
}

private struct RelayOpenedFrame: Sendable {
    let header: FrameHeader
    let plaintext: Data
}

private struct RelayCallFrame<Args: Encodable>: Encodable {
    let id: Int
    let command: String
    let args: Args?
}

private struct RelaySharedSpace: Decodable {
    let spaceId: String
}

private struct RelayFrameHead: Decodable {
    struct Event: Decodable {
        let event: String
    }

    struct Hello: Decodable {}

    enum CodingKeys: String, CodingKey {
        case id
        case status
        case event
        case hello
    }

    let id: Int?
    let status: Int?
    let event: Event?
    let hello: Hello?

    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try? container.decodeIfPresent(Int.self, forKey: .id)
        status = try? container.decodeIfPresent(Int.self, forKey: .status)
        event = try? container.decodeIfPresent(Event.self, forKey: .event)
        hello = try? container.decodeIfPresent(Hello.self, forKey: .hello)
    }
}
