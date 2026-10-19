#if DEBUG
    import CryptoKit
    import Foundation

    enum FixtureRekey {
        struct Device {
            let keys: DeviceKeys
            let relayId: String
            let accountId: String
        }

        static let host = Device(
            keys: FixtureKeys.host, relayId: FixtureKeys.hostRelayId, accountId: "noa")
        static let member = Device(
            keys: FixtureKeys.member, relayId: FixtureKeys.memberRelayId,
            accountId: CloudFixture.userId)

        static func frame(
            instance: String, rostering devices: [Device] = [host, member],
            spaceKey: SymmetricKey = FixtureKeys.spaceKeys.spaceKey,
            keyId: UInt32 = FixtureKeys.spaceKeys.keyId, signer: DeviceKeys = FixtureKeys.host,
            to recipient: Device = member
        ) throws -> String {
            let roster = signedRoster(of: devices, keyId: keyId, signer: signer)
            let handover = KeyHandover(
                keyId: keyId, spaceKey: spaceKey.withUnsafeBytes { Data($0) }.base64EncodedString(),
                roster: roster)
            let sealed = try RelayCrypto.sealBox(
                try snakeCase.encode(handover), to: recipient.keys.agreement.publicKey)
            let sig = try signer.signing.signature(
                for: SpaceHandover.rekeyBytes(
                    instance: instance, to: recipient.keys.deviceId, sealed: sealed))
            let frame = RekeyFrame(
                v: 2, instance: instance, to: recipient.relayId,
                rekey: sealed.base64EncodedString(), sig: sig.base64EncodedString())
            return String(decoding: try JSONEncoder().encode(frame), as: UTF8.self)
        }

        static func signedRoster(of devices: [Device], keyId: UInt32, signer: DeviceKeys)
            -> RosterSet
        {
            let spaceId = "fixture-space"
            let rows = devices.map { device in
                let unsigned = RosterSet.Row(
                    deviceId: device.keys.deviceId, relayDeviceId: device.relayId,
                    accountId: device.accountId,
                    signingPublicKey: device.keys.signing.publicKey.rawRepresentation
                        .base64EncodedString(),
                    agreementPublicKey: device.keys.agreement.publicKey.rawRepresentation
                        .base64EncodedString(),
                    fingerprint: "fixture", addedAt: 1_767_225_600_000, signature: "")
                let signature =
                    SpaceHandover.rowBytes(spaceId: spaceId, row: unsigned)
                    .flatMap { try? signer.signing.signature(for: $0) } ?? Data()
                return RosterSet.Row(
                    deviceId: unsigned.deviceId, relayDeviceId: unsigned.relayDeviceId,
                    accountId: unsigned.accountId, signingPublicKey: unsigned.signingPublicKey,
                    agreementPublicKey: unsigned.agreementPublicKey,
                    fingerprint: unsigned.fingerprint, addedAt: unsigned.addedAt,
                    signature: signature.base64EncodedString())
            }
            .sorted { $0.deviceId < $1.deviceId }
            let setSig = try? signer.signing.signature(
                for: SpaceHandover.setBytes(
                    spaceId: spaceId, version: 1, keyId: keyId, deviceIds: rows.map(\.deviceId)))
            return RosterSet(
                spaceId: spaceId, host: signer.deviceId, keyId: keyId, version: 1, rows: rows,
                sig: (setSig ?? Data()).base64EncodedString())
        }

        private static let snakeCase: JSONEncoder = {
            let encoder = JSONEncoder()
            encoder.keyEncodingStrategy = .convertToSnakeCase
            return encoder
        }()
    }
#endif
