import CryptoKit
import Foundation

struct RosterSet: Codable, Equatable, Sendable {
    struct Row: Codable, Equatable, Sendable {
        let deviceId: String
        let relayDeviceId: String
        let accountId: String
        let signingPublicKey: String
        let agreementPublicKey: String
        let fingerprint: String
        let addedAt: Int64
        let signature: String
    }

    let spaceId: String
    let host: String
    let keyId: UInt32
    let version: UInt64
    let rows: [Row]
    let sig: String
}

struct KeyHandover: Codable, Sendable {
    let keyId: UInt32
    let spaceKey: String
    let roster: RosterSet
}

struct RekeyFrame: Codable, Sendable {
    let v: Int
    let instance: String
    let to: String?
    let rekey: String
    let sig: String
}

struct HandedSpaceKey: Sendable {
    let spaceKey: SymmetricKey
    let keyId: UInt32
    let hostSigningKey: Curve25519.Signing.PublicKey
    let hostRelayId: String
    let roster: RosterSet

    var spaceKeys: SpaceKeys {
        SpaceKeys(
            spaceKey: spaceKey, keyId: keyId, hostSigningKey: hostSigningKey,
            hostRelayIds: [hostRelayId])
    }
}

enum RekeyRefusal: Error, Equatable {
    case notARekey
    case badSignature
    case notInRoster
}

enum SpaceHandover {
    static let rowDomain = Data("kiroshi/v2/roster".utf8)
    static let setDomain = Data("kiroshi/v2/roster-set".utf8)
    static let rekeyDomain = Data("kiroshi/v2/rekey".utf8)

    static func firstRekey(_ text: String, instance: String, device: RelayDevice)
        throws(RekeyRefusal) -> HandedSpaceKey
    {
        guard let frame = try? snakeCase.decode(RekeyFrame.self, from: Data(text.utf8)),
            frame.v == 2, frame.instance == instance, frame.to == device.relayId
        else { throw .notARekey }
        guard let sealed = Data(base64Encoded: frame.rekey),
            let sig = Data(base64Encoded: frame.sig),
            let opened = try? RelayCrypto.openBox(sealed, with: device.keys.agreement),
            let handover = try? snakeCase.decode(KeyHandover.self, from: opened),
            let spaceKey = Data(base64Encoded: handover.spaceKey), spaceKey.count == 32,
            handover.keyId == handover.roster.keyId
        else { throw .badSignature }
        let host = try verifiedHost(of: handover.roster, own: device.keys.deviceId)
        let signed = rekeyBytes(instance: instance, to: device.keys.deviceId, sealed: sealed)
        guard RelayCrypto.isStrictlyValid(sig, for: signed, by: host.signingKey) else {
            throw .badSignature
        }
        return HandedSpaceKey(
            spaceKey: SymmetricKey(data: spaceKey), keyId: handover.keyId,
            hostSigningKey: host.signingKey, hostRelayId: host.relayId, roster: handover.roster)
    }

    static func rowBytes(spaceId: String, row: RosterSet.Row) -> Data? {
        guard let signing = Data(base64Encoded: row.signingPublicKey),
            let agreement = Data(base64Encoded: row.agreementPublicKey)
        else { return nil }
        var bytes = rowDomain
        for field in [
            Data(spaceId.utf8), Data(row.deviceId.utf8), Data(row.relayDeviceId.utf8),
            Data(row.accountId.utf8), signing, agreement, Data(row.fingerprint.utf8),
        ] {
            bytes += bigEndian(UInt64(field.count)) + field
        }
        return bytes + bigEndian(row.addedAt)
    }

    static func setBytes(spaceId: String, version: UInt64, keyId: UInt32, deviceIds: [String])
        -> Data
    {
        let sorted = deviceIds.compactMap { Data(hex: $0) }.sorted {
            $0.lexicographicallyPrecedes($1)
        }
        let space = Data(spaceId.utf8)
        return setDomain + bigEndian(UInt64(space.count)) + space + bigEndian(version)
            + bigEndian(keyId) + bigEndian(UInt64(sorted.count)) + sorted.reduce(Data(), +)
    }

    static func rekeyBytes(instance: String, to deviceId: String, sealed: Data) -> Data {
        let instanceBytes = Data(instance.utf8)
        return rekeyDomain + bigEndian(UInt64(instanceBytes.count)) + instanceBytes
            + (Data(hex: deviceId) ?? Data(count: 16)) + bigEndian(UInt64(sealed.count)) + sealed
    }

    static let snakeCase: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return decoder
    }()

    private static func verifiedHost(of roster: RosterSet, own deviceId: String)
        throws(RekeyRefusal) -> (signingKey: Curve25519.Signing.PublicKey, relayId: String)
    {
        guard let hostRow = roster.rows.first(where: { $0.deviceId == roster.host }),
            let hostKey = signingKey(of: hostRow),
            RelayCrypto.deviceId(of: hostKey) == roster.host,
            roster.rows.allSatisfy({ isSigned($0, in: roster.spaceId, by: hostKey) }),
            let sig = Data(base64Encoded: roster.sig),
            RelayCrypto.isStrictlyValid(
                sig,
                for: setBytes(
                    spaceId: roster.spaceId, version: roster.version, keyId: roster.keyId,
                    deviceIds: roster.rows.map(\.deviceId)),
                by: hostKey)
        else { throw .badSignature }
        guard roster.rows.contains(where: { $0.deviceId == deviceId }) else {
            throw .notInRoster
        }
        return (hostKey, hostRow.relayDeviceId)
    }

    private static func isSigned(
        _ row: RosterSet.Row, in spaceId: String, by host: Curve25519.Signing.PublicKey
    ) -> Bool {
        guard let signing = signingKey(of: row),
            RelayCrypto.deviceId(of: signing) == row.deviceId,
            Data(base64Encoded: row.agreementPublicKey)?.count == 32,
            let signature = Data(base64Encoded: row.signature),
            let bytes = rowBytes(spaceId: spaceId, row: row)
        else { return false }
        return RelayCrypto.isStrictlyValid(signature, for: bytes, by: host)
    }

    private static func signingKey(of row: RosterSet.Row) -> Curve25519.Signing.PublicKey? {
        Data(base64Encoded: row.signingPublicKey).flatMap {
            try? Curve25519.Signing.PublicKey(rawRepresentation: $0)
        }
    }

    private static func bigEndian<Value: FixedWidthInteger>(_ value: Value) -> Data {
        withUnsafeBytes(of: value.bigEndian) { Data($0) }
    }
}
