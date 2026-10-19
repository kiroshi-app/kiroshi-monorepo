import Foundation

struct Invitation: Decodable, Identifiable, Equatable, Sendable {
    let id: String
    let instanceId: String
    let instanceName: String
    let inviterEmail: String
}

struct ValidInvitation: Equatable, Sendable {
    let spaceName: String
    let inviter: String
    let expiresAt: Date
}

enum InvitationRefusal: Equatable, Sendable {
    case expired
    case withdrawn
    case used
    case otherEmail
    case unknown
}

enum InvitationListAnswer: Equatable, Sendable {
    case invitations([Invitation])
    case unauthenticated
    case unreachable
}

enum InvitationStateAnswer: Equatable, Sendable {
    case valid(ValidInvitation)
    case refused(InvitationRefusal)
    case unreachable
}

enum InvitationAnswer: Equatable, Sendable {
    case done
    case refused(InvitationRefusal)
    case unauthenticated
    case unreachable
}

struct CloudInvitations: Sendable {
    let baseURL: URL
    let transport: any HTTPTransport

    func list(bearer: String) async throws -> InvitationListAnswer {
        guard let (status, data) = try await send("invitations", method: "GET", bearer: bearer)
        else { return .unreachable }
        switch status {
        case 200:
            guard let listed = try? JSONDecoder().decode([Invitation].self, from: data) else {
                return .unreachable
            }
            return .invitations(listed)
        case 401: return .unauthenticated
        default: return .unreachable
        }
    }

    func state(of invitationId: String) async throws -> InvitationStateAnswer {
        guard
            let (status, data) = try await send(
                "invitations/\(invitationId)/state", method: "GET", bearer: nil)
        else { return .unreachable }
        switch status {
        case 200:
            guard let read = try? JSONDecoder().decode(ReadState.self, from: data) else {
                return .unreachable
            }
            return read.answer ?? .unreachable
        case 404: return .refused(.unknown)
        default: return .unreachable
        }
    }

    func accept(_ invitation: Invitation, bearer: String) async throws -> InvitationAnswer {
        try await answer(invitation, "accept", bearer: bearer)
    }

    func decline(_ invitation: Invitation, bearer: String) async throws -> InvitationAnswer {
        try await answer(invitation, "decline", bearer: bearer)
    }

    func leave(_ invitation: Invitation, bearer: String) async throws -> InvitationAnswer {
        guard
            let (status, _) = try await send(
                "instances/\(invitation.instanceId)/membership", method: "DELETE", bearer: bearer)
        else { return .unreachable }
        switch status {
        case 204: return .done
        case 401: return .unauthenticated
        default: return .unreachable
        }
    }

    private func answer(_ invitation: Invitation, _ verb: String, bearer: String) async throws
        -> InvitationAnswer
    {
        guard
            let (status, data) = try await send(
                "invitations/\(invitation.instanceId)/\(verb)", method: "POST", bearer: bearer)
        else { return .unreachable }
        switch status {
        case 200, 204: return .done
        case 401: return .unauthenticated
        case 403, 404, 410:
            let code = try? JSONDecoder().decode(RefusalBody.self, from: data).error.code
            return code.flatMap(Self.refusal(coded:)).map { .refused($0) } ?? .unreachable
        default: return .unreachable
        }
    }

    private static func refusal(coded code: String) -> InvitationRefusal? {
        switch code {
        case "INVITATION_EXPIRED": .expired
        case "INVITATION_WITHDRAWN": .withdrawn
        case "INVITATION_USED": .used
        case "INVITATION_EMAIL_MISMATCH": .otherEmail
        case "NOT_FOUND": .unknown
        default: nil
        }
    }

    private func send(_ path: String, method: String, bearer: String?) async throws -> (Int, Data)?
    {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = method
        if let bearer {
            request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
        }
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

extension KiroshiCloud {
    var invitations: CloudInvitations {
        CloudInvitations(baseURL: baseURL, transport: transport)
    }
}

enum InvitationLink {
    static func invitationId(in url: URL) -> String? {
        guard url.scheme == "https", url.host() == "kiroshi.app", url.path() == "/join",
            let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems,
            items.count == 1, items[0].name == "invitation",
            let id = items[0].value, UUID(uuidString: id) != nil
        else { return nil }
        return id.lowercased()
    }
}

private struct ReadState: Decodable {
    let state: String
    let spaceName: String?
    let inviter: String?
    let expiresAt: String?

    var answer: InvitationStateAnswer? {
        switch state {
        case "valid":
            guard let spaceName, let inviter,
                let expiresAt = expiresAt.flatMap({
                    try? Date.ISO8601FormatStyle(includingFractionalSeconds: true).parse($0)
                })
            else { return nil }
            return .valid(
                ValidInvitation(spaceName: spaceName, inviter: inviter, expiresAt: expiresAt))
        case "used": return .refused(.used)
        case "expired": return .refused(.expired)
        case "withdrawn": return .refused(.withdrawn)
        default: return nil
        }
    }
}

private struct RefusalBody: Decodable {
    struct Detail: Decodable {
        let code: String
    }

    let error: Detail
}
