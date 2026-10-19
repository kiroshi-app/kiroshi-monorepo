import CryptoKit
import Foundation
import Testing

@testable import Kiroshi

struct SpaceHandoverTests {
    let instance = "instance-1"
    let device = FixtureKeys.device

    @Test func theFirstRekeyHandsTheKeyAndPinsTheHostRowOfItsRoster() throws {
        let handed = try SpaceHandover.firstRekey(
            try FixtureRekey.frame(instance: instance), instance: instance, device: device)

        #expect(
            handed.spaceKey.withUnsafeBytes { Data($0) }
                == FixtureKeys.spaceKeys.spaceKey.withUnsafeBytes { Data($0) })
        #expect(handed.keyId == FixtureKeys.spaceKeys.keyId)
        #expect(
            handed.hostSigningKey.rawRepresentation
                == FixtureKeys.host.signing.publicKey.rawRepresentation)
        #expect(handed.hostRelayId == FixtureKeys.hostRelayId)
        #expect(handed.roster.rows.map(\.deviceId).contains(FixtureKeys.member.deviceId))
    }

    @Test func aFrameThatIsNotThisDevicesRekeyIsIgnored() throws {
        let stranger = FixtureRekey.Device(
            keys: DeviceKeys(
                signing: Curve25519.Signing.PrivateKey(),
                agreement: Curve25519.KeyAgreement.PrivateKey()),
            relayId: "5d2c0000-0000-4000-8000-0000000000c1", accountId: "eve")
        let forAnother = try FixtureRekey.frame(
            instance: instance, rostering: [FixtureRekey.host, FixtureRekey.member, stranger],
            to: stranger)
        let otherInstance = try FixtureRekey.frame(instance: "instance-2")

        for frame in [forAnother, otherInstance, #"{"v":2,"instance":"instance-1"}"#] {
            #expect(throws: RekeyRefusal.notARekey) {
                try SpaceHandover.firstRekey(frame, instance: instance, device: device)
            }
        }
    }

    @Test func aRosterThatDoesNotListThisDeviceStoresNoKey() throws {
        let frame = try FixtureRekey.frame(instance: instance, rostering: [FixtureRekey.host])

        #expect(throws: RekeyRefusal.notInRoster) {
            try SpaceHandover.firstRekey(frame, instance: instance, device: device)
        }
    }

    @Test func aRekeySignedByAnotherKeyThanItsHostRowIsRefused() throws {
        let forger = DeviceKeys(
            signing: Curve25519.Signing.PrivateKey(),
            agreement: Curve25519.KeyAgreement.PrivateKey())
        var frame = try JSONDecoder().decode(
            RekeyFrame.self, from: Data(try FixtureRekey.frame(instance: instance).utf8))
        let sealed = try #require(Data(base64Encoded: frame.rekey))
        let forged = try forger.signing.signature(
            for: SpaceHandover.rekeyBytes(
                instance: instance, to: FixtureKeys.member.deviceId, sealed: sealed))
        frame = RekeyFrame(
            v: 2, instance: instance, to: frame.to, rekey: frame.rekey,
            sig: forged.base64EncodedString())

        #expect(throws: RekeyRefusal.badSignature) {
            try SpaceHandover.firstRekey(
                String(decoding: try JSONEncoder().encode(frame), as: UTF8.self),
                instance: instance, device: device)
        }
    }

    @Test func aRosterSignedByAnotherHostOrWithASwappedRowIsRefused() throws {
        let stranger = DeviceKeys(
            signing: Curve25519.Signing.PrivateKey(),
            agreement: Curve25519.KeyAgreement.PrivateKey())
        let signedByAnother = try FixtureRekey.frame(instance: instance, signer: stranger)
        let swapped = try handover(instance: instance) { roster in
            var rows = roster.rows
            let row = rows[0]
            rows[0] = RosterSet.Row(
                deviceId: row.deviceId, relayDeviceId: row.relayDeviceId, accountId: "eve",
                signingPublicKey: row.signingPublicKey,
                agreementPublicKey: row.agreementPublicKey, fingerprint: row.fingerprint,
                addedAt: row.addedAt, signature: row.signature)
            return RosterSet(
                spaceId: roster.spaceId, host: roster.host, keyId: roster.keyId,
                version: roster.version, rows: rows, sig: roster.sig)
        }

        for frame in [signedByAnother, swapped] {
            #expect(throws: RekeyRefusal.badSignature) {
                try SpaceHandover.firstRekey(frame, instance: instance, device: device)
            }
        }
    }

    @Test func aHandoverWhoseKeyIdDiffersFromItsRosterIsRefused() throws {
        let frame = try handover(instance: instance, keyId: 8) { $0 }

        #expect(throws: RekeyRefusal.badSignature) {
            try SpaceHandover.firstRekey(frame, instance: instance, device: device)
        }
    }

    @Test func theSignedBytesFollowTheV2Layouts() throws {
        let row = RosterSet.Row(
            deviceId: "ab", relayDeviceId: "r", accountId: "a",
            signingPublicKey: Data(repeating: 1, count: 32).base64EncodedString(),
            agreementPublicKey: Data(repeating: 2, count: 32).base64EncodedString(),
            fingerprint: "f", addedAt: 1, signature: "")
        let length = { (count: UInt8) in Data([0, 0, 0, 0, 0, 0, 0, count]) }
        let text = { (text: String) in Data(text.utf8) }
        let high = String(repeating: "f", count: 32)
        let low = String(repeating: "0", count: 31) + "1"
        let lowBytes = try #require(Data(hex: low))
        let highBytes = try #require(Data(hex: high))
        let expectedRow: [Data] = [
            text("kiroshi/v2/roster"), length(1), text("s"), length(2), text("ab"), length(1),
            text("r"), length(1), text("a"), length(32), Data(repeating: 1, count: 32),
            length(32), Data(repeating: 2, count: 32), length(1), text("f"), length(1),
        ]
        let expectedSet: [Data] = [
            text("kiroshi/v2/roster-set"), length(1), text("s"), length(7), Data([0, 0, 0, 2]),
            length(2), lowBytes, highBytes,
        ]
        let expectedRekey: [Data] = [
            text("kiroshi/v2/rekey"), length(1), text("i"), lowBytes, length(3),
            Data([9, 9, 9]),
        ]

        #expect(SpaceHandover.rowBytes(spaceId: "s", row: row) == expectedRow.reduce(Data(), +))
        #expect(
            SpaceHandover.setBytes(spaceId: "s", version: 7, keyId: 2, deviceIds: [high, low])
                == expectedSet.reduce(Data(), +))
        #expect(
            SpaceHandover.rekeyBytes(instance: "i", to: low, sealed: Data([9, 9, 9]))
                == expectedRekey.reduce(Data(), +))
    }

    private func handover(
        instance: String, keyId: UInt32 = FixtureKeys.spaceKeys.keyId,
        _ change: (RosterSet) -> RosterSet
    ) throws -> String {
        let roster = change(
            FixtureRekey.signedRoster(
                of: [FixtureRekey.host, FixtureRekey.member],
                keyId: FixtureKeys.spaceKeys.keyId, signer: FixtureKeys.host))
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        let plaintext = try encoder.encode(
            KeyHandover(
                keyId: keyId,
                spaceKey: FixtureKeys.spaceKeys.spaceKey.withUnsafeBytes { Data($0) }
                    .base64EncodedString(), roster: roster))
        let sealed = try RelayCrypto.sealBox(
            plaintext, to: FixtureKeys.member.agreement.publicKey)
        let sig = try FixtureKeys.host.signing.signature(
            for: SpaceHandover.rekeyBytes(
                instance: instance, to: FixtureKeys.member.deviceId, sealed: sealed))
        let frame = RekeyFrame(
            v: 2, instance: instance, to: FixtureKeys.memberRelayId,
            rekey: sealed.base64EncodedString(), sig: sig.base64EncodedString())
        return String(decoding: try JSONEncoder().encode(frame), as: UTF8.self)
    }
}
