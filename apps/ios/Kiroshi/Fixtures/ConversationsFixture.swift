#if DEBUG
    import Foundation
    import Synchronization
    import UIKit

    @MainActor
    enum ConversationsFixture {
        static var opening: Companion.ID?
        static var opensMissions = false

        static var showsTimes: Bool {
            SignInFixture.opened == .swipedThread
        }

        static var holdsTimes: Bool {
            UserDefaults.standard.bool(forKey: "holdsTimes")
        }

        static var hasHistory: Bool {
            UserDefaults.standard.bool(forKey: "history")
        }

        static var isPaged: Bool {
            UserDefaults.standard.bool(forKey: "paged")
        }

        nonisolated static var laterPageDelay: Duration {
            let seconds = UserDefaults.standard.double(forKey: "pageDelay")
            return .milliseconds(Int((seconds > 0 ? seconds : 1) * 1000))
        }

        static let topics: [FixtureHost.Group] = (1...7).map { index in
            FixtureHost.Group(
                id: "group-topic-\(index)", title: "Topic \(index)", members: [mira, pico],
                createdAt: 0)
        }

        static let topicMessages: [String: [FixtureHost.Message]] = Dictionary(
            uniqueKeysWithValues: topics.enumerated().map { index, topic in
                (
                    topic.id,
                    [
                        .init(
                            id: "m-\(topic.id)", isYours: false,
                            content: "Notes for \(topic.title.lowercased()) are in.",
                            daysAgo: 10 + index, hour: 11, minute: 0, author: mira.id)
                    ]
                )
            })

        static let earlierNotes: [FixtureHost.Message] = (1...10).map { index in
            FixtureHost.Message(
                id: "earlier-\(index)", isYours: index.isMultiple(of: 2),
                content: "Earlier note \(index).", daysAgo: 2, hour: 6 + index / 20,
                minute: (index % 20) * 3)
        }

        static var draft: String {
            UserDefaults.standard.string(forKey: "draft")
                ?? (SignInFixture.opened == .groupMention ? "@" : "")
        }

        static let juniper = Companion(
            id: "juniper-6", name: "Juniper", role: "Writer", tint: .green)
        static let atlas = Companion(id: "atlas-3", name: "Atlas", role: "Planner", tint: .blue)
        static let pico = Companion(id: "pico-6", name: "Pico", role: "Builder", tint: .orange)
        static let mira = Companion(id: "mira-9", name: "Mira", role: "Designer", tint: .purple)
        static let otto = Companion(id: "otto-5", name: "Otto", role: "Digest")
        static let shoto = Companion(
            id: "shoto-1", name: "Shoto", tint: .pink, picturePath: "/avatars/shoto.png")
        static let companions = [juniper, atlas, pico, shoto, mira, otto]
        static let longNamed = Companion(
            id: juniper.id, name: "Juniper Wilhelmina Fitzgerald-Montgomery",
            role: "Release notes and changelog archivist", tint: .green)

        static let listMessages: [Companion.ID: [FixtureHost.Message]] = [
            "juniper-6": [
                .init(
                    id: "m-juniper", isYours: false,
                    content: "The release notes are drafted, they’re waiting for your read.",
                    daysAgo: 0, hour: 9, minute: 12)
            ],
            "atlas-3": [
                .init(
                    id: "m-atlas", isYours: true,
                    content: "Can you split the onboarding ticket in two?", daysAgo: 0, hour: 8,
                    minute: 47)
            ],
            "pico-6": [
                .init(
                    id: "m-pico", isYours: false,
                    content: "All checks passed, the pull request is ready to merge.", daysAgo: 1,
                    hour: 18, minute: 20)
            ],
            "shoto-1": [
                .init(
                    id: "m-shoto", isYours: false,
                    content: "The build is green on every simulator.", daysAgo: 2, hour: 16,
                    minute: 40)
            ],
            "mira-9": [
                .init(
                    id: "m-mira", isYours: false,
                    content: "Here are three directions for the settings sheet.", daysAgo: 4,
                    hour: 10, minute: 5)
            ],
            "otto-5": [
                .init(
                    id: "m-otto", isYours: false,
                    content: "Morning digest: two new issues, nothing urgent.", daysAgo: 9,
                    hour: 8, minute: 0)
            ],
        ]

        static let releaseCrew = FixtureHost.Group(
            id: "group-release", title: "Release crew", members: [juniper, companions[1]],
            createdAt: 0)
        static let designReview = FixtureHost.Group(
            id: "group-design", title: "Design review",
            members: [companions[4], companions[2], companions[3], companions[5], companions[1]],
            createdAt: 0)

        static let groupMessages: [String: [FixtureHost.Message]] = [
            releaseCrew.id: [
                .init(
                    id: "m-release", isYours: false,
                    content: "The changelog is merged, I’m tagging 0.42 next.", daysAgo: 0,
                    hour: 9, minute: 30, author: juniper.id)
            ],
            designReview.id: [
                .init(
                    id: "m-design", isYours: true,
                    content: "Let’s keep the grouped inset list for settings.", daysAgo: 3,
                    hour: 14, minute: 15)
            ],
        ]

        static let release042 = FixtureHost.Group(
            id: "group-release-042", title: "Release 0.42", members: [juniper, pico, mira],
            createdAt: 0)

        static let homeMessages: [String: [FixtureHost.Message]] = listMessages.merging([
            pico.id: [
                .init(
                    id: "m-pico", isYours: false,
                    content: "All checks passed, the pull request is ready for review.",
                    daysAgo: 1, hour: 18, minute: 20)
            ],
            release042.id: [
                .init(
                    id: "m-release-042", isYours: false,
                    content: "All checks passed, the pull request is ready.", daysAgo: 0,
                    hour: 8, minute: 58, author: pico.id)
            ],
        ]) { _, home in home }

        static var release042Missions: [String] {
            let missions = [
                MissionsFixture.entry(
                    in: release042.id,
                    MissionsFixture.json(
                        id: "mission-215", ticket: "OPE-215",
                        objective: "Add dictation to the composer", botId: pico.id,
                        state: "working", isAgentRunning: true, status: nil,
                        movedAt: MissionsFixture.at(hour: 9, minute: 10))),
                MissionsFixture.entry(
                    in: release042.id,
                    MissionsFixture.json(
                        id: "mission-218", ticket: "OPE-218", objective: "Retry failed uploads",
                        botId: juniper.id, state: "working", isAgentRunning: false,
                        status: "Fixed the red check, CI is running again.",
                        movedAt: MissionsFixture.at(hour: 9, minute: 2))),
                MissionsFixture.entry(
                    in: release042.id,
                    MissionsFixture.json(
                        id: "mission-209", ticket: "OPE-209",
                        objective: "Settings sheet on iPhone", botId: mira.id,
                        state: "ready_to_merge", isAgentRunning: false, status: nil,
                        movedAt: MissionsFixture.at(hour: 7, minute: 45))),
                MissionsFixture.entry(
                    in: FixtureHost.chat(of: juniper.id),
                    MissionsFixture.json(
                        id: "mission-220", ticket: "OPE-220",
                        objective: "Draft the 0.42 release notes", botId: juniper.id,
                        state: "waiting_human", isAgentRunning: false,
                        status: "Asked you which fix leads.",
                        movedAt: MissionsFixture.at(hour: 9, minute: 20))),
            ]
            return missions
        }

        static let dictationMission: [FixtureHost.Message] = [
            .init(
                id: "d-on-it", isYours: false,
                content: "Dictation is in, I’m on the last check.", daysAgo: 0, hour: 9,
                minute: 10, author: pico.id)
        ]

        static let releasePlanning: [FixtureHost.Message] = [
            .init(
                id: "p-ask", isYours: true,
                content: "What’s left before we can cut 0.42? I’d like it out tomorrow.",
                daysAgo: 1, hour: 17, minute: 30),
            .init(
                id: "p-notes", isYours: false,
                content:
                    "The release notes need a last pass, and the changelog still lists two fixes that moved to 0.43.",
                daysAgo: 1, hour: 17, minute: 32, author: juniper.id),
            .init(
                id: "p-move", isYours: false,
                content: "I’ll move them tonight and send you the draft first thing.",
                daysAgo: 1, hour: 17, minute: 33, author: juniper.id),
            .init(
                id: "p-ticket", isYours: false,
                content:
                    "On my side, the onboarding ticket is too big for one review. I’d split it in two: the account step, then the space picker.",
                daysAgo: 1, hour: 17, minute: 41, author: atlas.id),
            .init(
                id: "p-ok", isYours: true, content: "Split it, and keep the account step first.",
                daysAgo: 1, hour: 17, minute: 45),
            .init(
                id: "p-done", isYours: false,
                content: "Will do. Both halves land in Linear before the tag.", daysAgo: 1,
                hour: 17, minute: 46, author: atlas.id),
        ]

        static let groupThread: [FixtureHost.Message] = [
            .init(
                id: "g-ask", isYours: true, content: "Can you two get 0.42 out today?",
                daysAgo: 0, hour: 9, minute: 2),
            .init(
                id: "g-merged", isYours: false, content: "The changelog is merged.", daysAgo: 0,
                hour: 9, minute: 4, author: juniper.id),
            .init(
                id: "g-tagging", isYours: false, content: "I’m tagging 0.42 next.", daysAgo: 0,
                hour: 9, minute: 5, author: juniper.id),
            .init(
                id: "g-split", isYours: false,
                content: "I’ll split the onboarding ticket once the tag is out.", daysAgo: 0,
                hour: 9, minute: 6, author: atlas.id),
            .init(
                id: "g-ping", isYours: false,
                content: "<@\(juniper.id)> ping me when it’s tagged.", daysAgo: 0, hour: 9,
                minute: 7, author: atlas.id),
        ]

        static let releaseNotesAsk = FixtureHost.Message(
            id: "m-ask", isYours: true, content: "Can you draft the release notes for 0.42?",
            daysAgo: 0, hour: 9, minute: 38)

        static let releaseNotes = [
            releaseNotesAsk,
            .init(
                id: "m-drafted", isYours: false,
                content:
                    "Drafted. Three sections: new, fixed, under the hood.\n\nApplications get the top spot, it’s what people notice first.",
                daysAgo: 0, hour: 9, minute: 39),
            .init(
                id: "m-waiting", isYours: false, content: "They’re waiting for your read.",
                daysAgo: 0, hour: 9, minute: 40),
        ]

        static let longThread: [FixtureHost.Message] =
            (0..<30).map { index in
                FixtureHost.Message(
                    id: "long-\(index)", isYours: index.isMultiple(of: 3),
                    content: index.isMultiple(of: 4)
                        ? "Step \(index + 1) of the 0.42 checklist is done. The notes, the changelog and the tag all agree on what ships, and nothing moved since this morning.\n\nNext one up."
                        : "Step \(index + 1) is done.",
                    daysAgo: index < 20 ? 1 : 0, hour: 8, minute: index)
            } + [
                .init(
                    id: "long-last", isYours: false,
                    content: "That’s the whole checklist, 0.42 is ready to tag.", daysAgo: 0,
                    hour: 8, minute: 30)
            ]

        static let longGroupThread: [FixtureHost.Message] =
            longThread.enumerated().map { index, message in
                var message = message
                message.author =
                    message.isYours ? nil : index.isMultiple(of: 2) ? juniper.id : atlas.id
                return message
            }

        static let twoAsks: [FixtureHost.Message] = [
            .init(
                id: "m-compare", isYours: true,
                content:
                    "Before we tag, compare the last two releases for me.\n\nI want three things:\n- what shipped\n- what broke\n- what we pushed back\n\nKeep each one to a line.",
                daysAgo: 0, hour: 9, minute: 42),
            .init(
                id: "m-figures", isYours: true,
                content: "Use the real numbers from the last 30 days.", daysAgo: 0, hour: 9,
                minute: 43),
        ]

        static let releaseHistory: [FixtureHost.Message] = [
            .init(
                id: "m-tone", isYours: false,
                content:
                    "I kept the tone close to the last two releases: short, one line per change, no jargon.\n\nWant me to add the screenshots?",
                daysAgo: 1, hour: 17, minute: 2),
            .init(
                id: "m-headlines", isYours: true,
                content: "What changed since 0.41? Just the headlines.", daysAgo: 1, hour: 17,
                minute: 10),
            .init(
                id: "m-landed", isYours: false,
                content:
                    "Applications landed, the roster scrolls per space, and notifications respect focus now.\n\nEleven fixes on top. I’d lead with the first one.",
                daysAgo: 1, hour: 17, minute: 12),
        ]

        static let longReplyParagraphs = (1...12).map { section in
            "Section \(section) of the notes lists what moved since 0.42: the changelog entry, the pull requests behind it, who reviewed them and what still needs a check before the tag goes out tonight."
        }

        static func script(_ fixture: SignInFixture) -> FixtureHost.Script {
            var script =
                fixture.isOnHome
                ? FixtureHost.Script(
                    companions: [
                        juniper, atlas, pico, mira,
                        Companion(id: otto.id, name: otto.name, role: otto.role, tint: .cyan),
                    ],
                    groups: [release042],
                    messages: homeMessages.merging(["thread-mission-215": dictationMission]) {
                        home, _ in home
                    },
                    missionFeed: release042Missions)
                : FixtureHost.Script(
                    companions: companions, groups: [releaseCrew, designReview],
                    messages: listMessages.merging(groupMessages) { listed, _ in listed })
            if isPaged {
                script.laterPagesAnswerAfter = laterPageDelay
                script.listPageSize = MissionsFixture.pageSize
                script.threadPageSize = 10
                script.groups += topics
                script.messages.merge(topicMessages) { listed, _ in listed }
                script.messages[juniper.id] = earlierNotes + (script.messages[juniper.id] ?? [])
                script.missionFeed += MissionsFixture.feed
            }
            switch fixture {
            case .conversationsLive:
                script.playsGroupChanges = true
            case .pinned:
                script.pinned = [juniper.id, release042.id, otto.id]
            case .pinRefused:
                script.pinned = [juniper.id, release042.id, otto.id]
                script.refusesPins = true
            case .thread, .swipedThread:
                script.messages[juniper.id] =
                    (isPaged ? earlierNotes : []) + (hasHistory ? releaseHistory : [])
                    + releaseNotes
            case .twoAsks:
                script.messages[juniper.id] = releaseNotes + twoAsks
            case .threadHostOffline:
                script.messages[juniper.id] = releaseNotes
                script.hostLeavesAfter = .seconds(2)
                script.hostLeavesAfterThread = true
            case .noCompanion:
                script.companions = []
                script.groups = []
            case .loadingCompanions:
                script.answersCompanions = false
            case .emptyThread:
                script.messages[juniper.id] = []
            case .conversationsHostOffline:
                script.hostLeavesAfter = .seconds(2)
            case .workingList:
                script.workingCompanion = juniper.id
            case .conversationsFailed:
                script.refusesCompanions = true
            case .conversationsRecovering:
                script.refusesCompanionsOnce = true
            case .threadFailed:
                script.refusesThread = true
            case .groupThread:
                script.messages[releaseCrew.id] = groupThread
            case .groupMention:
                script.messages[releaseCrew.id] = releasePlanning + groupThread
            case .groupWorking:
                script.messages[releaseCrew.id] =
                    groupThread + [
                        .init(
                            id: "g-both", isYours: true,
                            content: "<@\(juniper.id)> <@\(atlas.id)> is the tag out?", daysAgo: 0,
                            hour: 9, minute: 9)
                    ]
                script.workingGroup = (releaseCrew.id, [juniper.id, atlas.id])
            case .groupFailed:
                script.refusesThread = true
            case .slowThread:
                script.messages[juniper.id] = longThread
                script.threadAnswersAfter = .seconds(5)
            case .longReply:
                script.messages[juniper.id] = longThread
                script.replyParagraphs = longReplyParagraphs
                script.wordsPerDelta = 6
            case .slowGroup:
                script.messages[releaseCrew.id] = longGroupThread
                script.threadAnswersAfter = .seconds(2)
            case .workingThread:
                script.messages[juniper.id] = [releaseNotesAsk]
                script.workingCompanion = juniper.id
            case .workingAfterReply:
                script.messages[juniper.id] = releaseNotes
                script.workingCompanion = juniper.id
            case .longName:
                script.companions = [longNamed] + companions.dropFirst()
                script.messages[juniper.id] = releaseNotes
            case .longGroup:
                script.groups = [
                    releaseCrew.renamed(
                        "Release crew for 0.42, the onboarding split and the settings sheet")
                ]
                script.messages[releaseCrew.id] = groupThread
            default:
                break
            }
            return script
        }

        static func opening(_ fixture: SignInFixture) -> Companion.ID? {
            switch fixture {
            case .thread, .emptyThread, .workingThread, .workingAfterReply, .threadHostOffline,
                .swipedThread,
                .threadFailed, .slowThread, .longReply, .longName, .twoAsks:
                juniper.id
            case .groupThread, .groupWorking, .groupFailed, .groupMention, .longGroup, .slowGroup:
                releaseCrew.id
            case .missionsButton, .conversationMissions:
                release042.id
            case .conversationNoMissions:
                atlas.id
            default: nil
            }
        }

        static func relay(_ script: FixtureHost.Script) -> RelayEnvironment {
            RelayEnvironment(
                transport: FixtureHostTransport(script: script), clock: ContinuousRelayClock())
        }
    }

    struct FixtureHost {
        struct Message: Sendable {
            let id: String
            let isYours: Bool
            let content: String
            let daysAgo: Int
            let hour: Int
            let minute: Int
            var author: Companion.ID?

            var createdAt: Int {
                let calendar = Calendar.current
                let day = calendar.date(
                    byAdding: .day, value: -daysAgo, to: calendar.startOfDay(for: .now))!
                return calendar.date(bySettingHour: hour, minute: minute, second: 0, of: day)!
                    .milliseconds
            }

            func json(in conversationId: String, seq: Int) -> String {
                FixtureHost.messageJSON(
                    id: id, conversationId: conversationId, seq: seq,
                    role: isYours ? "user" : "assistant", content: content,
                    createdAt: createdAt, authorBotId: author)
            }

            var lastWordJSON: String {
                FixtureHost.lastWordJSON(text: content, at: createdAt, by: isYours ? nil : author)
            }
        }

        struct Group: Sendable {
            let id: String
            let title: String
            let members: [Companion]
            let createdAt: Int
            var pinPosition: Int?

            var conversation: GroupConversation {
                try! JSONDecoder().decode(GroupConversation.self, from: Data(json.utf8))
            }

            func renamed(_ title: String) -> Group {
                Group(
                    id: id, title: title, members: members, createdAt: createdAt,
                    pinPosition: pinPosition)
            }

            func pageJSON(lastActivityAt: Int, lastWord: String?, soloBotId: Companion.ID?)
                -> String
            {
                let solo = soloBotId.map { #""\#($0)""# } ?? "null"
                return
                    "\(json.dropLast()),\"lastActivityAt\":\(lastActivityAt),\"lastWord\":\(lastWord ?? "null"),\"soloBotId\":\(solo)}"
            }

            var json: String {
                let participants = members.enumerated().map { index, companion in
                    let tint = companion.tint.map { #""\#($0.rawValue)""# } ?? "null"
                    let path = companion.picturePath.map { #""\#($0)""# } ?? "null"
                    let role = index == 0 ? "lead" : "assistant"
                    return
                        #"{"botId":"\#(companion.id)","role":"\#(role)","joinedAt":\#(index),"leftAt":null,"name":"\#(companion.name)","avatarBlot":\#(tint),"avatarImagePath":\#(path),"isDeleted":false}"#
                }
                return
                    #"{"id":"\#(id)","spaceId":"\#(FixtureHost.spaceId)","sectionId":null,"pinPosition":\#(pinPosition.map(String.init) ?? "null"),"title":"\#(title)","instructions":"","createdAt":\#(createdAt),"updatedAt":\#(createdAt),"participants":[\#(participants.joined(separator: ","))]}"#
            }
        }

        struct Script: Sendable {
            var answersCompanions = true
            var refusesCompanions = false
            var refusesCompanionsOnce = false
            var refusesThread = false
            var companions: [Companion] = []
            var groups: [Group] = []
            var playsGroupChanges = false
            var messages: [Companion.ID: [Message]] = [:]
            var workingCompanion: Companion.ID?
            var workingGroup: (id: String, companions: [Companion.ID])?
            var hostLeavesAfter: Duration?
            var hostLeavesAfterThread = false
            var threadAnswersAfter = Duration.zero
            var replyParagraphs: [String] = []
            var wordsPerDelta = 1
            var laterPagesAnswerAfter = Duration.zero
            var listPageSize = Int.max
            var threadPageSize = Int.max
            var missionFeed: [String] = []
            var pinned: [String] = []
            var refusesPins = false
        }

        static let spaceId = "space-studio"
        static let launchPlanId = "group-launch"

        static let picture: String = {
            let side = CGSize(width: 192, height: 192)
            let png = UIGraphicsImageRenderer(size: side).pngData { context in
                let colours = [UIColor.kiroshi(.primary), .kiroshi(.ring)].map(\.cgColor)
                if let gradient = CGGradient(
                    colorsSpace: nil, colors: colours as CFArray, locations: nil)
                {
                    context.cgContext.drawLinearGradient(
                        gradient, start: .zero, end: CGPoint(x: side.width, y: side.height),
                        options: [])
                }
                let figure = UIImage(systemName: "person.fill")?.withTintColor(
                    .kiroshi(.primaryForeground))
                figure?.draw(in: CGRect(x: 48, y: 52, width: 96, height: 92))
            }
            return #"{"contentType":"image/png","base64":"\#(png.base64EncodedString())"}"#
        }()

        static func botJSON(_ companion: Companion, pinPosition: Int? = nil) -> String {
            let tint = companion.tint.map { #""\#($0.rawValue)""# } ?? "null"
            let path = companion.picturePath.map { #""\#($0)""# } ?? "null"
            let pin = pinPosition.map(String.init) ?? "null"
            return
                #"{"id":"\#(companion.id)","sectionId":null,"pinPosition":\#(pin),"name":"\#(companion.name)","title":"\#(companion.role ?? "")","avatarBlot":\#(tint),"avatarImagePath":\#(path)}"#
        }

        static func lastWordJSON(text: String, at: Int, by author: Companion.ID?) -> String {
            let encoded = String(decoding: try! JSONEncoder().encode(text), as: UTF8.self)
            let author = author.map { #""\#($0)""# } ?? "null"
            return #"{"text":\#(encoded),"at":\#(at),"authorBotId":\#(author)}"#
        }

        struct PageRow {
            var group: Group
            let lastActivityAt: Int
            let lastWord: String?
            var soloBotId: Companion.ID?
        }

        static func soloRow(of companion: Companion, last: Message) -> PageRow {
            PageRow(
                group: Group(
                    id: chat(of: companion.id), title: "Chat", members: [companion], createdAt: 0),
                lastActivityAt: last.createdAt,
                lastWord: lastWordJSON(
                    text: last.content, at: last.createdAt,
                    by: last.isYours ? nil : companion.id),
                soloBotId: companion.id)
        }

        static func conversationPage(_ rows: [PageRow], cursor: String?, limit: Int) -> String {
            let offset = cursor.flatMap(Int.init) ?? 0
            let pinned =
                offset == 0
                ? rows.filter { $0.group.pinPosition != nil }
                    .sorted { $0.group.pinPosition! < $1.group.pinPosition! } : []
            let paged = rows.filter { $0.group.pinPosition == nil }
                .sorted {
                    $0.lastActivityAt == $1.lastActivityAt
                        ? $0.group.id > $1.group.id : $0.lastActivityAt > $1.lastActivityAt
                }
            let page = paged.dropFirst(offset).prefix(limit)
            let next = offset + limit < paged.count ? #""\#(offset + limit)""# : "null"
            let json = { (rows: [PageRow]) in
                rows.map {
                    $0.group.pageJSON(
                        lastActivityAt: $0.lastActivityAt, lastWord: $0.lastWord,
                        soloBotId: $0.soloBotId)
                }
                .joined(separator: ",")
            }
            return
                #"{"pinned":[\#(json(pinned))],"conversations":[\#(json(Array(page)))],"nextCursor":\#(next)}"#
        }

        static func chat(of companionId: Companion.ID) -> String {
            "chat-\(companionId)"
        }

        static func scope(_ conversationId: String, by companionId: Companion.ID? = nil) -> String {
            let companionId =
                companionId ?? conversationId.replacingOccurrences(of: "chat-", with: "")
            return
                #"{"conversationId":"\#(conversationId)","botId":"\#(companionId)","runtimeSessionId":"session-\#(companionId)","epoch":1}"#
        }

        static func agentEvent(
            _ conversationId: String, _ event: String, by companionId: Companion.ID? = nil
        ) -> String {
            #"{"event":{"event":"agent://event","payload":{"scope":\#(scope(conversationId, by: companionId)),"event":\#(event),"turn":{"turnId":"turn-live","conversationId":"\#(conversationId)"}}}}"#
        }

        static func activity(_ id: String, _ title: String, _ status: String) -> String {
            #"{"type":"activity","activity":{"id":"\#(id)","title":"\#(title)","kind":"tool","status":"\#(status)"}}"#
        }

        static func chatMessage(_ id: String, _ text: String, _ type: String) -> String {
            #"{"type":"\#(type)","message":{"id":"\#(id)","role":"assistant","text":"\#(text)","completion":"streaming","timestamp":\#(Date.now.milliseconds)}}"#
        }

        static func groupEvent(_ name: String, _ group: Group) -> String {
            #"{"event":{"event":"\#(name)","payload":{"spaceId":"\#(spaceId)","conversation":\#(group.json)}}}"#
        }

        static func groupDeleted(_ group: Group) -> String {
            #"{"event":{"event":"conversation://deleted","payload":{"spaceId":"\#(spaceId)","conversationId":"\#(group.id)"}}}"#
        }

        static func messageJSON(
            id: String, conversationId: String, seq: Int, role: String, content: String,
            createdAt: Int, authorBotId: String? = nil
        ) -> String {
            let author = authorBotId.map { #""\#($0)""# } ?? "null"
            return
                #"{"id":"\#(id)","conversationId":"\#(conversationId)","turnId":"turn-\#(id)","seq":\#(seq),"role":"\#(role)","content":"\#(content.replacingOccurrences(of: "\n", with: #"\n"#))","completion":"complete","createdAt":\#(createdAt),"authorBotId":\#(author),"authorAccountId":null,"authorName":null,"repliedToMessageId":null,"runtimeSessionId":null}"#
        }
    }

    actor FixtureHostTransport: RelayTransport {
        private let script: FixtureHost.Script
        private let companionsRefusal = FixtureOnce()
        private let pins: FixturePins
        private var opened = 0

        init(script: FixtureHost.Script) {
            self.script = script
            pins = FixturePins(script.pinned)
        }

        func open(_ request: URLRequest) async throws -> any RelaySocket {
            if script.hostLeavesAfter != nil, opened > 0 {
                throw RelayClosure(code: RelayClosure.hostOffline)
            }
            opened += 1
            return FixtureHostSocket(
                script: script, companionsRefusal: companionsRefusal, pins: pins)
        }
    }

    final class FixturePins: Sendable {
        private let ids: Mutex<[String]>

        init(_ ids: [String]) {
            self.ids = Mutex(ids)
        }

        var current: [String] {
            ids.withLock { $0 }
        }

        func replace(with changed: [String]) -> Bool {
            ids.withLock { ids in
                guard ids != changed else { return false }
                ids = changed
                return true
            }
        }
    }

    final class FixtureOnce: Sendable {
        private let hasHappened = Mutex(false)

        func take() -> Bool {
            hasHappened.withLock { hasHappened in
                defer { hasHappened = true }
                return !hasHappened
            }
        }
    }

    actor FixturePageCount {
        private var count = 0

        func next() -> Int {
            count += 1
            return count
        }
    }

    final class FixtureHostSocket: RelaySocket {
        enum Inbound: Sendable {
            case frame(String, after: Duration = .zero)
            case close(Int, after: Duration = .zero)
        }

        private let script: FixtureHost.Script
        private let companionsRefusal: FixtureOnce
        private let pins: FixturePins
        private let pages = FixturePageCount()
        private let created = Mutex<[FixtureHost.Group]>([])
        private let inbound: AsyncStream<Inbound>
        private let inboundContinuation: AsyncStream<Inbound>.Continuation

        private let listed: AsyncStream<Void>.Continuation
        private let launchPlanOpened: AsyncStream<Void>.Continuation
        private let playingGroupChanges: Task<Void, Never>?

        init(script: FixtureHost.Script, companionsRefusal: FixtureOnce, pins: FixturePins) {
            self.script = script
            self.companionsRefusal = companionsRefusal
            self.pins = pins
            let (inbound, inboundContinuation) = AsyncStream.makeStream(of: Inbound.self)
            self.inbound = inbound
            self.inboundContinuation = inboundContinuation
            let (listing, listed) = AsyncStream.makeStream(of: Void.self)
            self.listed = listed
            let (launchPlanOpening, launchPlanOpened) = AsyncStream.makeStream(of: Void.self)
            self.launchPlanOpened = launchPlanOpened
            playingGroupChanges =
                script.playsGroupChanges
                ? Task {
                    for await _ in listing {
                        await Self.playGroupChanges(
                            into: inboundContinuation, once: launchPlanOpening)
                        return
                    }
                } : nil
        }

        func push(_ message: Inbound) {
            inboundContinuation.yield(message)
        }

        func send(_ text: String) async throws {
            guard
                let call = try? JSONSerialization.jsonObject(with: Data(text.utf8))
                    as? [String: Any],
                let id = call["id"] as? Int, let command = call["command"] as? String
            else { return }
            let args = call["args"] as? [String: Any] ?? [:]
            answer(id, command, args)
            if command == "conversation_message_page",
                args["conversationId"] as? String == FixtureHost.launchPlanId,
                args["limit"] as? Int != 1
            {
                launchPlanOpened.yield()
            }
            guard let leaving = script.hostLeavesAfter else { return }
            let readOneByOne = script.companions.filter { script.messages[$0.id]?.last == nil }
            let leaves =
                switch command {
                case "conversation_message_page" where script.hostLeavesAfterThread:
                    args["limit"] as? Int != 1
                case "conversation_message_page":
                    await pages.next() == readOneByOne.count
                case "conversation_page":
                    !script.hostLeavesAfterThread && readOneByOne.isEmpty
                        && args["cursor"] as? String == nil
                default:
                    false
                }
            guard leaves else { return }
            push(.close(RelayClosure.hostOffline, after: leaving))
        }

        func receive() async throws -> String {
            var iterator = inbound.makeAsyncIterator()
            switch await iterator.next() {
            case .frame(let text, let delay):
                try await ContinuousClock().sleep(for: delay)
                return text
            case .close(let code, let delay):
                try await ContinuousClock().sleep(for: delay)
                throw RelayClosure(code: code)
            case nil:
                throw CancellationError()
            }
        }

        func ping() async throws {}

        func close() {
            playingGroupChanges?.cancel()
            listed.finish()
            launchPlanOpened.finish()
            push(.close(1000))
        }

        private func reply(_ id: Int, _ body: String, after delay: Duration = .zero) {
            push(.frame(#"{"id":\#(id),"status":200,"body":\#(body)}"#, after: delay))
        }

        private func refuse(_ id: Int) {
            push(
                .frame(
                    #"{"id":\#(id),"status":500,"body":{"kind":"unavailable","failure":{"kind":"locked"}}}"#
                ))
        }

        private func answer(_ id: Int, _ command: String, _ args: [String: Any]) {
            switch command {
            case "relay_shared_space":
                reply(id, #"{"spaceId":"\#(FixtureHost.spaceId)"}"#)
            case "conversation_bots"
            where script.refusesCompanions
                || (script.refusesCompanionsOnce && companionsRefusal.take()):
                refuse(id)
            case "conversation_message_page"
            where script.refusesThread && args["limit"] as? Int != 1:
                refuse(id)
            case "conversation_bots":
                guard script.answersCompanions else { return }
                let pinned = pins.current
                let bots = script.companions.map {
                    FixtureHost.botJSON($0, pinPosition: pinned.firstIndex(of: $0.id))
                }
                reply(id, "[\(bots.joined(separator: ","))]")
                if let working = script.workingCompanion {
                    push(
                        .frame(
                            FixtureHost.agentEvent(
                                FixtureHost.chat(of: working),
                                #"{"type":"turnChanged","state":"running"}"#)))
                }
            case "conversation_list":
                let groups = script.groups + created.withLock { $0 }
                reply(id, "[\(groups.map(\.json).joined(separator: ","))]")
                listed.yield()
            case "conversation_page":
                let groups = (script.groups + created.withLock { $0 }).map { group in
                    let last = script.messages[group.id]?.last
                    return FixtureHost.PageRow(
                        group: group, lastActivityAt: max(group.createdAt, last?.createdAt ?? 0),
                        lastWord: last?.lastWordJSON)
                }
                let solos = script.companions.compactMap { companion in
                    script.messages[companion.id]?.last.map {
                        FixtureHost.soloRow(of: companion, last: $0)
                    }
                }
                let pinned = pins.current
                let rows = (groups + solos).map { row in
                    var row = row
                    row.group.pinPosition = pinned.firstIndex(of: row.soloBotId ?? row.group.id)
                    return row
                }
                let cursor = args["cursor"] as? String
                reply(
                    id,
                    FixtureHost.conversationPage(
                        rows, cursor: cursor,
                        limit: min(args["limit"] as? Int ?? 30, script.listPageSize)),
                    after: cursor == nil ? .zero : script.laterPagesAnswerAfter)
                if cursor == nil {
                    listed.yield()
                }
            case "conversation_main_chat":
                let companionId = args["botId"] as? String ?? ""
                reply(
                    id,
                    #"{"id":"\#(FixtureHost.chat(of: companionId))","createdAt":0,"updatedAt":0}"#)
            case "conversation_message_page":
                let conversationId = args["conversationId"] as? String ?? ""
                let limit = args["limit"] as? Int ?? 50
                answerPage(id, conversationId, before: args["beforeSeq"] as? Int, limit)
            case "conversation_send_turn":
                guard let message = args["message"] as? [String: Any] else { return }
                reply(id, "1")
                let conversationId = message["conversationId"] as? String
                let groups = script.groups + created.withLock { $0 }
                if let group = groups.first(where: { $0.id == conversationId }) {
                    let summoned = args["summoned"] as? [String] ?? []
                    let lead = group.members.prefix(1).map(\.id)
                    playGroupTurn(after: message, by: summoned.isEmpty ? lead : summoned)
                } else {
                    playTurn(after: message)
                }
            case "chat_store_attachments":
                let conversationId = args["conversationId"] as? String ?? ""
                let names = (args["attachments"] as? [[String: Any]] ?? []).compactMap {
                    $0["name"] as? String
                }
                let paths = names.map {
                    #""/Users/sam/Library/Application Support/app.kiroshi/attachments/\#(conversationId)/\#($0)""#
                }
                reply(id, "[\(paths.joined(separator: ","))]")
            case "agent_cancel_turn":
                reply(id, "null")
            case "agent_pending_questions":
                reply(id, "[]")
            case "mission_space_feed":
                reply(id, "[\(script.missionFeed.joined(separator: ","))]")
            case "mission_space_page":
                let page = (args["cursor"] as? String).map { "mission_space_page \($0)" }
                reply(
                    id,
                    MissionsFixture.pages(
                        of: script.missionFeed,
                        size: min(script.listPageSize, MissionsRelay.listPageSize))[
                            page ?? "mission_space_page"]
                        ?? "",
                    after: page == nil ? .zero : script.laterPagesAnswerAfter)
            case "conversation_create":
                let companionIds = args["botIds"] as? [String] ?? []
                let group = created.withLock { groups in
                    let group = FixtureHost.Group(
                        id: "group-created-\(groups.count + 1)", title: "",
                        members: companionIds.compactMap { companionId in
                            script.companions.first { $0.id == companionId }
                        },
                        createdAt: Date.now.milliseconds)
                    groups.append(group)
                    return group
                }
                reply(id, group.json)
                push(.frame(FixtureHost.groupEvent("conversation://created", group)))
            case "section_list":
                reply(id, "[]")
            case "roster_pin":
                let changed = (args["pins"] as? [[String: Any]] ?? []).compactMap {
                    $0["id"] as? String
                }
                if script.refusesPins || !pins.replace(with: changed) {
                    refuse(id)
                } else {
                    reply(id, "null")
                }
            case "relay_avatar" where args["file"] as? String == "shoto.png":
                reply(id, FixtureHost.picture)
            default:
                push(
                    .frame(#"{"id":\#(id),"status":403,"body":"this command belongs to the host"}"#)
                )
            }
        }

        private static func playGroupChanges(
            into inbound: AsyncStream<Inbound>.Continuation, once opening: AsyncStream<Void>
        ) async {
            let launchPlan = FixtureHost.Group(
                id: FixtureHost.launchPlanId, title: "Launch plan",
                members: [
                    Companion(id: "juniper-6", name: "Juniper", tint: .green),
                    Companion(id: "pico-6", name: "Pico", tint: .orange),
                ],
                createdAt: Date.now.milliseconds + 3000)
            guard await pause() else { return }
            inbound.yield(.frame(FixtureHost.groupEvent("conversation://created", launchPlan)))
            for await _ in opening { break }
            let changes = [
                FixtureHost.groupEvent(
                    "conversation://updated", launchPlan.renamed("Launch checklist")),
                FixtureHost.groupDeleted(launchPlan),
            ]
            for frame in changes {
                guard await pause() else { return }
                inbound.yield(.frame(frame))
            }
        }

        private static func pause() async -> Bool {
            do {
                try await ContinuousClock().sleep(for: .seconds(3))
                return true
            } catch {
                return false
            }
        }

        private func answerPage(_ id: Int, _ conversationId: String, before: Int?, _ limit: Int) {
            let companionId = conversationId.replacingOccurrences(of: "chat-", with: "")
            let messages = script.messages[companionId] ?? []
            let earlier = messages.enumerated().map { $1.json(in: conversationId, seq: $0 + 1) }
                .prefix((before ?? messages.count + 1) - 1)
            let size = min(limit, script.threadPageSize)
            let page = earlier.suffix(size)
            reply(
                id,
                #"{"conversationId":"\#(conversationId)","messages":[\#(page.joined(separator: ","))],"arrivals":[],"hasMore":\#(earlier.count > size)}"#,
                after: limit == 1
                    ? .zero
                    : before == nil ? script.threadAnswersAfter : script.laterPagesAnswerAfter
            )
            if let working = script.workingGroup, working.id == conversationId {
                for companionId in working.companions {
                    push(
                        .frame(
                            FixtureHost.agentEvent(
                                conversationId, #"{"type":"turnChanged","state":"running"}"#,
                                by: companionId)))
                }
            }
            guard companionId == script.workingCompanion else { return }
            push(
                .frame(
                    FixtureHost.agentEvent(
                        conversationId, #"{"type":"turnChanged","state":"running"}"#)))
        }

        private func pushStoredEcho(of sent: [String: Any]) {
            let conversationId = sent["conversationId"] as? String ?? ""
            push(
                .frame(
                    #"{"event":{"event":"conversation://message-stored","payload":\#(FixtureHost.messageJSON(id: sent["id"] as? String ?? "", conversationId: conversationId, seq: 99, role: "user", content: sent["content"] as? String ?? "", createdAt: sent["createdAt"] as? Int ?? 0))}}"#
                ))
        }

        private func playGroupTurn(after sent: [String: Any], by summoned: [Companion.ID]) {
            let conversationId = sent["conversationId"] as? String ?? ""
            pushStoredEcho(of: sent)
            for companionId in summoned {
                push(
                    .frame(
                        FixtureHost.agentEvent(
                            conversationId, #"{"type":"turnChanged","state":"running"}"#,
                            by: companionId), after: .milliseconds(300)))
            }
            for companionId in summoned {
                let event = { (event: String) in
                    FixtureHost.agentEvent(conversationId, event, by: companionId)
                }
                push(
                    .frame(
                        event(
                            FixtureHost.activity(
                                "tool-\(companionId)", "Bash · Show the last tag", "running")),
                        after: .milliseconds(300)))
                push(
                    .frame(
                        event(
                            FixtureHost.chatMessage(
                                "live-\(companionId)", "On it.", "messageCompleted")),
                        after: .milliseconds(1500)))
                push(
                    .frame(
                        event(
                            #"{"type":"turnEnded","ended":{"sessionId":null,"outcome":"success"}}"#
                        )))
                push(.frame(event(#"{"type":"turnChanged","state":"idle"}"#)))
            }
        }

        private func playTurn(after sent: [String: Any]) {
            let conversationId = sent["conversationId"] as? String ?? ""
            let event = { (event: String) in FixtureHost.agentEvent(conversationId, event) }
            let sentId = sent["id"] as? String ?? ""
            let replyId = "reply-\(sentId)"
            pushStoredEcho(of: sent)
            push(
                .frame(
                    event(#"{"type":"turnChanged","state":"running"}"#), after: .milliseconds(300)))
            let tools = [
                "Read · notes/changelog.md", "Read · apps/app/package.json",
                "Read · docs/relay/member-socket.md",
                "Bash · List the merged pull requests", "Bash · Show the last tag",
            ]
            for (index, title) in tools.enumerated() {
                push(
                    .frame(
                        event(FixtureHost.activity("live-\(index)", title, "running")),
                        after: .milliseconds(500)))
            }
            let reply =
                (["Drafted. Three sections: new, fixed, under the hood."] + script.replyParagraphs)
                .joined(separator: "\n\n").replacingOccurrences(of: "\n", with: #"\n"#)
            push(
                .frame(
                    event(FixtureHost.chatMessage(replyId, "", "messageStarted")),
                    after: .milliseconds(400)))
            let words = reply.split(separator: " ")
            for start in stride(from: 0, to: words.count, by: script.wordsPerDelta) {
                let delta = words[start..<min(start + script.wordsPerDelta, words.count)]
                    .joined(separator: " ")
                push(
                    .frame(
                        event(
                            #"{"type":"messageDelta","id":"\#(replyId)","seq":1,"text":"\#(delta) "}"#
                        ),
                        after: .milliseconds(120)))
            }
            push(.frame(event(FixtureHost.chatMessage(replyId, reply, "messageCompleted"))))
            push(
                .frame(
                    event(
                        FixtureHost.activity(
                            "live-write", "Write · notes/release-0.42.md", "succeeded")),
                    after: .milliseconds(500)))
            let closing = "They’re waiting for your read."
            push(
                .frame(
                    event(
                        FixtureHost.chatMessage("closing-\(sentId)", closing, "messageCompleted")),
                    after: .milliseconds(500)))
            push(
                .frame(
                    event(#"{"type":"turnEnded","ended":{"sessionId":null,"outcome":"success"}}"#)))
            push(.frame(event(#"{"type":"turnChanged","state":"idle"}"#)))
        }
    }
#endif
