import Foundation
import Testing

@testable import Kiroshi

struct CloudInvitationsTests {
    let invitation = InvitationsFixture.invitation

    func cloud(_ answers: [String: ScriptedTransport.Answer]) -> (
        CloudInvitations, ScriptedTransport
    ) {
        let transport = ScriptedTransport(answers)
        return (
            KiroshiCloud(baseURL: KiroshiCloud.productionURL, transport: transport).invitations,
            transport
        )
    }

    @Test func theListCarriesEachInvitationWithItsSpaceAndInviter() async throws {
        let (invitations, transport) = cloud([
            InvitationsFixture.listPath: InvitationsFixture.listed
        ])

        let answer = try await invitations.list(bearer: "bearer-1")

        #expect(answer == .invitations([invitation]))
        let request = try #require(await transport.requests.first)
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer bearer-1")
    }

    @Test func aValidStateNamesTheSpaceTheInviterAndTheExpiry() async throws {
        let (invitations, transport) = cloud([
            InvitationsFixture.statePath: InvitationsFixture.valid
        ])

        let answer = try await invitations.state(of: invitation.id)

        let expiresAt = try Date.ISO8601FormatStyle(includingFractionalSeconds: true)
            .parse("2026-10-25T12:00:00.000Z")
        #expect(
            answer
                == .valid(
                    ValidInvitation(
                        spaceName: "Studio", inviter: "noa@example.com", expiresAt: expiresAt)))
        let request = try #require(await transport.requests.first)
        #expect(request.value(forHTTPHeaderField: "Authorization") == nil)
    }

    @Test(arguments: [
        ("withdrawn", InvitationRefusal.withdrawn), ("expired", .expired), ("used", .used),
    ])
    func aStateThatCanNoLongerBeAcceptedIsARefusal(state: String, refusal: InvitationRefusal)
        async throws
    {
        let (invitations, _) = cloud([
            InvitationsFixture.statePath: InvitationsFixture.state(state)
        ])

        #expect(try await invitations.state(of: invitation.id) == .refused(refusal))
    }

    @Test func acceptingPostsToTheInvitationWithTheBearer() async throws {
        let path = "/invitations/\(invitation.id)/accept"
        let (invitations, transport) = cloud([path: InvitationsFixture.accepted])

        #expect(try await invitations.accept(invitation, bearer: "bearer-1") == .done)

        let request = try #require(await transport.requests.first)
        #expect(invitation.id != invitation.instanceId)
        #expect(request.httpMethod == "POST")
        #expect(request.url?.path() == path)
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer bearer-1")
    }

    @Test func decliningPostsToTheInvitationWithTheBearer() async throws {
        let path = "/invitations/\(invitation.id)/decline"
        let (invitations, transport) = cloud([path: .status(204, "")])

        #expect(try await invitations.decline(invitation, bearer: "bearer-1") == .done)

        let request = try #require(await transport.requests.first)
        #expect(invitation.id != invitation.instanceId)
        #expect(request.httpMethod == "POST")
        #expect(request.url?.path() == path)
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer bearer-1")
    }

    @Test(arguments: [
        (410, "INVITATION_EXPIRED", InvitationRefusal.expired),
        (410, "INVITATION_WITHDRAWN", .withdrawn),
        (410, "INVITATION_USED", .used),
        (403, "INVITATION_EMAIL_MISMATCH", .otherEmail),
        (404, "NOT_FOUND", .unknown),
    ])
    func eachRefusalOfTheAcceptIsNamed(status: Int, code: String, refusal: InvitationRefusal)
        async throws
    {
        let (invitations, _) = cloud([
            InvitationsFixture.acceptPath: CloudFixture.error(status, code: code, message: code)
        ])

        #expect(try await invitations.accept(invitation, bearer: "b") == .refused(refusal))
    }

    @Test func anUnreadableRefusalOrNoAnswerCouldNotAccept() async throws {
        let (refused, _) = cloud([
            InvitationsFixture.acceptPath: CloudFixture.error(
                500, code: "INTERNAL_ERROR", message: "boom")
        ])
        let (offline, _) = cloud([InvitationsFixture.acceptPath: .offline])

        #expect(try await refused.accept(invitation, bearer: "b") == .unreachable)
        #expect(try await offline.accept(invitation, bearer: "b") == .unreachable)
    }

    @Test func decliningAndLeavingAnswerTheRelayRoutes() async throws {
        let (invitations, transport) = cloud(InvitationsFixture.answers(.invitationSheet))

        #expect(try await invitations.decline(invitation, bearer: "b") == .done)
        #expect(try await invitations.leave(invitation, bearer: "b") == .done)

        let requests = await transport.requests
        #expect(requests.map(\.httpMethod) == ["POST", "DELETE"])
        #expect(
            requests.map { $0.url?.path() } == [
                InvitationsFixture.declinePath, InvitationsFixture.leavePath,
            ])
    }

    @Test func theEmailsJoinButtonNamesTheInvitation() throws {
        let id = "4C1D0000-0000-4000-8000-000000000001"
        let link = try #require(URL(string: "https://kiroshi.app/join?invitation=\(id)"))

        #expect(InvitationLink.invitationId(in: link) == id.lowercased())
        for other in [
            "https://kiroshi.app/join", "https://kiroshi.app/join?invitation=abc",
            "https://evil.example/join?invitation=\(id)",
            "https://kiroshi.app/joint?invitation=\(id)",
            "https://kiroshi.app/join?invitation=\(id)&invitation=\(id)",
            "com.googleusercontent.apps.x:/oauth2redirect",
        ] {
            let url = try #require(URL(string: other))
            #expect(InvitationLink.invitationId(in: url) == nil, "\(other)")
        }
    }
}
