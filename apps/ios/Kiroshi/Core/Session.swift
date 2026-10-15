struct Session: Codable, Equatable, Sendable {
    let bearer: String
    let email: String
    var userId: String?
    var deviceName: String?
    var platform: String?

    var accountId: String {
        userId ?? email
    }
}
