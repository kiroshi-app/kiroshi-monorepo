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

    func signOut(bearer: String) async {
        var request = URLRequest(url: baseURL.appending(path: "api/auth/sign-out"))
        request.httpMethod = "POST"
        request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
        _ = try? await send(request)
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
