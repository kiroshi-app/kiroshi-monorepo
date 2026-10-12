struct Session: Codable, Equatable, Sendable {
    let bearer: String
    let email: String
    var deviceName: String?
    var platform: String?
}
