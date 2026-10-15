import Foundation
import Security
import Testing

@testable import Kiroshi

@Suite(.serialized)
struct KeychainSessionStoreTests {
    let store = KeychainSessionStore(service: "com.kiroshi.app.ios.tests.session")

    @Test func keepsTheSessionUntilCleared() throws {
        store.clear()
        #expect(store.load() == nil)

        try store.save(CloudFixture.session)
        #expect(store.load() == CloudFixture.session)

        let next = Session(
            bearer: "next-bearer", email: "sam@example.com", deviceName: "Sam's iPhone",
            platform: "ios")
        try store.save(next)
        #expect(store.load() == next)

        store.clear()
        #expect(store.load() == nil)
    }

    @Test func loadsTheSessionAnEarlierBuildSaved() throws {
        store.clear()
        let item: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: store.service,
            kSecAttrAccount as String: "session",
            kSecValueData as String: Data(
                #"{"bearer":"fixture-bearer","email":"sam@example.com"}"#.utf8),
        ]
        try #require(SecItemAdd(item as CFDictionary, nil) == errSecSuccess)

        #expect(store.load() == Session(bearer: "fixture-bearer", email: CloudFixture.email))
        store.clear()
    }
}
