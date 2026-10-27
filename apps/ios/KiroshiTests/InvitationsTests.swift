import Foundation
import Observation
import Testing

@testable import Kiroshi

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct InvitationsTests {
    @MainActor final class Outcomes {
        var joined: [Space] = []
        var signedOut = 0
    }

    let invitation = InvitationsFixture.invitation
    let relay = TestRelayTransport()
    let clock = TestRelayClock()
    let outcomes = Outcomes()
    let studio = Space(
        id: InvitationsFixture.studioId, name: "Studio", role: .member, isHostOnline: true)

    func make(
        _ changes: [String: ScriptedTransport.Answer] = [:],
        listedOnceAccepted: ScriptedTransport.Answer? = InvitationsFixture.joined(colour: "null")
    ) -> (Invitations, ScriptedTransport) {
        let transport = ScriptedTransport(
            InvitationsFixture.answers(.invitationSheet).merging(changes) { _, changed in changed
            },
            afterwards: listedOnceAccepted.map {
                [InvitationsFixture.acceptPath: [CloudFixture.spacesPath: $0]]
            } ?? [:])
        let invitations = Invitations(
            bearer: "fixture-bearer", device: FixtureKeys.device,
            cloud: KiroshiCloud(baseURL: KiroshiCloud.productionURL, transport: transport),
            relay: RelayEnvironment(
                transport: relay, clock: clock,
                spaceKeys: FixtureSpaceKeys(missing: [InvitationsFixture.studioId]),
                handsKeys: true),
            joined: { [outcomes] space in outcomes.joined.append(space) },
            signedOut: { [outcomes] in outcomes.signedOut += 1 })
        return (invitations, transport)
    }

    func waitUntil(_ condition: @escaping @MainActor @Sendable () -> Bool) async {
        for await isMet in Observations({ condition() }) where isMet {
            return
        }
    }

    func paths(_ transport: ScriptedTransport) async -> [String] {
        await transport.requests.compactMap { $0.url?.path() }
    }

    @Test func theInvitationsOfTheAccountAreListed() async {
        let (invitations, _) = make()

        await invitations.refresh()

        #expect(invitations.pending == [invitation])
    }

    @Test func acceptingJoinsOnTheHostsKeyAndLandsOnTheSpace() async {
        let (invitations, _) = make()
        await invitations.refresh()
        invitations.open(invitation)

        invitations.accept(invitation)
        #expect(invitations.phase(of: invitation) == .joining)
        await relay.nextOpening().accept(ScriptedRelaySocket(sharedSpaceId: "space-studio"))
        await waitUntil { invitations.opened == nil }

        #expect(
            outcomes.joined == [
                Space(
                    id: InvitationsFixture.studioId, name: "Studio", role: .member,
                    isHostOnline: true)
            ])
        #expect(invitations.pending.isEmpty)
        #expect(invitations.phase(of: invitation) == .open)
    }

    @Test(arguments: [(#""purple""#, Hue.purple), ("200", Hue(degrees: 200)), ("null", nil)])
    func theJoinedSpaceWearsItsHostsColourAsTheCloudListsIt(written: String, colour: Hue?) async {
        let (invitations, _) = make(
            listedOnceAccepted: InvitationsFixture.joined(colour: written))

        invitations.accept(invitation)
        await relay.nextOpening().accept(ScriptedRelaySocket(sharedSpaceId: "space-studio"))
        await waitUntil { invitations.phase(of: invitation) == .open }

        var coloured = studio
        coloured.colour = colour
        #expect(outcomes.joined == [coloured])
    }

    @Test func aSpaceTheCloudDoesNotListYetIsReadAgain() async {
        let (invitations, transport) = make(listedOnceAccepted: nil)

        invitations.accept(invitation)
        await relay.nextOpening().accept(ScriptedRelaySocket(sharedSpaceId: "space-studio"))
        let retry = await clock.nextSleep(of: Invitations.listingRetry)
        #expect(outcomes.joined.isEmpty)
        await transport.answer(
            CloudFixture.spacesPath, with: InvitationsFixture.joined(colour: #""green""#))
        retry?.wake.yield()
        await waitUntil { invitations.phase(of: invitation) == .open }

        var coloured = studio
        coloured.colour = .green
        #expect(outcomes.joined == [coloured])
    }

    @Test func aSpaceTheCloudNeverListsIsJoinedWithoutItsColour() async {
        let (invitations, transport) = make(listedOnceAccepted: nil)

        invitations.accept(invitation)
        await relay.nextOpening().accept(ScriptedRelaySocket(sharedSpaceId: "space-studio"))
        await clock.wakeNextSleep(of: Invitations.listingRetry)
        await clock.wakeNextSleep(of: Invitations.listingRetry)
        await waitUntil { invitations.phase(of: invitation) == .open }

        #expect(outcomes.joined == [studio])
        #expect(
            await paths(transport).filter { $0 == CloudFixture.spacesPath }.count
                == Invitations.listingReads)
    }

    @Test func anAlreadyJoinedAcceptJoinsTheListedSpaceLikeAnAcceptedOne() async {
        let (invitations, _) = make([
            InvitationsFixture.acceptPath: CloudFixture.error(
                409, code: "ALREADY_JOINED", message: "already joined")
        ])
        await invitations.refresh()
        invitations.open(invitation)

        invitations.accept(invitation)
        await relay.nextOpening().accept(ScriptedRelaySocket(sharedSpaceId: "space-studio"))
        await waitUntil { invitations.opened == nil }

        #expect(
            outcomes.joined == [
                Space(
                    id: InvitationsFixture.studioId, name: "Studio", role: .member,
                    isHostOnline: true)
            ])
        #expect(invitations.pending.isEmpty)
        #expect(invitations.phase(of: invitation) == .open)
    }

    @Test func aSpaceTheCloudNeverListsKeepsTheInvitedSpacesColour() async {
        let (invitations, _) = make(listedOnceAccepted: nil)
        let pink = Invitation(
            id: invitation.id, instanceId: invitation.instanceId, instanceName: "Studio",
            inviterEmail: "noa@example.com", colour: .pink)
        invitations.open(pink)

        invitations.accept(pink)
        await relay.nextOpening().accept(ScriptedRelaySocket(sharedSpaceId: "space-studio"))
        await clock.wakeNextSleep(of: Invitations.listingRetry)
        await clock.wakeNextSleep(of: Invitations.listingRetry)
        await waitUntil { invitations.opened == nil }

        #expect(outcomes.joined.map(\.colour) == [.pink])
    }

    @Test func aBareNotFoundAcceptSaysThereIsNoSuchInvitation() async {
        let (invitations, _) = make([InvitationsFixture.acceptPath: .status(404, "")])

        invitations.accept(invitation)
        await waitUntil { invitations.phase(of: invitation) == .refused(.unknown) }

        #expect(invitations.joins.isEmpty)
        #expect(outcomes.joined.isEmpty)
    }

    @Test func oneJoinRunsAtATimeForAnInvitation() async {
        let (invitations, transport) = make([
            InvitationsFixture.acceptPath: CloudFixture.error(
                410, code: "INVITATION_WITHDRAWN", message: "withdrawn")
        ])

        invitations.accept(invitation)
        invitations.accept(invitation)
        await waitUntil { invitations.phase(of: invitation) == .refused(.withdrawn) }

        #expect(await paths(transport) == [InvitationsFixture.acceptPath])
        #expect(invitations.joins.isEmpty)
    }

    @Test func anUnansweredAcceptCanBeTriedAgain() async {
        let (invitations, transport) = make([InvitationsFixture.acceptPath: .offline])

        invitations.accept(invitation)
        await waitUntil { invitations.phase(of: invitation) == .couldNotAccept }
        #expect(invitations.joins.isEmpty)
        await transport.answer(InvitationsFixture.acceptPath, with: InvitationsFixture.accepted)
        invitations.accept(invitation)
        await relay.nextOpening().accept(ScriptedRelaySocket(sharedSpaceId: "space-studio"))
        await waitUntil { invitations.phase(of: invitation) == .open }

        #expect(outcomes.joined.map(\.id) == [InvitationsFixture.studioId])

        #expect(
            await paths(transport) == [
                InvitationsFixture.acceptPath, InvitationsFixture.acceptPath,
                CloudFixture.spacesPath,
            ])
    }

    @Test func anOfflineHostLeavesTheJoinWaitingForIt() async {
        let (invitations, _) = make()

        invitations.accept(invitation)
        await relay.nextOpening().close(RelayClosure.hostOffline)

        await waitUntil { invitations.phase(of: invitation) == .waitingForHost }
        #expect(outcomes.joined.isEmpty)
        invitations.stop()
    }

    @Test func decliningRemovesTheInvitationAndClosesTheSheet() async {
        let (invitations, transport) = make()
        await invitations.refresh()
        invitations.open(invitation)

        invitations.decline(invitation)
        await waitUntil { invitations.opened == nil && !invitations.isDeclining }

        #expect(invitations.pending.isEmpty)
        #expect(await paths(transport).last == InvitationsFixture.declinePath)
    }

    @Test func decliningWhileWaitingForTheHostLeavesTheSpace() async {
        let (invitations, transport) = make()
        invitations.open(invitation)
        invitations.accept(invitation)
        await relay.nextOpening().close(RelayClosure.hostOffline)
        await waitUntil { invitations.phase(of: invitation) == .waitingForHost }

        invitations.decline(invitation)
        await waitUntil { invitations.opened == nil }

        #expect(await paths(transport).last == InvitationsFixture.leavePath)
    }

    @Test func aFailedDeclineSaysSoAndKeepsTheInvitation() async {
        let (invitations, _) = make([InvitationsFixture.declinePath: .offline])
        await invitations.refresh()
        invitations.open(invitation)

        invitations.decline(invitation)
        await waitUntil { invitations.hasFailedToDecline }

        #expect(invitations.opened == invitation)
        #expect(invitations.pending == [invitation])
    }

    @Test func theJoinLinkOpensTheListedInvitation() async {
        let (invitations, _) = make()

        invitations.openLink(InvitationsFixture.invitationId)

        await waitUntil { invitations.opened != nil }
        #expect(invitations.opened == invitation)
        #expect(invitations.phase(of: invitation) == .open)
    }

    @Test func aJoinLinkSentToAnotherEmailSaysSo() async {
        let (invitations, _) = make([
            InvitationsFixture.listPath: .status(200, "[]"),
            InvitationsFixture.otherEmailStatePath: InvitationsFixture.valid,
        ])

        invitations.openLink(InvitationsFixture.otherEmailInvitationId)

        await waitUntil { invitations.opened != nil }
        let opened = try? #require(invitations.opened)
        #expect(opened?.instanceName == "Studio")
        #expect(opened.map(invitations.phase(of:)) == .refused(.otherEmail))
    }

    @Test func aJoinLinkSentToAnotherEmailShowsTheInvitedSpacesColour() async {
        let (invitations, _) = make([
            InvitationsFixture.listPath: .status(200, "[]"),
            InvitationsFixture.otherEmailStatePath: .status(
                200,
                #"{"state":"valid","spaceName":"Studio","inviter":"noa@example.com","colour":"pink","expiresAt":"2026-10-25T12:00:00.000Z"}"#
            ),
        ])

        invitations.openLink(InvitationsFixture.otherEmailInvitationId)

        await waitUntil { invitations.opened != nil }
        #expect(invitations.opened?.colour == .pink)
    }

    @Test(arguments: ["withdrawn", "expired"])
    func anInvitationThatCanNoLongerBeAcceptedShowsWhy(state: String) async {
        let (invitations, _) = make([
            InvitationsFixture.statePath: InvitationsFixture.state(state)
        ])

        await invitations.readState(of: invitation)

        #expect(
            invitations.phase(of: invitation)
                == .refused(state == "withdrawn" ? .withdrawn : .expired))
    }

    @Test func aRefusedSessionSignsOut() async {
        let (invitations, _) = make([
            InvitationsFixture.listPath: CloudFixture.refused("Unauthenticated")
        ])

        await invitations.refresh()

        #expect(outcomes.signedOut == 1)
    }
}
