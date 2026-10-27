import Foundation
import Observation
import Testing

@testable import Kiroshi

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct SpaceStoreTests {
    let studio = Space(id: "studio", name: "Studio", role: .owner, isHostOnline: false)
    let homeLab = Space(id: "home-lab", name: "Home lab", role: .member, isHostOnline: true)
    let http = ScriptedTransport()
    let relay = TestRelayTransport()
    let clock = TestRelayClock()
    let lastSpace = InMemoryLastSpaceStore()

    func makeStore(
        lastSpace: InMemoryLastSpaceStore? = nil, exit: @escaping (ShellExit) -> Void = { _ in }
    ) -> SpaceStore {
        SpaceStore(
            spaces: [studio, homeLab],
            session: CloudFixture.session, device: FixtureKeys.device,
            cloud: KiroshiCloud(baseURL: KiroshiCloud.productionURL, transport: http),
            lastSpace: lastSpace ?? self.lastSpace,
            relay: RelayEnvironment(transport: relay, clock: clock),
            exit: exit)
    }

    func waitUntil(_ condition: @escaping @MainActor @Sendable () -> Bool) async {
        for await isMet in Observations({ condition() }) where isMet {
            return
        }
    }

    @Test func aSessionSavedWithoutItsUserIdKeepsYourMessagesYours() {
        let store = SpaceStore(
            spaces: [homeLab],
            session: Session(bearer: "older-bearer", email: CloudFixture.email),
            device: FixtureKeys.device,
            cloud: KiroshiCloud(baseURL: KiroshiCloud.productionURL, transport: http),
            lastSpace: lastSpace, relay: RelayEnvironment(transport: relay, clock: clock),
            exit: { _ in })
        let yours = TranscriptMessage(
            id: "m1", conversationId: "c1", seq: 1, role: .user, content: "Hi",
            completion: .complete, createdAt: 1, authorBotId: nil,
            authorAccountId: CloudFixture.userId, authorName: "Sam")

        #expect(store.authorship.accountId == nil)
        #expect(store.authorship.author(of: yours) == .you)
    }

    @Test func reopensOnTheLastPickedSpace() {
        let store = makeStore(lastSpace: InMemoryLastSpaceStore("home-lab"))

        #expect(store.currentSpace == homeLab)
    }

    @Test func opensOnTheFirstSpaceWhenTheLastOneIsGone() {
        let store = makeStore(lastSpace: InMemoryLastSpaceStore("deleted"))

        #expect(store.currentSpace == studio)
    }

    @Test func pickingASpaceSwitchesAndRemembersIt() {
        let store = makeStore()

        store.select("home-lab")

        #expect(store.currentSpaceId == "home-lab")
        #expect(lastSpace.saved == "home-lab")
        #expect(makeStore().currentSpaceId == "home-lab")
    }

    @Test func pickingAnUnknownSpaceChangesNothing() {
        let store = makeStore()

        store.select("deleted")

        #expect(store.currentSpaceId == "studio")
        #expect(lastSpace.saved == nil)
    }

    @Test func theCurrentHostPresenceFollowsTheRelay() async {
        let store = makeStore()
        let following = Task { await store.follow() }
        let socket = ScriptedRelaySocket(sharedSpaceId: "s-1")

        await relay.nextOpening().accept(socket)
        await waitUntil { store.currentSpace?.isHostOnline == true }
        #expect(store.offlineSpace == nil)

        socket.push(.close(RelayClosure.hostOffline))
        await waitUntil { store.currentSpace?.isHostOnline == false }
        #expect(store.offlineSpace == store.currentSpace)
        #expect(store.spaces.last?.isHostOnline == true)

        following.cancel()
        await following.value
        #expect(store.connection == nil)
    }

    @Test func eachSpaceTellsItsPresenceFromItsRoleAndItsHost() {
        let store = makeStore()
        let sideProject = Space(id: "side", name: "Side", role: .member, isHostOnline: false)
        let hosted = Space(id: "hosted", name: "Hosted", role: .owner, isHostOnline: true)

        #expect(store.presence(of: hosted) == .shared)
        #expect(store.presence(of: homeLab) == .online)
        #expect(store.presence(of: studio) == .notConnected)
        #expect(store.presence(of: sideProject) == .notConnected)
    }

    @Test func theCurrentSpaceConnectsOnlyUntilItsHostFirstAnswers() async {
        let store = makeStore()
        let current = { store.currentSpace.map(store.presence(of:)) }
        let following = Task { await store.follow() }

        let first = await relay.nextOpening()
        await waitUntil { current() == .connecting }
        #expect(store.presence(of: homeLab) == .online)

        first.close(RelayClosure.hostOffline)
        await waitUntil { current() == .notConnected }

        var sleeps = clock.sleeps.makeAsyncIterator()
        await sleeps.next()?.wake.yield()
        let second = await relay.nextOpening()
        for _ in 0..<10 { await Task.yield() }
        #expect(current() == .notConnected)

        second.accept(ScriptedRelaySocket(sharedSpaceId: "s-1"))
        await waitUntil { current() == .shared }

        following.cancel()
        await following.value
        #expect(store.spaceIdsAwaitingHost.isEmpty)
    }

    @Test func leavingClosesTheRelaySocketForGood() async throws {
        let store = makeStore()
        let following = Task { await store.follow() }
        await relay.nextOpening().accept(ScriptedRelaySocket(sharedSpaceId: "s-1"))
        await waitUntil { store.currentSpace?.isHostOnline == true }
        let connection = try #require(store.connection)

        store.leave()
        await following.value

        #expect(await connection.state == .paused)
        #expect(await connection.isRunning == false)
        #expect(store.connection == nil)
        await store.follow()
        #expect(store.connection == nil)
    }

    @Test func aRefusedAccountSignsOut() async {
        let (exits, exit) = AsyncStream<ShellExit>.makeStream()
        let store = makeStore { exit.yield($0) }
        let following = Task { await store.follow() }

        await relay.nextOpening().refuse(401)

        var exitIterator = exits.makeAsyncIterator()
        #expect(await exitIterator.next() == .signedOut)
        following.cancel()
    }

    @Test func aShellThatLeftIgnoresALateRefusal() async {
        await http.answer(
            CloudFixture.spacesPath, with: CloudFixture.refused("Authentication required"))
        var exits: [ShellExit] = []
        let store = makeStore { exits.append($0) }

        store.leave()
        await store.refreshSpaces()

        #expect(exits.isEmpty)
    }

    @Test func anEndedMembershipForgetsTheSpace() async {
        lastSpace.save("studio")
        let store = makeStore()
        let following = Task { await store.follow() }

        await relay.nextOpening().refuse(404)
        await waitUntil { store.spaces.count == 1 }

        #expect(store.spaces == [homeLab])
        #expect(store.currentSpaceId == "home-lab")
        #expect(lastSpace.saved == nil)
        following.cancel()
    }

    @Test func theLastEndedMembershipLeavesTheShell() async {
        let (exits, exit) = AsyncStream<ShellExit>.makeStream()
        let store = SpaceStore(
            spaces: [studio], session: CloudFixture.session, device: FixtureKeys.device,
            cloud: KiroshiCloud(baseURL: KiroshiCloud.productionURL, transport: http),
            lastSpace: lastSpace, relay: RelayEnvironment(transport: relay, clock: clock)
        ) { exit.yield($0) }
        let following = Task { await store.follow() }

        await relay.nextOpening().close(RelayClosure.membershipEnded)

        var exitIterator = exits.makeAsyncIterator()
        #expect(await exitIterator.next() == .noSpaceLeft)
        #expect(store.spaces.isEmpty)
        following.cancel()
    }

    @Test func aSpaceGoneFromTheRefreshMovesToTheFirstAndRemembersIt() async {
        await http.answer(CloudFixture.spacesPath, with: CloudFixture.threeSpaces)
        let store = makeStore(lastSpace: lastSpace)
        store.select("home-lab")

        await store.refreshSpaces()

        #expect(store.currentSpaceId == CloudFixture.studioId)
        #expect(lastSpace.saved == CloudFixture.studioId)
    }

    @Test func refreshingReadsEveryHostPresence() async {
        await http.answer(CloudFixture.spacesPath, with: CloudFixture.threeSpaces)
        let store = makeStore()

        await store.refreshSpaces()

        #expect(store.spaces.map(\.name) == ["Studio", "Home lab", "Side project"])
        #expect(store.spaces.map(\.isHostOnline) == [true, true, false])
        #expect(store.currentSpace?.name == "Studio")
    }

    @Test func eachSpaceShowsTheColourItsHostGaveIt() async {
        await http.answer(
            CloudFixture.spacesPath,
            with: .status(
                200,
                #"""
                [{"id":"studio","name":"Studio","role":"owner","online":true,"colour":"purple"},{"id":"home-lab","name":"Home lab","role":"member","online":true,"colour":"green"}]
                """#))
        let store = makeStore()
        #expect(store.currentSpace?.colour == nil)

        await store.refreshSpaces()
        #expect(store.currentSpace?.colour == .purple)

        store.select("home-lab")
        #expect(store.currentSpace?.colour == .green)
    }
}
