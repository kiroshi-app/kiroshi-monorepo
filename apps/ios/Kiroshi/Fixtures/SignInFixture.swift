#if DEBUG
    import Foundation

    enum CloudFixture {
        static let email = "sam@example.com"
        static let userId = "7d3f1c2a-0000-4000-8000-000000000001"
        static let session = Session(bearer: "fixture-bearer", email: email, userId: userId)
        static let codeRequestPath = "/api/auth/email-otp/send-verification-otp"
        static let signInPath = "/api/auth/sign-in/email-otp"
        static let spacesPath = "/instances"
        static let providerSignInPath = "/api/auth/sign-in/social"

        static let codeSent = ScriptedTransport.Answer.status(
            200, #"{"status":true,"expiresAt":"2026-10-10T12:05:00.000Z"}"#)
        static let signedIn = ScriptedTransport.Answer.status(
            200,
            #"""
            {"token":"fixture-bearer","user":{"id":"\#(userId)","email":"sam@example.com","createdAt":"2026-10-10T12:00:00.000Z"},"session":{"expiresAt":"2026-10-17T12:00:00.000Z","deviceName":"iPhone","platform":"ios"}}
            """#)
        static let noSpaces = ScriptedTransport.Answer.status(200, "[]")
        static let twoSpaces = ScriptedTransport.Answer.status(
            200,
            #"""
            [{"id":"9b1e0000-0000-4000-8000-000000000001","name":"Studio","role":"owner","createdAt":"2026-10-01T09:00:00.000Z","online":true},{"id":"9b1e0000-0000-4000-8000-000000000002","name":"Bench","role":"member","createdAt":"2026-10-02T09:00:00.000Z","online":false}]
            """#)
        static let studioId = "9b1e0000-0000-4000-8000-000000000001"
        static let homeLabId = "9b1e0000-0000-4000-8000-000000000003"
        static let sideProjectId = "9b1e0000-0000-4000-8000-000000000004"
        static let artboardSpaces = [
            Space(id: studioId, name: "Studio", role: .owner, isHostOnline: true),
            Space(id: homeLabId, name: "Home lab", role: .member, isHostOnline: true),
            Space(id: sideProjectId, name: "Side project", role: .owner, isHostOnline: false),
        ]
        static let threeSpaces = ScriptedTransport.Answer.status(
            200,
            #"""
            [{"id":"\#(studioId)","name":"Studio","role":"owner","createdAt":"2026-10-01T09:00:00.000Z","online":true},{"id":"\#(homeLabId)","name":"Home lab","role":"member","createdAt":"2026-10-03T09:00:00.000Z","online":true},{"id":"\#(sideProjectId)","name":"Side project","role":"owner","createdAt":"2026-10-04T09:00:00.000Z","online":false}]
            """#)
        static let signOutPath = "/api/auth/sign-out"
        static let signedOut = ScriptedTransport.Answer.status(200, #"{"status":true}"#)
        static let accountPath = "/me"
        static let accountDeleted = ScriptedTransport.Answer.status(204, "")
        static let account = ScriptedTransport.Answer.status(
            200, #"{"id":"\#(userId)","email":"\#(email)","createdAt":"2026-10-10T12:00:00.000Z"}"#)
        static let accountNotDeleted = error(
            500, code: "INTERNAL_SERVER_ERROR", message: "Internal server error")
        static let relay = RelayEnvironment(
            transport: FixtureRelayTransport(onlineSpaceIds: [studioId, homeLabId]),
            clock: ContinuousRelayClock())

        static func agreements() -> InMemoryAgreementStore {
            InMemoryAgreementStore([userId])
        }

        static func error(_ status: Int, code: String, message: String) -> ScriptedTransport.Answer
        {
            .status(
                status,
                #"{"error":{"code":"\#(code)","message":"\#(message)","status":\#(status)}}"#)
        }

        static func refused(_ message: String) -> ScriptedTransport.Answer {
            error(401, code: "UNAUTHENTICATED", message: message)
        }
    }

    enum SignInFixture: String, CaseIterable {
        case opening = "1.1"
        case appleSigningIn = "1.1b"
        case googleSigningIn = "1.1c"
        case appleRefused = "1.1d"
        case email = "1.2"
        case code = "1.3"
        case signingIn = "1.4"
        case loadingSpaces = "1.5"
        case couldNotSendCode = "1.6"
        case wrongCode = "1.7"
        case tooManyWrongCodes = "1.7b"
        case expiredCode = "1.8"
        case tooManyCodes = "1.9"
        case noSpace = "1.10"
        case spaces
        case spacesUnreachable = "spaces-unreachable"
        case deviceNotAdded = "device-not-added"
        case deviceMoved = "device-moved"
        case joinSpace = "join-space"
        case agreement
        case keychain
        case seededKeychain = "keychain-seeded"
        case home = "2.1"
        case homeMenu = "2.2"
        case noCompanion = "2.3"
        case loadingCompanions = "2.4"
        case conversationsHostOffline = "2.5"
        case workingList = "2.6"
        case conversations
        case conversationsLive = "conversations-live"
        case conversationIcons = "conversation-icons"
        case pinned
        case pinnedIcons = "pinned-icons"
        case pinRefused = "pin-refused"
        case thread = "3.1"
        case emptyThread = "3.2"
        case workingThread = "3.3"
        case workingAfterReply = "working-after-reply"
        case threadHostOffline = "3.4"
        case swipedThread = "3.5"
        case conversationsFailed = "conversations-failed"
        case conversationsRecovering = "conversations-recovering"
        case threadFailed = "thread-failed"
        case groupThread = "group-thread"
        case sharedThread = "shared-thread"
        case sharedList = "shared-list"
        case groupWorking = "group-working"
        case groupFailed = "group-failed"
        case groupMention = "group-mention"
        case slowThread = "slow-thread"
        case longReply = "long-reply"
        case slowGroup = "slow-group"
        case longName = "long-name"
        case longGroup = "long-group"
        case twoAsks = "two-asks"
        case questionsList = "questions-2.1"
        case questionSingle = "questions-4.1"
        case questionMulti = "questions-4.3"
        case questionSeveral = "questions-4.5"
        case questionElsewhere = "questions-4.7"
        case missionsButton = "missions-button"
        case conversationMissions = "conversation-missions"
        case conversationNoMissions = "conversation-no-missions"
        case missions = "5.1"
        case missionThread = "5.2"
        case missionWorking = "mission-working"
        case slowMission = "slow-mission"
        case noMissions = "5.3"
        case missionsHostOffline = "5.4"
        case settings = "6.1"
        case signOutAlert = "6.2"
        case deleteAccount = "delete-account"
        case deleteAccountFailed = "delete-account-failed"
        case deletingAccount = "deleting-account"
        case approvalWaiting = "approval-6"
        case approvalApproved = "approval-6.2"
        case approvalRefused = "approval-6.3"
        case approvalExpired = "approval-6.4"
        case approvalCode = "approval-6.5"
        case deviceRequest = "device-request"
        case invitationBadge = "4"
        case invitationMenu = "4.1"
        case invitationSheet = "4.2"
        case invitationJoining = "4.3"
        case invitationHostOffline = "4.4"
        case invitationCouldNotAccept = "4.5"
        case invitationWithdrawn = "4.6"
        case invitationJoined = "4.7"
        case invitationExpired = "invitation-expired"
        case invitationOtherEmail = "invitation-other-email"
        case invitationAlreadyJoined = "invitation-already-joined"
        case invitationNotFound = "invitation-not-found"

        @MainActor static var opened: SignInFixture?

        static var launchArgument: SignInFixture? {
            UserDefaults.standard.string(forKey: "fixture").flatMap(SignInFixture.init(rawValue:))
        }

        static var requestLog: URL? {
            UserDefaults.standard.string(forKey: "requestLog").map { URL(filePath: $0) }
        }

        fileprivate var answers: [String: ScriptedTransport.Answer] {
            switch self {
            case .signingIn: [CloudFixture.signInPath: .pending]
            case .appleSigningIn, .googleSigningIn: [CloudFixture.providerSignInPath: .pending]
            case .appleRefused:
                [
                    CloudFixture.providerSignInPath: CloudFixture.refused(
                        "ID token is invalid, expired, minted for another client or for another nonce"
                    )
                ]
            case .loadingSpaces: [CloudFixture.spacesPath: .pending]
            case .couldNotSendCode: [CloudFixture.codeRequestPath: .offline]
            case .wrongCode: [CloudFixture.signInPath: CloudFixture.refused("Code is wrong")]
            case .tooManyWrongCodes:
                [
                    CloudFixture.signInPath: CloudFixture.refused(
                        "Too many wrong codes, ask for a new one")
                ]
            case .expiredCode: [CloudFixture.signInPath: CloudFixture.refused("Code has expired")]
            case .tooManyCodes:
                [
                    CloudFixture.codeRequestPath: CloudFixture.error(
                        429, code: "TOO_MANY_REQUESTS", message: "Too many requests")
                ]
            case .noSpace: [CloudFixture.spacesPath: CloudFixture.noSpaces]
            case .spaces: [CloudFixture.spacesPath: CloudFixture.twoSpaces]
            case .spacesUnreachable: [CloudFixture.spacesPath: .offline]
            case .deviceNotAdded:
                [
                    CloudFixture.spacesPath: CloudFixture.threeSpaces,
                    FixtureKeys.devicesPath: CloudFixture.error(
                        403, code: "DEVICE_PROOF_INVALID",
                        message: "The signature does not prove the ed25519 key"),
                ]
            case .deviceMoved:
                [
                    CloudFixture.spacesPath: CloudFixture.threeSpaces,
                    CloudFixture.signOutPath: CloudFixture.signedOut,
                ]
            case .joinSpace: [CloudFixture.spacesPath: CloudFixture.threeSpaces]
            case .keychain, .seededKeychain, .settings, .signOutAlert, .deleteAccount:
                [
                    CloudFixture.spacesPath: CloudFixture.threeSpaces,
                    CloudFixture.signOutPath: CloudFixture.signedOut,
                    CloudFixture.accountPath: CloudFixture.accountDeleted,
                ]
            case .deleteAccountFailed:
                [
                    CloudFixture.spacesPath: CloudFixture.threeSpaces,
                    CloudFixture.signOutPath: CloudFixture.signedOut,
                    CloudFixture.accountPath: CloudFixture.accountNotDeleted,
                ]
            case .deletingAccount:
                [
                    CloudFixture.spacesPath: CloudFixture.threeSpaces,
                    CloudFixture.accountPath: .pending,
                ]
            case .missions, .missionThread, .missionWorking, .slowMission, .noMissions,
                .missionsHostOffline:
                [CloudFixture.spacesPath: CloudFixture.threeSpaces]
            case .home, .homeMenu, .conversations, .conversationsLive, .conversationIcons, .thread,
                .threadHostOffline,
                .swipedThread, .noCompanion,
                .loadingCompanions, .emptyThread,
                .conversationsHostOffline, .workingList, .workingThread, .workingAfterReply,
                .conversationsFailed, .conversationsRecovering,
                .threadFailed, .groupThread, .sharedThread, .sharedList, .groupWorking,
                .groupFailed,
                .groupMention,
                .slowThread, .longReply, .slowGroup, .longName, .longGroup, .twoAsks,
                .questionsList, .questionSingle, .questionMulti, .questionSeveral,
                .questionElsewhere,
                .missionsButton,
                .conversationMissions, .conversationNoMissions, .pinned, .pinnedIcons, .pinRefused,
                .agreement:
                [CloudFixture.spacesPath: CloudFixture.threeSpaces]
            case .opening, .email, .code: [:]
            case .invitationBadge, .invitationMenu, .invitationSheet, .invitationJoining,
                .invitationHostOffline, .invitationCouldNotAccept, .invitationWithdrawn,
                .invitationJoined, .invitationExpired, .invitationOtherEmail,
                .invitationAlreadyJoined, .invitationNotFound:
                InvitationsFixture.answers(self)
            case .approvalWaiting, .approvalRefused, .approvalExpired, .approvalCode,
                .approvalApproved:
                [
                    CloudFixture.spacesPath: self == .approvalApproved
                        ? .pending : CloudFixture.threeSpaces,
                    CloudFixture.signOutPath: CloudFixture.signedOut,
                    FixtureKeys.devicesPath: FixtureKeys.registeredPending,
                    FixtureKeys.approvalCodePath: .status(204, ""),
                    FixtureKeys.approvalCodeVerifyPath: CloudFixture.error(
                        400, code: "DEVICE_CODE_INVALID",
                        message: "The code is wrong, used, superseded or expired"),
                ]
            case .deviceRequest:
                [
                    CloudFixture.spacesPath: CloudFixture.threeSpaces,
                    "/devices/\(FixtureDeviceStates.approvingDevice.id)/approve": .status(204, ""),
                    "/devices/\(FixtureDeviceStates.approvingDevice.id)/reject": .status(204, ""),
                ]
            }
        }

        fileprivate var deviceStates: FixtureDeviceStates {
            switch self {
            case .approvalWaiting, .approvalCode: return FixtureDeviceStates(own: [.pending])
            case .approvalApproved: return FixtureDeviceStates(own: [.approved])
            case .approvalRefused: return FixtureDeviceStates(own: [.refused])
            case .approvalExpired: return FixtureDeviceStates(own: [.expired])
            case .deviceRequest:
                return FixtureDeviceStates(devices: .devices([FixtureDeviceStates.approvingDevice]))
            default: return FixtureDeviceStates()
            }
        }

        fileprivate var isSignedIn: Bool {
            switch self {
            case .loadingSpaces, .noSpace, .spaces, .spacesUnreachable, .deviceNotAdded,
                .deviceMoved, .joinSpace,
                .agreement, .missions,
                .missionThread,
                .missionWorking,
                .slowMission, .noMissions, .missionsHostOffline, .settings, .signOutAlert,
                .deleteAccount, .deleteAccountFailed, .deletingAccount, .approvalWaiting,
                .approvalRefused, .approvalExpired, .approvalCode,
                .approvalApproved, .deviceRequest, .invitationBadge, .invitationMenu,
                .invitationSheet, .invitationJoining,
                .invitationHostOffline, .invitationCouldNotAccept, .invitationWithdrawn,
                .invitationJoined, .invitationExpired, .invitationOtherEmail,
                .invitationAlreadyJoined, .invitationNotFound:
                true
            case .home, .homeMenu, .conversations, .conversationsLive, .conversationIcons, .thread,
                .threadHostOffline,
                .swipedThread, .noCompanion,
                .loadingCompanions, .emptyThread,
                .conversationsHostOffline, .workingList, .workingThread, .workingAfterReply,
                .conversationsFailed, .conversationsRecovering,
                .threadFailed, .groupThread, .sharedThread, .sharedList, .groupWorking,
                .groupFailed,
                .groupMention,
                .slowThread, .longReply, .slowGroup, .longName, .longGroup, .twoAsks,
                .questionsList, .questionSingle, .questionMulti, .questionSeveral,
                .questionElsewhere,
                .missionsButton,
                .conversationMissions, .conversationNoMissions, .pinned, .pinnedIcons, .pinRefused:
                true
            default: false
            }
        }

        fileprivate var sessions: any SessionStore {
            switch self {
            case .keychain:
                return KeychainSessionStore()
            case .seededKeychain:
                let keychain = KeychainSessionStore()
                try? keychain.save(CloudFixture.session)
                return keychain
            case .approvalWaiting, .approvalRefused, .approvalExpired, .approvalCode,
                .approvalApproved:
                var session = CloudFixture.session
                session.deviceName = "Sam’s iPhone"
                return InMemorySessionStore(session)
            default:
                return InMemorySessionStore(isSignedIn ? CloudFixture.session : nil)
            }
        }

        fileprivate var agreements: any AgreementStore {
            switch self {
            case .keychain, .seededKeychain: UserDefaultsAgreementStore()
            case .agreement: InMemoryAgreementStore()
            default: CloudFixture.agreements()
            }
        }

        fileprivate var lastSpaceId: Space.ID? {
            switch self {
            case .conversationsHostOffline, .missionsHostOffline, .threadHostOffline:
                CloudFixture.sideProjectId
            case .sharedThread, .sharedList: CloudFixture.homeLabId
            default: nil
            }
        }

        var opensSettings: Bool {
            [.settings, .signOutAlert, .deleteAccount, .deleteAccountFailed, .deletingAccount]
                .contains(self)
        }

        var isInvitation: Bool {
            rawValue.hasPrefix("4") || rawValue.hasPrefix("invitation-")
        }

        var isOnHome: Bool {
            rawValue.hasPrefix("2.") || isInvitation
                || [
                    .deviceRequest, .missionsButton, .conversationMissions, .conversationNoMissions,
                    .pinned, .questionsList,
                    .pinnedIcons, .pinRefused,
                ].contains(self)
        }

        var opensConversationMissions: Bool {
            [.conversationMissions, .conversationNoMissions].contains(self)
        }

        var opensOnMissions: Bool {
            [
                .missions, .missionThread, .missionWorking, .slowMission, .noMissions,
                .missionsHostOffline,
            ].contains(self)
        }

        @MainActor fileprivate var relay: RelayEnvironment {
            let online: Set<Space.ID> = [CloudFixture.studioId, CloudFixture.homeLabId]
            switch self {
            case .home, .homeMenu, .conversations, .conversationsLive, .conversationIcons, .thread,
                .threadHostOffline,
                .swipedThread, .noCompanion,
                .loadingCompanions, .emptyThread,
                .conversationsHostOffline, .workingList, .workingThread, .workingAfterReply,
                .conversationsFailed, .conversationsRecovering,
                .threadFailed, .groupThread, .sharedThread, .sharedList, .groupWorking,
                .groupFailed,
                .groupMention,
                .slowThread, .longReply, .slowGroup, .longName, .longGroup, .twoAsks,
                .questionsList, .questionSingle, .questionMulti, .questionSeveral,
                .questionElsewhere,
                .missionsButton,
                .conversationMissions, .conversationNoMissions, .pinned, .pinnedIcons, .pinRefused,
                .agreement, .deviceRequest:
                return ConversationsFixture.relay(ConversationsFixture.script(self))
            case .missions, .missionThread:
                return RelayEnvironment(
                    transport: FixtureRelayTransport(
                        onlineSpaceIds: online, answers: MissionsFixture.answers,
                        answersAfter: MissionsFixture.laterPagesAnswerAfter,
                        plays: MissionsFixture.answeringTurn),
                    clock: ContinuousRelayClock())
            case .missionWorking:
                return RelayEnvironment(
                    transport: FixtureRelayTransport(
                        onlineSpaceIds: online, answers: MissionsFixture.answers,
                        plays: MissionsFixture.atWork.merging(MissionsFixture.answeringTurn) {
                            atWork, _ in atWork
                        }),
                    clock: ContinuousRelayClock())
            case .slowMission:
                return RelayEnvironment(
                    transport: FixtureRelayTransport(
                        onlineSpaceIds: online, answers: MissionsFixture.answers,
                        answersAfter: ["conversation_message_page": .seconds(2)]),
                    clock: ContinuousRelayClock())
            case .noMissions:
                return RelayEnvironment(
                    transport: FixtureRelayTransport(
                        onlineSpaceIds: online, answers: MissionsFixture.emptyAnswers),
                    clock: ContinuousRelayClock())
            case .missionsHostOffline:
                return RelayEnvironment(
                    transport: FixtureRelayTransport(
                        onlineSpaceIds: online, onlineOnceSpaceIds: [CloudFixture.sideProjectId],
                        answers: MissionsFixture.answers),
                    clock: ContinuousRelayClock())
            case .deviceMoved:
                return RelayEnvironment(
                    transport: DeviceMovedRelayTransport(), clock: ContinuousRelayClock())
            case .invitationBadge, .invitationMenu, .invitationSheet, .invitationJoining,
                .invitationHostOffline, .invitationCouldNotAccept, .invitationWithdrawn,
                .invitationJoined, .invitationExpired, .invitationOtherEmail,
                .invitationAlreadyJoined, .invitationNotFound:
                return InvitationsFixture.relay(self)
            case .joinSpace:
                return RelayEnvironment(
                    transport: FixtureRelayTransport(onlineSpaceIds: online),
                    clock: ContinuousRelayClock(),
                    spaceKeys: FixtureSpaceKeys(missing: [CloudFixture.studioId]))
            default:
                return CloudFixture.relay
            }
        }

        fileprivate var typedCode: String {
            switch self {
            case .code, .tooManyCodes: "482"
            case .signingIn, .expiredCode: "482913"
            case .wrongCode: "482918"
            case .tooManyWrongCodes: "482931"
            default: ""
            }
        }
    }

    struct DeviceMovedRelayTransport: RelayTransport {
        func open(_ request: URLRequest) async throws -> any RelaySocket {
            throw RelayClosure(code: RelayClosure.deviceRevoked)
        }
    }

    struct FixtureGoogleAuthorizer: GoogleAuthorizing {
        @MainActor func authorize() async -> ProviderOutcome {
            .authorized(idToken: "fixture-google-id-token", name: nil)
        }
    }

    extension SignInModel {
        static func fixture(_ fixture: SignInFixture) -> SignInModel {
            SignInFixture.opened = fixture
            let model = SignInModel(
                cloud: KiroshiCloud(
                    baseURL: KiroshiCloud.productionURL,
                    transport: ScriptedTransport(fixture.answers, log: SignInFixture.requestLog)),
                sessions: fixture.sessions,
                lastSpace: InMemoryLastSpaceStore(fixture.lastSpaceId),
                agreements: fixture.agreements,
                relay: fixture.relay,
                google: FixtureGoogleAuthorizer(),
                deviceStates: fixture.deviceStates)
            ConversationsFixture.opening = ConversationsFixture.opening(fixture)
            ConversationsFixture.opensMissions = fixture.opensConversationMissions
            if ![.opening, .keychain, .seededKeychain].contains(fixture) {
                model.email = CloudFixture.email
            }
            model.code = fixture.typedCode
            switch fixture {
            case .couldNotSendCode:
                model.continueWithEmail()
            case .appleSigningIn, .appleRefused:
                _ = model.appleRequestNonce()
                model.appleCompleted(.authorized(idToken: "fixture-apple-id-token", name: nil))
            case .googleSigningIn:
                model.continueWithGoogle()
            case .code:
                model.path = [.code]
            case .signingIn, .wrongCode, .tooManyWrongCodes, .expiredCode:
                model.path = [.code]
                model.codeChanged()
            case .tooManyCodes:
                model.path = [.code]
                model.sendNewCodeTapped()
            case .signOutAlert:
                model.signOutTapped()
            case .deleteAccount:
                model.deleteAccountTapped()
            case .deleteAccountFailed, .deletingAccount:
                model.deleteAccount()
            case .opening, .email, .loadingSpaces, .noSpace, .spaces, .spacesUnreachable,
                .deviceNotAdded, .deviceMoved, .joinSpace,
                .agreement, .keychain,
                .seededKeychain, .home, .homeMenu, .conversations,
                .conversationsLive, .conversationIcons, .thread, .threadHostOffline, .swipedThread,
                .noCompanion, .loadingCompanions, .emptyThread, .conversationsHostOffline,
                .workingList, .workingThread, .workingAfterReply, .conversationsFailed,
                .conversationsRecovering,
                .threadFailed, .groupThread, .sharedThread, .sharedList,
                .groupWorking,
                .groupFailed, .groupMention, .slowThread, .longReply, .slowGroup, .longName,
                .longGroup,
                .twoAsks, .questionsList, .questionSingle, .questionMulti, .questionSeveral,
                .questionElsewhere, .missionsButton, .conversationMissions, .conversationNoMissions,
                .pinned,
                .pinnedIcons, .pinRefused,
                .missions,
                .missionThread, .missionWorking, .slowMission, .noMissions, .missionsHostOffline,
                .settings, .approvalWaiting, .approvalRefused, .approvalExpired, .approvalCode,
                .approvalApproved, .deviceRequest, .invitationBadge, .invitationMenu,
                .invitationSheet, .invitationJoining,
                .invitationHostOffline, .invitationCouldNotAccept, .invitationWithdrawn,
                .invitationJoined, .invitationExpired, .invitationOtherEmail,
                .invitationAlreadyJoined, .invitationNotFound:
                break
            }
            return model
        }
    }
#endif
