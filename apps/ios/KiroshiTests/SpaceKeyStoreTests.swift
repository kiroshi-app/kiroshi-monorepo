import CryptoKit
import Foundation
import Testing

@testable import Kiroshi

struct SpaceKeyStoreTests {
    @Test func noSpaceHasAKeyYet() async {
        let store = KeychainSpaceKeyStore(
            keychain: SystemKeychain(service: "com.kiroshi.app.ios.tests.space-keys"))

        #expect(await store.keys(for: "space-1", openedWith: FixtureKeys.member) == nil)
    }

    @Test func aWrappedKeyOpensWithTheAgreementKey() async throws {
        let spaceKey = SymmetricKey(size: .bits256).withUnsafeBytes { Data($0) }
        let wrapped = WrappedSpaceKey(
            keyId: 7, hostSigningKey: FixtureKeys.host.signing.publicKey.rawRepresentation,
            hostRelayIds: [FixtureKeys.hostRelayId],
            sealedSpaceKey: try RelayCrypto.sealBox(
                spaceKey, to: FixtureKeys.member.agreement.publicKey))
        let keychain = InMemoryKeychain([
            KeychainSpaceKeyStore.account(for: "space-1"): try JSONEncoder().encode(wrapped)
        ])
        let store = KeychainSpaceKeyStore(keychain: keychain)

        let keys = try #require(await store.keys(for: "space-1", openedWith: FixtureKeys.member))

        #expect(keys.spaceKey.withUnsafeBytes { Data($0) } == spaceKey)
        #expect(keys.keyId == 7)
        #expect(
            keys.hostSigningKey.rawRepresentation
                == FixtureKeys.host.signing.publicKey.rawRepresentation)
        #expect(keys.hostRelayIds == [FixtureKeys.hostRelayId])
        #expect(await store.keys(for: "space-1", openedWith: FixtureKeys.host) == nil)
        #expect(await store.keys(for: "space-2", openedWith: FixtureKeys.member) == nil)
    }

    @Test func aHandedKeyIsStoredSealedToThisDeviceWithItsRoster() async throws {
        let keychain = InMemoryKeychain()
        let store = KeychainSpaceKeyStore(keychain: keychain)
        let handed = try SpaceHandover.firstRekey(
            try FixtureRekey.frame(instance: "space-1"), instance: "space-1",
            device: FixtureKeys.device)

        try await store.save(handed, for: "space-1", sealedTo: FixtureKeys.member)

        let keys = try #require(await store.keys(for: "space-1", openedWith: FixtureKeys.member))
        #expect(
            keys.spaceKey.withUnsafeBytes { Data($0) }
                == FixtureKeys.spaceKeys.spaceKey.withUnsafeBytes { Data($0) })
        #expect(keys.keyId == FixtureKeys.spaceKeys.keyId)
        #expect(keys.hostRelayIds == [FixtureKeys.hostRelayId])
        let item = try #require(
            try await keychain.read(KeychainSpaceKeyStore.account(for: "space-1")))
        let wrapped = try JSONDecoder().decode(WrappedSpaceKey.self, from: item)
        #expect(wrapped.roster == handed.roster)
        let clearKey = FixtureKeys.spaceKeys.spaceKey.withUnsafeBytes { Data($0) }
        #expect(!String(decoding: item, as: UTF8.self).contains(clearKey.base64EncodedString()))
    }
}
