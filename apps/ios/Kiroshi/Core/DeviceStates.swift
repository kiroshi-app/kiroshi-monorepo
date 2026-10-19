import Foundation

enum OwnDeviceState: Equatable, Sendable {
    case approved
    case pending
    case expired
    case refused
    case unreachable
}

struct AccountDevice: Equatable, Sendable, Identifiable {
    enum Kind: String, Sendable {
        case phone
        case computer
    }

    let id: String
    let name: String?
    let kind: Kind
    let isPending: Bool
    let approvalExpiresAt: Date?
    let isCurrent: Bool
    let signingKey: Data

    func isAsking(at now: Date) -> Bool {
        guard isPending, !isCurrent, let approvalExpiresAt else { return false }
        return approvalExpiresAt > now
    }
}

enum AccountDevicesAnswer: Equatable, Sendable {
    case devices([AccountDevice])
    case notApproved
    case unauthenticated
    case unreachable
}

protocol DeviceStates: Sendable {
    func ownState(bearer: String) async throws -> OwnDeviceState
    func devices(bearer: String) async throws -> AccountDevicesAnswer
}

struct CloudDeviceStates: DeviceStates {
    static let ownStatePath = "devices/current"
    static let devicesPath = "devices"

    let baseURL: URL
    let transport: any HTTPTransport

    func ownState(bearer: String) async throws -> OwnDeviceState {
        guard let (status, data) = try await get(Self.ownStatePath, bearer: bearer) else {
            return .unreachable
        }
        switch status {
        case 200:
            guard let device = try? decoder.decode(OwnDevice.self, from: data) else {
                return .unreachable
            }
            switch device.status {
            case .approved: return .approved
            case .expired: return .expired
            case .pending: return .pending
            }
        case 401: return .refused
        default: return .unreachable
        }
    }

    func devices(bearer: String) async throws -> AccountDevicesAnswer {
        guard let (status, data) = try await get(Self.devicesPath, bearer: bearer) else {
            return .unreachable
        }
        switch status {
        case 200:
            guard let listed = try? decoder.decode([ListedDevice].self, from: data) else {
                return .unreachable
            }
            return .devices(listed.compactMap(\.accountDevice))
        case 401: return .unauthenticated
        case 403: return .notApproved
        default: return .unreachable
        }
    }

    private var decoder: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let text = try decoder.singleValueContainer().decode(String.self)
            guard
                let date =
                    (try? Date.ISO8601FormatStyle(includingFractionalSeconds: true).parse(text))
                    ?? (try? Date.ISO8601FormatStyle().parse(text))
            else {
                throw DecodingError.dataCorrupted(
                    .init(codingPath: decoder.codingPath, debugDescription: "Not an ISO 8601 date"))
            }
            return date
        }
        return decoder
    }

    private func get(_ path: String, bearer: String) async throws -> (Int, Data)? {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
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

private struct OwnDevice: Decodable {
    enum Status: String, Decodable {
        case pending
        case approved
        case expired
    }

    let status: Status
}

private struct ListedDevice: Decodable {
    let id: String
    let name: String?
    let kind: String
    let status: String
    let approvalExpiresAt: Date?
    let current: Bool
    let ed25519PublicKey: String

    var accountDevice: AccountDevice? {
        guard let signingKey = Data(unpaddedBase64URL: ed25519PublicKey), signingKey.count == 32
        else { return nil }
        return AccountDevice(
            id: id, name: name, kind: AccountDevice.Kind(rawValue: kind) ?? .computer,
            isPending: status == "pending", approvalExpiresAt: approvalExpiresAt,
            isCurrent: current, signingKey: signingKey)
    }
}
