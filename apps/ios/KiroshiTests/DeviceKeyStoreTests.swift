import CryptoKit
import Foundation
import Security
import Testing

@testable import Kiroshi

struct DeviceKeyStoreTests {
    @Test func createsTheKeysOnceAndReadsThemBack() async throws {
        let keychain = InMemoryKeychain()
        let store = DeviceKeyStore(keychain: keychain)

        let created = try await store.keys()
        let read = try await store.keys()

        #expect(read.signing.rawRepresentation == created.signing.rawRepresentation)
        #expect(read.agreement.rawRepresentation == created.agreement.rawRepresentation)
        #expect(
            await keychain.writes == [
                DeviceKeyStore.agreementAccount, DeviceKeyStore.signingAccount,
            ])
    }

    @Test func aFailingReadNeverReplacesTheIdentity() async throws {
        let keychain = InMemoryKeychain()
        let store = DeviceKeyStore(keychain: keychain)
        let created = try await store.keys()
        await keychain.fail(DeviceKeyStore.signingAccount, with: errSecInteractionNotAllowed)

        await #expect(
            throws: DeviceKeysUnavailable.unreadable(
                KeychainError(status: errSecInteractionNotAllowed))
        ) {
            try await store.keys()
        }

        await keychain.heal(DeviceKeyStore.signingAccount)
        #expect(
            try await store.keys().signing.rawRepresentation == created.signing.rawRepresentation)
        #expect(await keychain.writes.count == 2)
    }

    @Test func aSigningKeyWithoutItsAgreementKeyIsNotReplaced() async {
        let signing = Curve25519.Signing.PrivateKey().rawRepresentation
        let keychain = InMemoryKeychain([DeviceKeyStore.signingAccount: signing])

        await #expect(throws: DeviceKeysUnavailable.incomplete) {
            try await DeviceKeyStore(keychain: keychain).keys()
        }
        #expect(await keychain.items == [DeviceKeyStore.signingAccount: signing])
    }

    @Test func aKeyOfTheWrongLengthIsLeftInPlace() async {
        let items = [
            DeviceKeyStore.signingAccount: Data(count: 31),
            DeviceKeyStore.agreementAccount: Data(count: 32),
        ]
        let keychain = InMemoryKeychain(items)

        await #expect(throws: DeviceKeysUnavailable.malformed) {
            try await DeviceKeyStore(keychain: keychain).keys()
        }
        #expect(await keychain.items == items)
    }

    @Test func keysThatCannotBeStoredAreNotHandedOut() async {
        let keychain = InMemoryKeychain()
        await keychain.fail(DeviceKeyStore.signingAccount, with: errSecNotAvailable)

        await #expect(
            throws: DeviceKeysUnavailable.unreadable(KeychainError(status: errSecNotAvailable))
        ) {
            try await DeviceKeyStore(keychain: keychain).keys()
        }
    }
}

@Suite(.serialized)
struct KeychainDeviceKeyStoreTests {
    static let service = "com.kiroshi.app.ios.tests.device-keys"
    let keychain = SystemKeychain(service: service)
    let sessions = KeychainSessionStore(service: service)

    @Test func signingOutLeavesTheDeviceKeysInPlace() async throws {
        await keychain.delete(DeviceKeyStore.signingAccount)
        await keychain.delete(DeviceKeyStore.agreementAccount)
        let store = DeviceKeyStore(keychain: keychain)
        let created = try await store.keys()
        try sessions.save(CloudFixture.session)

        sessions.clear()

        #expect(sessions.load() == nil)
        let kept = try await store.keys()
        #expect(kept.signing.rawRepresentation == created.signing.rawRepresentation)
        #expect(kept.agreement.rawRepresentation == created.agreement.rawRepresentation)
        await keychain.delete(DeviceKeyStore.signingAccount)
        await keychain.delete(DeviceKeyStore.agreementAccount)
    }

    @Test func theKeysStayOnThisDeviceAfterTheFirstUnlock() async throws {
        await keychain.delete(DeviceKeyStore.signingAccount)
        _ = try await DeviceKeyStore(keychain: keychain).keys()
        let lookup: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.service,
            kSecAttrAccount as String: DeviceKeyStore.signingAccount,
            kSecReturnAttributes as String: true,
        ]
        var item: CFTypeRef?

        try #require(SecItemCopyMatching(lookup as CFDictionary, &item) == errSecSuccess)
        let attributes = try #require(item as? [String: Any])
        #expect(
            attributes[kSecAttrAccessible as String] as? String
                == kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly as String)
        #expect((attributes[kSecAttrSynchronizable as String] as? Bool ?? false) == false)
        await keychain.delete(DeviceKeyStore.signingAccount)
        await keychain.delete(DeviceKeyStore.agreementAccount)
    }
}
