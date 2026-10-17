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
}
