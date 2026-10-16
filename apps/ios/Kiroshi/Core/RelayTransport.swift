import Foundation

protocol RelayTransport: Sendable {
    func open(_ request: URLRequest) async throws -> any RelaySocket
}

protocol RelaySocket: Sendable {
    func send(_ text: String) async throws
    func receive() async throws -> String
    func ping() async throws
    func close()
}

struct RelayRefusal: Error, Equatable {
    let status: Int
}

struct RelayClosure: Error, Equatable {
    static let hostOffline = 4002
    static let membershipEnded = 4003
    static let sessionRevoked = 4004
    static let serverRestarting = 4005

    let code: Int
}
