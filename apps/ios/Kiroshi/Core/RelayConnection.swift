import Foundation

enum RelayCallError: Error, Equatable {
    case notConnected
    case connectionClosed
    case timedOut
}

actor RelayConnection {
    static let pingInterval = Duration.seconds(30)
    static let silentPingsBeforeDrop = 3
    static let sharedSpaceDeadline = Duration.seconds(30)
    static let callDeadline = Duration.seconds(300)

    let instanceId: Space.ID
    private(set) var state: RelayState = .paused
    private let request: URLRequest
    private let transport: any RelayTransport
    private let clock: any RelayClock
    private var backoff: Backoff
    private var run: Task<Void, Never>?
    private var socket: (any RelaySocket)?
    private var silentPings = 0
    private var nextCallId = 1
    private var pendingCalls: [Int: CheckedContinuation<RelayAnswer, any Error>] = [:]
    private var callTasks: [Int: Task<Void, Never>] = [:]
    private var subscribers: [UUID: AsyncStream<RelayUpdate>.Continuation] = [:]

    init(
        baseURL: URL,
        instanceId: Space.ID,
        bearer: String,
        environment: RelayEnvironment,
        backoff: Backoff = Backoff()
    ) {
        self.instanceId = instanceId
        request = Self.memberRequest(baseURL: baseURL, instanceId: instanceId, bearer: bearer)
        transport = environment.transport
        clock = environment.clock
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
        guard let socket else { throw RelayCallError.notConnected }
        let id = nextCallId
        nextCallId += 1
        let frame = try JSONEncoder().encode(RelayCallFrame(id: id, command: command, args: args))
        let text = String(decoding: frame, as: UTF8.self)
        return try await withCheckedThrowingContinuation { continuation in
            pendingCalls[id] = continuation
            callTasks[id] = Task { [clock] in
                do {
                    try await socket.send(text)
                } catch {
                    self.settle(id, with: .failure(RelayCallError.connectionClosed))
                    return
                }
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
        socket = opened
        backoff.reset()
        silentPings = 0
        let ending = await withTaskGroup(of: RelayEnding?.self) { group in
            group.addTask { await self.receiveUntilClosed(opened) }
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
        if !Task.isCancelled {
            socket = nil
            failPendingCalls()
        }
        return ending
    }

    private func receiveUntilClosed(_ socket: any RelaySocket) async -> RelayEnding {
        do {
            while true {
                heard(try await socket.receive())
            }
        } catch let closure as RelayClosure {
            return RelayEnding(closeCode: closure.code)
        } catch {
            return RelayEnding(.unreachable, retries: true)
        }
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

    private func heard(_ text: String) {
        silentPings = 0
        let frame = Data(text.utf8)
        guard let head = try? JSONDecoder().decode(RelayFrameHead.self, from: frame) else { return }
        if let event = head.event {
            broadcast(.event(RelayEvent(name: event.event, frame: frame)))
        } else if let id = head.id, let status = head.status {
            settle(id, with: .success(RelayAnswer(status: status, frame: frame)))
        }
    }

    private func settle(_ id: Int, with result: Result<RelayAnswer, any Error>) {
        callTasks.removeValue(forKey: id)?.cancel()
        pendingCalls.removeValue(forKey: id)?.resume(with: result)
    }

    private func failPendingCalls() {
        for id in pendingCalls.keys {
            settle(id, with: .failure(RelayCallError.connectionClosed))
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

    private static func memberRequest(baseURL: URL, instanceId: Space.ID, bearer: String)
        -> URLRequest
    {
        let http = baseURL.appending(path: "instances/\(instanceId)/relay/member")
        var components = URLComponents(url: http, resolvingAgainstBaseURL: false)
        let scheme = http.scheme == "http" ? "ws" : "wss"
        components?.scheme = scheme
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
        default: self.init(.unreachable, retries: true)
        }
    }
}

private struct RelayNoArgs: Encodable {}

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

    enum CodingKeys: String, CodingKey {
        case id
        case status
        case event
    }

    let id: Int?
    let status: Int?
    let event: Event?

    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try? container.decodeIfPresent(Int.self, forKey: .id)
        status = try? container.decodeIfPresent(Int.self, forKey: .status)
        event = try? container.decodeIfPresent(Event.self, forKey: .event)
    }
}
