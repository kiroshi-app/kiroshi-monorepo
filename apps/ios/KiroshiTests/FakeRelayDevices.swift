import CryptoKit
import Foundation

@testable import Kiroshi

actor FakeRelayDevices: HTTPTransport {
    struct Device: Equatable {
        let id: String
        var userId: String
    }

    let others: ScriptedTransport
    private let accounts: [String: String]
    private var devices: [String: Device] = [:]
    private var liveNonces: [String: String] = [:]
    private var challengesToExpire = 0
    private var tampersSignatures = false
    private var dropsDeletions = false
    private var nextDevice = 1
    private(set) var requests: [URLRequest] = []

    init(accounts: [String: String], others: ScriptedTransport) {
        self.accounts = accounts
        self.others = others
    }

    func expireChallenges(_ count: Int) {
        challengesToExpire = count
    }

    func tamperSignatures() {
        tampersSignatures = true
    }

    func dropDeletions() {
        dropsDeletions = true
    }

    func devices(of userId: String) -> [String] {
        devices.values.filter { $0.userId == userId }.map(\.id).sorted()
    }

    func count(_ method: String, _ path: String) -> Int {
        requests.filter { $0.httpMethod == method && $0.url?.path() == path }.count
    }

    func send(_ request: URLRequest) async throws -> (Data, URLResponse) {
        requests.append(request)
        guard let url = request.url else { throw URLError(.badURL) }
        let path = url.path()
        guard path.hasPrefix(FixtureKeys.devicesPath) else {
            return try await others.send(request)
        }
        if request.httpMethod == "DELETE", dropsDeletions {
            throw URLError(.networkConnectionLost)
        }
        let (status, body) = answer(request, at: path)
        let response = HTTPURLResponse(
            url: url, statusCode: status, httpVersion: nil, headerFields: nil)
        return (Data(body.utf8), response ?? URLResponse())
    }

    private func answer(_ request: URLRequest, at path: String) -> (Int, String) {
        let bearer = request.value(forHTTPHeaderField: "Authorization")?.replacing(
            "Bearer ", with: "")
        guard let userId = bearer.flatMap({ accounts[$0] }) else {
            return error(401, "UNAUTHENTICATED")
        }
        switch (request.httpMethod, path) {
        case ("POST", FixtureKeys.challengePath): return challenge(for: userId)
        case ("POST", FixtureKeys.devicesPath): return register(request.httpBody, for: userId)
        case ("DELETE", _): return delete(String(path.dropFirst("/devices/".count)), of: userId)
        default: return error(404, "NOT_FOUND")
        }
    }

    private func challenge(for userId: String) -> (Int, String) {
        let nonce = Data((0..<32).map { _ in UInt8.random(in: .min ... .max) }).unpaddedBase64URL
        if challengesToExpire > 0 {
            challengesToExpire -= 1
        } else {
            liveNonces[nonce] = userId
        }
        return (201, #"{"nonce":"\#(nonce)","expiresAt":"2026-10-18T09:01:00.000Z"}"#)
    }

    private func register(_ body: Data?, for userId: String) -> (Int, String) {
        guard
            let fields = body.flatMap({ try? JSONDecoder().decode([String: String].self, from: $0) }
            ),
            let key = fields["ed25519PublicKey"], fields["x25519PublicKey"] != nil,
            let nonce = fields["nonce"], let signed = fields["signature"],
            let keyBytes = Data(unpaddedBase64URL: key), keyBytes.count == 32,
            let nonceBytes = Data(unpaddedBase64URL: nonce),
            var signature = Data(unpaddedBase64URL: signed), signature.count == 64
        else { return error(400, "VALIDATION_ERROR") }
        guard liveNonces.removeValue(forKey: nonce) == userId else {
            return error(400, "DEVICE_CHALLENGE_INVALID")
        }
        if tampersSignatures {
            signature[0] ^= 0x01
        }
        let message =
            Data("kiroshi-device-register-v1".utf8) + Data(userId.utf8) + keyBytes + nonceBytes
        guard let publicKey = try? Curve25519.Signing.PublicKey(rawRepresentation: keyBytes),
            publicKey.isValidSignature(signature, for: message)
        else { return error(403, "DEVICE_PROOF_INVALID") }
        guard var held = devices[key] else {
            let device = Device(id: "device-\(nextDevice)", userId: userId)
            nextDevice += 1
            devices[key] = device
            return (201, registered(device.id, transferred: false))
        }
        let transferred = held.userId != userId
        held.userId = userId
        devices[key] = held
        return (200, registered(held.id, transferred: transferred))
    }

    private func delete(_ id: String, of userId: String) -> (Int, String) {
        guard let key = devices.first(where: { $0.value == Device(id: id, userId: userId) })?.key
        else { return error(404, "NOT_FOUND") }
        devices[key] = nil
        return (204, "")
    }

    private func registered(_ id: String, transferred: Bool) -> String {
        #"{"id":"\#(id)","createdAt":"2026-10-18T09:00:00.000Z","transferred":\#(transferred)}"#
    }

    private func error(_ status: Int, _ code: String) -> (Int, String) {
        (status, #"{"error":{"code":"\#(code)","message":"\#(code)","status":\#(status)}}"#)
    }
}
