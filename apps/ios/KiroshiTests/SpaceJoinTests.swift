import Foundation
import Observation
import Testing

@testable import Kiroshi

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct SpaceJoinTests {
    let studio = Space(id: "studio", name: "Studio", role: .member, isHostOnline: true)
    let homeLab = Space(id: "home-lab", name: "Home lab", role: .member, isHostOnline: true)
    let relay = TestRelayTransport()

    func waitUntil(_ condition: @escaping @MainActor @Sendable () -> Bool) async {
        for await isMet in Observations({ condition() }) where isMet {
            return
        }
    }

    func makeStore(handsKeys: Bool) -> SpaceStore {
        SpaceStore(
            spaces: [studio, homeLab], session: CloudFixture.session, device: FixtureKeys.device,
            cloud: KiroshiCloud(
                baseURL: KiroshiCloud.productionURL, transport: ScriptedTransport()),
            lastSpace: InMemoryLastSpaceStore(),
            relay: RelayEnvironment(
                transport: relay, clock: TestRelayClock(),
                spaceKeys: FixtureSpaceKeys(missing: [studio.id]), handsKeys: handsKeys),
            exit: { _ in })
    }

    @Test func aSpaceWithoutItsKeyWaitsForItInsteadOfLookingUnreachable() async {
        let store = makeStore(handsKeys: false)
        let following = Task { await store.follow() }
        await relay.nextOpening().accept(ScriptedRelaySocket())

        await waitUntil { store.spaceToJoin != nil }

        #expect(store.spaceToJoin == studio)
        #expect(store.offlineSpace == nil)
        store.select(homeLab.id)
        #expect(store.spaceToJoin == nil)
        store.leave()
        await following.value
    }

    @Test func aSpaceWithoutItsKeyComesOnlineOnceItsHostHandsIt() async throws {
        let store = makeStore(handsKeys: true)
        let following = Task { await store.follow() }

        await relay.nextOpening().accept(ScriptedRelaySocket(sharedSpaceId: "space-studio"))

        await waitUntil { store.connection != nil }
        let connection = try #require(store.connection)
        for await update in await connection.updates() {
            if case .state(.online) = update { break }
        }
        await waitUntil { store.spaceToJoin == nil }
        store.leave()
        await following.value
    }
}
