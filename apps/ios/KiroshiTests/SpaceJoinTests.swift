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

    @Test func aSpaceWithoutItsKeyAsksToJoinInsteadOfLookingUnreachable() async {
        let store = SpaceStore(
            spaces: [studio, homeLab], session: CloudFixture.session, device: FixtureKeys.device,
            cloud: KiroshiCloud(
                baseURL: KiroshiCloud.productionURL, transport: ScriptedTransport()),
            lastSpace: InMemoryLastSpaceStore(),
            relay: RelayEnvironment(
                transport: relay, clock: TestRelayClock(),
                spaceKeys: FixtureSpaceKeys(missing: [studio.id])),
            exit: { _ in })
        let following = Task { await store.follow() }

        await waitUntil { store.spaceToJoin != nil }

        #expect(store.spaceToJoin == studio)
        #expect(store.offlineSpace == nil)
        store.select(homeLab.id)
        #expect(store.spaceToJoin == nil)
        store.leave()
        await following.value
    }
}
