#if DEBUG
    import CryptoKit
    import Foundation

    enum FixtureKeys {
        static let member = DeviceKeys(
            signing: Curve25519.Signing.PrivateKey(),
            agreement: Curve25519.KeyAgreement.PrivateKey())
        static let host = DeviceKeys(
            signing: Curve25519.Signing.PrivateKey(),
            agreement: Curve25519.KeyAgreement.PrivateKey())
        static let memberRelayId = "5d2c0000-0000-4000-8000-0000000000a1"
        static let hostRelayId = "5d2c0000-0000-4000-8000-0000000000b1"
        static let device = RelayDevice(keys: member, relayId: memberRelayId)
        static let spaceKeys = SpaceKeys(
            spaceKey: SymmetricKey(size: .bits256), keyId: 7,
            hostSigningKey: host.signing.publicKey, hostRelayIds: [hostRelayId])
        static let memberKeychainItems = [DeviceKeyStore.account: member.rawRepresentation]
        static let devicesPath = "/devices"
        static let challengePath = "/devices/challenge"
        static let nonce = Data((0..<32).map { UInt8($0) })
        static let challenge = ScriptedTransport.Answer.status(
            201,
            #"{"nonce":"\#(nonce.unpaddedBase64URL)","expiresAt":"2026-10-17T09:01:00.000Z"}"#)
        static let registered = registered(201, transferred: false)

        static func registered(_ status: Int, transferred: Bool) -> ScriptedTransport.Answer {
            .status(
                status,
                #"{"id":"\#(memberRelayId)","createdAt":"2026-10-17T09:00:00.000Z","transferred":\#(transferred)}"#
            )
        }
    }

    struct FixtureSpaceKeys: SpaceKeyStore {
        var missing: Set<Space.ID> = []

        func keys(for instanceId: Space.ID, openedWith device: DeviceKeys) async -> SpaceKeys? {
            missing.contains(instanceId) ? nil : FixtureKeys.spaceKeys
        }
    }

    extension RelayEnvironment {
        init(
            transport: any RelayTransport, clock: any RelayClock,
            spaceKeys: any SpaceKeyStore = FixtureSpaceKeys()
        ) {
            self.init(
                transport: HostSealingTransport(sealing: transport), clock: clock,
                keychain: InMemoryKeychain(FixtureKeys.memberKeychainItems), spaceKeys: spaceKeys)
        }
    }

    extension RelayConnection {
        init(
            baseURL: URL, instanceId: Space.ID, bearer: String, environment: RelayEnvironment,
            backoff: Backoff = Backoff()
        ) {
            self.init(
                baseURL: baseURL, instanceId: instanceId, bearer: bearer,
                device: FixtureKeys.device, spaceKeys: FixtureKeys.spaceKeys,
                environment: environment, backoff: backoff)
        }
    }

    struct HostSealingTransport: RelayTransport {
        let sealing: any RelayTransport

        func open(_ request: URLRequest) async throws -> any RelaySocket {
            let instanceId = request.url?.pathComponents.dropLast(2).last ?? ""
            return HostSealingSocket(
                instanceId: instanceId, plain: try await sealing.open(request))
        }
    }

    struct HostSealingSocket: RelaySocket {
        private enum Inbound: Sendable {
            case hello
            case plain(String)
            case failure(any Error)
        }

        let instanceId: Space.ID
        let plain: any RelaySocket
        private let challenge = SymmetricKey(size: .bits256).withUnsafeBytes { Data($0) }
        private let inbound: AsyncStream<Inbound>
        private let inboundContinuation: AsyncStream<Inbound>.Continuation
        private let pump: Task<Void, Never>

        init(instanceId: Space.ID, plain: any RelaySocket) {
            self.instanceId = instanceId
            self.plain = plain
            let (inbound, inboundContinuation) = AsyncStream.makeStream(
                of: Inbound.self, bufferingPolicy: .unbounded)
            self.inbound = inbound
            self.inboundContinuation = inboundContinuation
            pump = Task {
                do {
                    while true {
                        inboundContinuation.yield(.plain(try await plain.receive()))
                    }
                } catch {
                    inboundContinuation.yield(.failure(error))
                    inboundContinuation.finish()
                }
            }
            inboundContinuation.onTermination = { [pump] _ in pump.cancel() }
        }

        func send(_ text: String) async throws {
            guard let frame = try? JSONDecoder().decode(RelayWireFrame.self, from: Data(text.utf8)),
                frame.from == nil
            else { return }
            let keys = FixtureKeys.spaceKeys
            let challenge = frame.challenge.flatMap { Data(base64Encoded: $0) }
            guard
                let header = FrameHeader(
                    instance: frame.instance, from: FixtureKeys.member.deviceId,
                    keyId: frame.keyId, ctr: frame.ctr, challenge: challenge),
                let ciphertext = Data(base64Encoded: frame.ct),
                let signature = Data(base64Encoded: frame.sig),
                let plaintext = try? RelayCrypto.open(
                    SealedFrame(ciphertext: ciphertext, signature: signature), header: header,
                    lastAccepted: 0, sender: FixtureKeys.member.signing.publicKey,
                    spaceKey: keys.spaceKey)
            else { return }
            guard plaintext != RelayConnection.hello, challenge == self.challenge else {
                inboundContinuation.yield(.hello)
                return
            }
            try await plain.send(String(decoding: plaintext, as: UTF8.self))
        }

        func receive() async throws -> String {
            var iterator = inbound.makeAsyncIterator()
            switch await iterator.next() {
            case .hello: return try await sealed(RelayConnection.hello, challenge: challenge)
            case .plain(let text): return try await sealed(Data(text.utf8), challenge: nil)
            case .failure(let error): throw error
            case nil: throw CancellationError()
            }
        }

        func ping() async throws {
            try await plain.ping()
        }

        func close() {
            plain.close()
            pump.cancel()
        }

        private func sealed(_ plaintext: Data, challenge: Data?) async throws -> String {
            let isAnswer =
                (try? JSONSerialization.jsonObject(with: plaintext) as? [String: Any])?["event"]
                == nil
            let keys = FixtureKeys.spaceKeys
            let ctr = await FixtureHostCounter.shared.next()
            guard
                let header = FrameHeader(
                    instance: instanceId, from: FixtureKeys.host.deviceId,
                    to: isAnswer ? FixtureKeys.member.deviceId : nil, keyId: keys.keyId, ctr: ctr,
                    challenge: challenge)
            else { throw RelayClosure(code: 1011) }
            let sealed = try RelayCrypto.seal(
                plaintext, header: header, spaceKey: keys.spaceKey,
                signer: FixtureKeys.host.signing)
            let frame = RelayWireFrame(
                v: 2, instance: instanceId, from: FixtureKeys.hostRelayId,
                to: isAnswer ? FixtureKeys.memberRelayId : nil, keyId: keys.keyId, ctr: ctr,
                challenge: challenge?.base64EncodedString(),
                ct: sealed.ciphertext.base64EncodedString(),
                sig: sealed.signature.base64EncodedString())
            return String(decoding: try JSONEncoder().encode(frame), as: UTF8.self)
        }
    }

    actor FixtureHostCounter {
        static let shared = FixtureHostCounter()

        private var last: UInt64 = 0

        func next() -> UInt64 {
            last += 1
            return last
        }
    }
#endif
