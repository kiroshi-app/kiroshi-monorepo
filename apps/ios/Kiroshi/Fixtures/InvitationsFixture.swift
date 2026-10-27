#if DEBUG
    import Foundation

    enum InvitationsFixture {
        static let personalId = "9b1e0000-0000-4000-8000-000000000010"
        static let studioId = "9b1e0000-0000-4000-8000-000000000011"
        static let invitationId = "4c1d0000-0000-4000-8000-000000000001"
        static let otherEmailInvitationId = "4c1d0000-0000-4000-8000-000000000002"
        static let colour = UserDefaults.standard.string(forKey: "invitationColour")
        static let invitation = Invitation(
            id: invitationId, instanceId: studioId, instanceName: "Studio",
            inviterEmail: "noa@example.com",
            colour: colour.flatMap { Int($0).flatMap(Hue.init(degrees:)) ?? Hue(named: $0) })
        static let writtenColour = colour.map { CloudFixture.written(colour: $0) } ?? "null"
        static let listPath = "/invitations"
        static let statePath = "/invitations/\(invitationId)/state"
        static let otherEmailStatePath = "/invitations/\(otherEmailInvitationId)/state"
        static let acceptPath = "/invitations/\(invitationId)/accept"
        static let declinePath = "/invitations/\(invitationId)/decline"
        static let leavePath = "/instances/\(studioId)/membership"

        static let personal = ScriptedTransport.Answer.status(
            200,
            #"[{"id":"\#(personalId)","name":"Personal","role":"owner","createdAt":"2026-10-01T09:00:00.000Z","online":true}]"#
        )
        static func joined(colour: String) -> ScriptedTransport.Answer {
            .status(
                200,
                #"[{"id":"\#(personalId)","name":"Personal","role":"owner","createdAt":"2026-10-01T09:00:00.000Z","online":true},{"id":"\#(studioId)","name":"Studio","role":"member","createdAt":"2026-10-02T09:00:00.000Z","online":true,"colour":\#(colour)}]"#
            )
        }
        static let listed = ScriptedTransport.Answer.status(
            200,
            #"[{"id":"\#(invitationId)","instanceId":"\#(studioId)","instanceName":"Studio","inviterEmail":"noa@example.com","colour":\#(writtenColour),"invitedAt":"2026-10-18T12:00:00.000Z"}]"#
        )
        static let valid = ScriptedTransport.Answer.status(
            200,
            #"{"state":"valid","spaceName":"Studio","inviter":"noa@example.com","colour":\#(writtenColour),"expiresAt":"2026-10-25T12:00:00.000Z"}"#
        )
        static let accepted = ScriptedTransport.Answer.status(
            200,
            #"{"instanceId":"\#(studioId)","name":"Studio"}"#
        )

        static func state(_ state: String) -> ScriptedTransport.Answer {
            .status(200, #"{"state":"\#(state)"}"#)
        }

        static func answers(_ fixture: SignInFixture) -> [String: ScriptedTransport.Answer] {
            var answers: [String: ScriptedTransport.Answer] = [
                CloudFixture.spacesPath: personal, listPath: listed, statePath: valid,
                acceptPath: accepted, declinePath: .status(204, ""), leavePath: .status(204, ""),
            ]
            switch fixture {
            case .invitationJoining: answers[acceptPath] = .pending
            case .invitationCouldNotAccept: answers[acceptPath] = .offline
            case .invitationAlreadyJoined:
                answers[acceptPath] = CloudFixture.error(
                    409, code: "ALREADY_JOINED",
                    message: "The membership of the instance is already joined")
            case .invitationNotFound: answers[acceptPath] = .status(404, "")
            case .invitationWithdrawn: answers[statePath] = state("withdrawn")
            case .invitationExpired: answers[statePath] = state("expired")
            case .invitationOtherEmail:
                answers[listPath] = .status(200, "[]")
                answers[otherEmailStatePath] = valid
            default: break
            }
            return answers
        }

        static func afterwards(_ fixture: SignInFixture)
            -> [String: [String: ScriptedTransport.Answer]]
        {
            switch fixture {
            case .invitationJoined, .invitationAlreadyJoined:
                [acceptPath: [CloudFixture.spacesPath: joined(colour: CloudFixture.colour(0))]]
            default: [:]
            }
        }

        @MainActor static func relay(_ fixture: SignInFixture) -> RelayEnvironment {
            RelayEnvironment(
                transport: InvitedSpaceTransport(
                    home: FixtureHostTransport(script: ConversationsFixture.script(fixture)),
                    isHostOnline: fixture != .invitationHostOffline),
                clock: ContinuousRelayClock(), spaceKeys: FixtureSpaceKeys(missing: [studioId]),
                handsKeys: true)
        }

        @MainActor static func play(_ fixture: SignInFixture, on invitations: Invitations) {
            switch fixture {
            case .invitationSheet:
                invitations.openLink(invitationId)
            case .invitationJoining, .invitationHostOffline, .invitationCouldNotAccept,
                .invitationJoined, .invitationAlreadyJoined, .invitationNotFound:
                invitations.open(invitation)
                invitations.accept(invitation)
            case .invitationWithdrawn, .invitationExpired:
                invitations.open(invitation)
            case .invitationOtherEmail:
                invitations.openLink(otherEmailInvitationId)
            default:
                break
            }
        }
    }

    struct InvitedSpaceTransport: RelayTransport {
        let home: any RelayTransport
        let isHostOnline: Bool

        func open(_ request: URLRequest) async throws -> any RelaySocket {
            let spaceId = request.url?.pathComponents.dropLast(2).last ?? ""
            guard isHostOnline || spaceId != InvitationsFixture.studioId else {
                throw RelayClosure(code: RelayClosure.hostOffline)
            }
            return try await home.open(request)
        }
    }
#endif
