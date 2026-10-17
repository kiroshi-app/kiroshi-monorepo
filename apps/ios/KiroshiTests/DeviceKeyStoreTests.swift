import CryptoKit
import Foundation
import Security
import Testing

@testable import Kiroshi

struct DeviceKeyStoreTests {
    @Test func createsTheKeysOnceInOneItemAndReadsThemBack() async throws {
        let keychain = InMemoryKeychain()
        let store = DeviceKeyStore(keychain: keychain)

        let created = try await store.keys()
        let read = try await store.keys()

        #expect(read.rawRepresentation == created.rawRepresentation)
        #expect(await keychain.writes == [DeviceKeyStore.account])
        #expect(await keychain.items[DeviceKeyStore.account] == created.rawRepresentation)
        #expect(created.rawRepresentation.prefix(32) == created.signing.rawRepresentation)
        #expect(created.rawRepresentation.suffix(32) == created.agreement.rawRepresentation)
    }

    @Test func twoFirstLaunchReadsEndWithOneIdentity() async throws {
        let keychain = InMemoryKeychain()
        let store = DeviceKeyStore(keychain: keychain)

        async let first = store.keys()
        async let second = store.keys()
        let (one, other) = try await (first, second)

        #expect(one.deviceId == other.deviceId)
        #expect(one.rawRepresentation == other.rawRepresentation)
        #expect(await keychain.items[DeviceKeyStore.account] == one.rawRepresentation)
        #expect(await keychain.writes == [DeviceKeyStore.account])
    }

    @Test func aFailingReadNeverReplacesTheIdentity() async throws {
        let keychain = InMemoryKeychain()
        let store = DeviceKeyStore(keychain: keychain)
        let created = try await store.keys()
        await keychain.fail(DeviceKeyStore.account, with: errSecInteractionNotAllowed)

        await #expect(
            throws: DeviceKeysUnavailable.unreadable(
                KeychainError(status: errSecInteractionNotAllowed))
        ) {
            try await store.keys()
        }

        await keychain.heal(DeviceKeyStore.account)
        #expect(try await store.keys().rawRepresentation == created.rawRepresentation)
        #expect(await keychain.writes.count == 1)
    }

    @Test func anItemOfTheWrongLengthIsLeftInPlace() async {
        let items = [DeviceKeyStore.account: Data(count: 63)]
        let keychain = InMemoryKeychain(items)

        await #expect(throws: DeviceKeysUnavailable.malformed) {
            try await DeviceKeyStore(keychain: keychain).keys()
        }
        #expect(await keychain.items == items)
    }

    @Test func keysThatCannotBeStoredAreNotHandedOut() async {
        let keychain = InMemoryKeychain()
        await keychain.fail(DeviceKeyStore.account, with: errSecNotAvailable)

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
        await keychain.delete(DeviceKeyStore.account)
        let store = DeviceKeyStore(keychain: keychain)
        let created = try await store.keys()
        try sessions.save(CloudFixture.session)

        sessions.clear()

        #expect(sessions.load() == nil)
        #expect(try await store.keys().rawRepresentation == created.rawRepresentation)
        await keychain.delete(DeviceKeyStore.account)
    }

    @Test func aSecondCreationKeepsTheStoredKeys() async throws {
        await keychain.delete(DeviceKeyStore.account)
        let stored = try await DeviceKeyStore(keychain: keychain).keys()

        await #expect(throws: KeychainError(status: errSecDuplicateItem)) {
            try await keychain.add(Data(count: 64), as: DeviceKeyStore.account)
        }
        #expect(try await keychain.read(DeviceKeyStore.account) == stored.rawRepresentation)
        await keychain.delete(DeviceKeyStore.account)
    }

    @Test func theKeysStayOnThisDeviceAfterTheFirstUnlock() async throws {
        await keychain.delete(DeviceKeyStore.account)
        _ = try await DeviceKeyStore(keychain: keychain).keys()
        let lookup: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.service,
            kSecAttrAccount as String: DeviceKeyStore.account,
            kSecReturnAttributes as String: true,
        ]
        var item: CFTypeRef?

        try #require(SecItemCopyMatching(lookup as CFDictionary, &item) == errSecSuccess)
        let attributes = try #require(item as? [String: Any])
        #expect(
            attributes[kSecAttrAccessible as String] as? String
                == kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly as String)
        #expect((attributes[kSecAttrSynchronizable as String] as? Bool ?? false) == false)
        await keychain.delete(DeviceKeyStore.account)
    }
}
