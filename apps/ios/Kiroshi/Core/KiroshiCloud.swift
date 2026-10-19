import Foundation

enum CodeRequestAnswer: Equatable, Sendable {
    case sent
    case tooManyRequests
    case invalidEmail
    case unreachable
}

enum CodeSignInAnswer: Equatable, Sendable {
    case signedIn(Session)
    case wrongCode
    case expiredCode
    case tooManyWrongCodes
    case unreachable
}

enum ProviderSignInAnswer: Equatable, Sendable {
    case signedIn(Session)
    case refused
    case unreachable
}

enum AccountDeletionAnswer: Equatable, Sendable {
    case deleted
    case unauthenticated
    case unreachable
}

enum DeviceRegistrationAnswer: Equatable, Sendable {
    case registered(relayId: String, transferred: Bool, isPending: Bool = false)
    case challengeRefused
    case proofRefused
    case keyRefused
    case refused
    case unauthenticated
    case unreachable
}

enum AccountAnswer: Equatable, Sendable {
    case account(userId: String)
    case unauthenticated
    case unreachable
}

enum DeviceDeletionAnswer: Equatable, Sendable {
    case deleted
    case notFound
    case unauthenticated
    case unreachable
}

enum DeviceDecisionAnswer: Equatable, Sendable {
    case decided
    case alreadyApproved
    case expired
    case notFound
    case unauthenticated
    case unreachable
}

enum ApprovalCodeRequestAnswer: Equatable, Sendable {
    case sent
    case alreadyApproved
    case expired
    case tooManyRequests
    case unauthenticated
    case unreachable
}

enum ApprovalCodeAnswer: Equatable, Sendable {
    case approved
    case wrongCode
    case alreadyApproved
    case expired
    case tooManyRequests
    case unauthenticated
    case unreachable
}

enum SpacesAnswer: Equatable, Sendable {
    case spaces([Space])
    case unauthenticated
    case unreachable
}

struct KiroshiCloud: Sendable {
    static let productionURL = URL(string: "https://api.kiroshi.app")!

    let baseURL: URL
    let transport: any HTTPTransport
    var deviceName = "iPhone"

    func requestCode(for email: String) async throws -> CodeRequestAnswer {
        let request = post(
            "api/auth/email-otp/send-verification-otp", body: CodeRequest(email: email))
        guard let (status, _) = try await send(request) else { return .unreachable }
        switch status {
        case 200: return .sent
        case 429: return .tooManyRequests
        case 400: return .invalidEmail
        default: return .unreachable
        }
    }

    func signIn(email: String, code: String) async throws -> CodeSignInAnswer {
        let request = post(
            "api/auth/sign-in/email-otp",
            body: CodeSignIn(email: email, otp: code, deviceName: deviceName))
        guard let (status, data) = try await send(request) else { return .unreachable }
        switch status {
        case 200:
            guard let granted = session(from: data) else { return .unreachable }
            return .signedIn(granted)
        case 400, 401:
            return refusal(of: data)
        default:
            return .unreachable
        }
    }

    func signIn(with credential: ProviderCredential) async throws -> ProviderSignInAnswer {
        let request = post(
            "api/auth/sign-in/social",
            body: IdTokenSignIn(
                provider: credential.provider.rawValue, idToken: credential.idToken,
                nonce: credential.nonce, name: credential.name,
                authorizationCode: credential.authorizationCode, deviceName: deviceName))
        guard let (status, data) = try await send(request) else { return .unreachable }
        switch status {
        case 200:
            guard let granted = session(from: data) else { return .unreachable }
            return .signedIn(granted)
        case 400, 401, 404:
            return .refused
        default:
            return .unreachable
        }
    }

    func spaces(bearer: String) async throws -> SpacesAnswer {
        var request = URLRequest(url: baseURL.appending(path: "instances"))
        request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
        guard let (status, data) = try await send(request) else { return .unreachable }
        switch status {
        case 200:
            guard let spaces = try? JSONDecoder().decode([Space].self, from: data) else {
                return .unreachable
            }
            return .spaces(spaces)
        case 401:
            return .unauthenticated
        default:
            return .unreachable
        }
    }

    func registerDevice(_ keys: DeviceKeys, userId: String, bearer: String) async throws
        -> DeviceRegistrationAnswer
    {
        let answer = try await proveAndRegister(keys, userId: userId, bearer: bearer)
        guard answer == .challengeRefused else { return answer }
        return try await proveAndRegister(keys, userId: userId, bearer: bearer)
    }

    func account(bearer: String) async throws -> AccountAnswer {
        var request = URLRequest(url: baseURL.appending(path: "me"))
        request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
        guard let (status, data) = try await send(request) else { return .unreachable }
        switch status {
        case 200:
            guard let account = try? JSONDecoder().decode(Account.self, from: data) else {
                return .unreachable
            }
            return .account(userId: account.id)
        case 401: return .unauthenticated
        default: return .unreachable
        }
    }

    func deleteDevice(_ relayId: String, bearer: String) async throws -> DeviceDeletionAnswer {
        var request = URLRequest(url: baseURL.appending(path: "devices/\(relayId)"))
        request.httpMethod = "DELETE"
        request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
        guard let (status, _) = try await send(request) else { return .unreachable }
        switch status {
        case 204: return .deleted
        case 401: return .unauthenticated
        case 404: return .notFound
        default: return .unreachable
        }
    }

    var deviceStates: any DeviceStates {
        CloudDeviceStates(baseURL: baseURL, transport: transport)
    }

    func approveDevice(_ relayId: String, bearer: String) async throws -> DeviceDecisionAnswer {
        try await decide(relayId, "approve", bearer: bearer)
    }

    func refuseDevice(_ relayId: String, bearer: String) async throws -> DeviceDecisionAnswer {
        try await decide(relayId, "reject", bearer: bearer)
    }

    func requestApprovalCode(bearer: String) async throws -> ApprovalCodeRequestAnswer {
        var request = URLRequest(url: baseURL.appending(path: "devices/approval-code"))
        request.httpMethod = "POST"
        request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
        guard let (status, _) = try await send(request) else { return .unreachable }
        switch status {
        case 204: return .sent
        case 401: return .unauthenticated
        case 409: return .alreadyApproved
        case 410: return .expired
        case 429: return .tooManyRequests
        default: return .unreachable
        }
    }

    func verifyApprovalCode(_ code: String, bearer: String) async throws -> ApprovalCodeAnswer {
        var request = post("devices/approval-code/verify", body: ApprovalCode(code: code))
        request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
        guard let (status, _) = try await send(request) else { return .unreachable }
        switch status {
        case 204: return .approved
        case 400: return .wrongCode
        case 401: return .unauthenticated
        case 409: return .alreadyApproved
        case 410: return .expired
        case 429: return .tooManyRequests
        default: return .unreachable
        }
    }

    func signOut(bearer: String) async {
        var request = URLRequest(url: baseURL.appending(path: "api/auth/sign-out"))
        request.httpMethod = "POST"
        request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
        _ = try? await send(request)
    }

    func deleteAccount(bearer: String) async throws -> AccountDeletionAnswer {
        var request = URLRequest(url: baseURL.appending(path: "me"))
        request.httpMethod = "DELETE"
        request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
        guard let (status, _) = try await send(request) else { return .unreachable }
        switch status {
        case 204: return .deleted
        case 401: return .unauthenticated
        default: return .unreachable
        }
    }

    private func decide(_ relayId: String, _ decision: String, bearer: String) async throws
        -> DeviceDecisionAnswer
    {
        var request = URLRequest(url: baseURL.appending(path: "devices/\(relayId)/\(decision)"))
        request.httpMethod = "POST"
        request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
        guard let (status, _) = try await send(request) else { return .unreachable }
        switch status {
        case 204: return .decided
        case 401: return .unauthenticated
        case 404: return .notFound
        case 409: return .alreadyApproved
        case 410: return .expired
        default: return .unreachable
        }
    }

    private func proveAndRegister(_ keys: DeviceKeys, userId: String, bearer: String)
        async throws -> DeviceRegistrationAnswer
    {
        var challenge = URLRequest(url: baseURL.appending(path: "devices/challenge"))
        challenge.httpMethod = "POST"
        challenge.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
        guard let (status, data) = try await send(challenge) else { return .unreachable }
        switch status {
        case 201: break
        case 401: return .unauthenticated
        default: return .unreachable
        }
        guard let issued = try? JSONDecoder().decode(IssuedChallenge.self, from: data),
            let nonce = Data(unpaddedBase64URL: issued.nonce),
            nonce.count == DeviceProof.nonceLength
        else { return .unreachable }
        let signature = try keys.registrationSignature(userId: userId, nonce: nonce)
        var request = post(
            "devices",
            body: DeviceRegistration(
                ed25519PublicKey: keys.signing.publicKey.rawRepresentation.unpaddedBase64URL,
                x25519PublicKey: keys.agreement.publicKey.rawRepresentation.unpaddedBase64URL,
                nonce: issued.nonce, signature: signature.unpaddedBase64URL))
        request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
        return try await register(request)
    }

    private func register(_ request: URLRequest) async throws -> DeviceRegistrationAnswer {
        guard let (status, data) = try await send(request) else { return .unreachable }
        switch status {
        case 200, 201:
            guard let device = try? JSONDecoder().decode(RegisteredDevice.self, from: data) else {
                return .unreachable
            }
            return .registered(
                relayId: device.id, transferred: device.transferred,
                isPending: device.status == "pending")
        case 400
        where (try? JSONDecoder().decode(ErrorCode.self, from: data).error.code)
            == "DEVICE_CHALLENGE_INVALID":
            return .challengeRefused
        case 400: return .keyRefused
        case 401: return .unauthenticated
        case 403: return .proofRefused
        case 402..<500: return .refused
        default: return .unreachable
        }
    }

    private func session(from data: Data) -> Session? {
        guard let granted = try? JSONDecoder().decode(GrantedSession.self, from: data) else {
            return nil
        }
        return Session(
            bearer: granted.token, email: granted.user.email, userId: granted.user.id,
            deviceName: granted.session?.deviceName, platform: granted.session?.platform)
    }

    private func refusal(of data: Data) -> CodeSignInAnswer {
        let message = try? JSONDecoder().decode(ErrorBody.self, from: data).error.message
        switch message {
        case "Code has expired": return .expiredCode
        case "Too many wrong codes, ask for a new one": return .tooManyWrongCodes
        default: return .wrongCode
        }
    }

    private func post(_ path: String, body: some Encodable) -> URLRequest {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONEncoder().encode(body)
        return request
    }

    private func send(_ request: URLRequest) async throws -> (Int, Data)? {
        do {
            let (data, response) = try await transport.send(request)
            guard let http = response as? HTTPURLResponse else { return nil }
            return (http.statusCode, data)
        } catch {
            try Task.checkCancellation()
            return nil
        }
    }
}

private struct CodeRequest: Encodable {
    let email: String
}

private struct CodeSignIn: Encodable {
    let email: String
    let otp: String
    let deviceName: String
    let platform = "ios"
}

private struct IdTokenSignIn: Encodable {
    let provider: String
    let idToken: String
    let nonce: String?
    let name: String?
    let authorizationCode: String?
    let deviceName: String
    let platform = "ios"

    private enum CodingKeys: String, CodingKey {
        case provider, idToken, nonce, name, deviceName, platform
        case authorizationCode = "authorizationCode"
    }
}

private struct DeviceRegistration: Encodable {
    let ed25519PublicKey: String
    let x25519PublicKey: String
    let nonce: String
    let signature: String
}

private struct Account: Decodable {
    let id: String
}

private struct IssuedChallenge: Decodable {
    let nonce: String
}

private struct RegisteredDevice: Decodable {
    let id: String
    let transferred: Bool
    let status: String?
}

private struct ApprovalCode: Encodable {
    let code: String
}

private struct ErrorCode: Decodable {
    struct Detail: Decodable {
        let code: String
    }

    let error: Detail
}

private struct GrantedSession: Decodable {
    struct User: Decodable {
        let id: String
        let email: String
    }

    struct Device: Decodable {
        let deviceName: String?
        let platform: String?
    }

    let token: String
    let user: User
    let session: Device?
}

private struct ErrorBody: Decodable {
    struct Detail: Decodable {
        let message: String
    }

    let error: Detail
}
