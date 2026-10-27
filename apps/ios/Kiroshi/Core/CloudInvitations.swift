import Foundation

struct Invitation: Decodable, Identifiable, Equatable, Sendable {
    let id: String
    let instanceId: String
    let instanceName: String
    let inviterEmail: String
    var colour: Hue?
}

extension Invitation {
    enum CodingKeys: String, CodingKey {
        case id
        case instanceId
        case instanceName
        case inviterEmail
        case colour
    }

    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        instanceId = try container.decode(String.self, forKey: .instanceId)
        instanceName = try container.decode(String.self, forKey: .instanceName)
        inviterEmail = try container.decode(String.self, forKey: .inviterEmail)
        colour = container.hue(forKey: .colour)
    }
}

struct ValidInvitation: Equatable, Sendable {
    let spaceName: String
    let inviter: String
    let expiresAt: Date
    var colour: Hue?
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
        guard let (status, data) = try await post(invitation, "accept", bearer: bearer) else {
            return .unreachable
        }
        switch status {
        case 404: return .refused(.unknown)
        case 409 where Self.code(in: data) == "ALREADY_JOINED": return .done
        default: return Self.answer(status, data)
        }
    }

    func decline(_ invitation: Invitation, bearer: String) async throws -> InvitationAnswer {
        guard let (status, data) = try await post(invitation, "decline", bearer: bearer) else {
            return .unreachable
        }
        return Self.answer(status, data)
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

    private func post(_ invitation: Invitation, _ verb: String, bearer: String) async throws
        -> (Int, Data)?
    {
        try await send("invitations/\(invitation.id)/\(verb)", method: "POST", bearer: bearer)
    }

    private static func answer(_ status: Int, _ data: Data) -> InvitationAnswer {
        switch status {
        case 200, 204: .done
        case 401: .unauthenticated
        case 403, 404, 410:
            code(in: data).flatMap(refusal(coded:)).map { .refused($0) } ?? .unreachable
        default: .unreachable
        }
    }

    private static func code(in data: Data) -> String? {
        try? JSONDecoder().decode(RefusalBody.self, from: data).error.code
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
    enum CodingKeys: String, CodingKey {
        case state
        case spaceName
        case inviter
        case expiresAt
        case colour
    }

    let state: String
    let spaceName: String?
    let inviter: String?
    let expiresAt: String?
    let colour: Hue?

    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        state = try container.decode(String.self, forKey: .state)
        spaceName = try container.decodeIfPresent(String.self, forKey: .spaceName)
        inviter = try container.decodeIfPresent(String.self, forKey: .inviter)
        expiresAt = try container.decodeIfPresent(String.self, forKey: .expiresAt)
        colour = container.hue(forKey: .colour)
    }

    var answer: InvitationStateAnswer? {
        switch state {
        case "valid":
            guard let spaceName, let inviter,
                let expiresAt = expiresAt.flatMap({
                    try? Date.ISO8601FormatStyle(includingFractionalSeconds: true).parse($0)
                })
            else { return nil }
            return .valid(
                ValidInvitation(
                    spaceName: spaceName, inviter: inviter, expiresAt: expiresAt, colour: colour))
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
