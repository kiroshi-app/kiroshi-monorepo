import Foundation

struct RelayWireFrame: Codable, Sendable {
    let v: Int
    let instance: String
    let from: String?
    let to: String?
    let keyId: UInt32
    let ctr: UInt64
    let challenge: String?
    let ct: String
    let sig: String

    enum CodingKeys: String, CodingKey {
        case v, instance, from, to, ctr, challenge, ct, sig
        case keyId = "key_id"
    }
}
