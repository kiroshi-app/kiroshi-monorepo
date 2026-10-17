import Foundation
import Security
import Testing

@testable import Kiroshi

struct FrameCountersTests {
    let keychain = InMemoryKeychain()

    @Test func countsFromOneAndStoresEachValueBigEndian() async throws {
        let counters = FrameCounters(keychain: keychain)

        #expect(try await counters.nextSent(in: "space-1", keyId: 7) == 1)
        #expect(try await counters.nextSent(in: "space-1", keyId: 7) == 2)
        #expect(try await counters.nextSent(in: "space-1", keyId: 8) == 1)
        #expect(await keychain.items["frame-ctr.sent.space-1.7"] == Data([0, 0, 0, 0, 0, 0, 0, 2]))
    }

    @Test func aRestartCarriesOnFromTheStoredCounter() async throws {
        _ = try await FrameCounters(keychain: keychain).nextSent(in: "space-1", keyId: 7)

        #expect(try await FrameCounters(keychain: keychain).nextSent(in: "space-1", keyId: 7) == 2)
    }

    @Test func concurrentSendsNeverShareACounter() async throws {
        let counters = FrameCounters(keychain: keychain)

        let sent = try await withThrowingTaskGroup(of: UInt64.self) { group in
            for _ in 0..<50 {
                group.addTask { try await counters.nextSent(in: "space-1", keyId: 7) }
            }
            return try await group.reduce(into: []) { $0.append($1) }
        }

        #expect(sent.sorted() == Array(1...50))
        #expect(
            await keychain.items["frame-ctr.sent.space-1.7"] == Data([0, 0, 0, 0, 0, 0, 0, 50]))
    }

    @Test func aKeyIdWhoseCounterCannotBeReadIsNeverUsedAgain() async throws {
        let counters = FrameCounters(keychain: keychain)
        await keychain.fail("frame-ctr.sent.space-1.7", with: errSecInteractionNotAllowed)

        await #expect(throws: FrameCounterError.unreadable) {
            try await counters.nextSent(in: "space-1", keyId: 7)
        }
        await keychain.heal("frame-ctr.sent.space-1.7")
        await #expect(throws: FrameCounterError.unreadable) {
            try await counters.nextSent(in: "space-1", keyId: 7)
        }
        #expect(try await counters.nextSent(in: "space-1", keyId: 8) == 1)
    }

    @Test func aCounterThatCannotBeStoredIsNeverUsedAgain() async throws {
        let counters = FrameCounters(keychain: keychain)
        _ = try await counters.nextSent(in: "space-1", keyId: 7)
        await keychain.fail("frame-ctr.sent.space-1.7", with: errSecNotAvailable)

        await #expect(throws: FrameCounterError.unreadable) {
            try await counters.nextSent(in: "space-1", keyId: 7)
        }
        await keychain.heal("frame-ctr.sent.space-1.7")
        await #expect(throws: FrameCounterError.unreadable) {
            try await counters.nextSent(in: "space-1", keyId: 7)
        }
    }

    @Test func theAcceptedCounterKeepsTheHighestAndOutlivesARestart() async throws {
        let counters = FrameCounters(keychain: keychain)
        #expect(try await counters.lastAccepted(in: "space-1", from: "host", keyId: 7) == 0)

        try await counters.accept(9, in: "space-1", from: "host", keyId: 7)
        try await counters.accept(4, in: "space-1", from: "host", keyId: 7)

        let restarted = FrameCounters(keychain: keychain)
        #expect(try await restarted.lastAccepted(in: "space-1", from: "host", keyId: 7) == 9)
        #expect(try await restarted.lastAccepted(in: "space-1", from: "other", keyId: 7) == 0)
    }
}
