import Testing

@testable import Kiroshi

struct MissionGroupTests {
    @Test(
        arguments: [
            (Mission.State.waitingHuman, MissionGroup?.some(.needsYou)),
            (.working, .working),
            (.waitingBot, .working),
            (.readyToMerge, .review),
            (.failed, nil),
            (.done, nil),
            (.closed, nil),
        ])
    func eachStatusFindsItsGroup(state: Mission.State, group: MissionGroup?) {
        #expect(MissionGroup(state) == group)
    }

    @Test func groupsComeInTheArtboardOrderAndEmptyOnesAreLeftOut() {
        let sections = MissionSection.sections(
            of: [
                MissionTesting.entry(MissionTesting.mission(id: "review", state: "ready_to_merge")),
                MissionTesting.entry(MissionTesting.mission(id: "asks", state: "waiting_human")),
                MissionTesting.entry(MissionTesting.mission(id: "closed", state: "closed")),
            ])

        #expect(sections.map(\.group) == [.needsYou, .review])
        #expect(sections.map { $0.missions.map(\.id) } == [["asks"], ["review"]])
        #expect(sections.map(\.group.title) == ["Needs you", "Review"])
    }

    @Test func theMissionThatMovedLastComesFirstInItsGroup() {
        let sections = MissionSection.sections(
            of: [
                MissionTesting.entry(MissionTesting.mission(id: "old", openedAt: 1_000)),
                MissionTesting.entry(
                    MissionTesting.mission(id: "active", openedAt: 500, lastActivityAt: 3_000)),
                MissionTesting.entry(MissionTesting.mission(id: "new", openedAt: 2_000)),
                MissionTesting.entry(MissionTesting.mission(id: "also-new", openedAt: 2_000)),
            ])

        #expect(sections.first?.missions.map(\.id) == ["active", "also-new", "new", "old"])
    }

    @Test func theStatusLineFollowsTheArtboard() {
        #expect(
            MissionTesting.mission(
                state: "waiting_human", status: "Asked you which screen goes first"
            )
            .statusLine == "Asked you which screen goes first")
        #expect(MissionTesting.mission(state: "waiting_human").statusLine == "Blocked on you")
        #expect(
            MissionTesting.mission(isAgentRunning: true, status: "Reading the tests").statusLine
                == "Working now")
        #expect(
            MissionTesting.mission(status: "Fixed the red check, CI is running").statusLine
                == "Fixed the red check, CI is running")
        #expect(
            MissionTesting.mission(state: "ready_to_merge", status: "Opened #12").statusLine
                == "Ready to merge")
    }

    @Test func aRowReadsItsCompanionAndStatusAndTheTitleItsTicket() {
        let atlas = Companion(id: "bot-1", name: "Atlas")
        let mission = MissionTesting.mission(
            state: "waiting_human", status: "Asked you which screen goes first.")

        #expect(
            mission.detailLine(companion: atlas) == "Atlas · Asked you which screen goes first.")
        #expect(mission.titleLine(companion: atlas) == "OPE-1 · Atlas")
        #expect(mission.detailLine(companion: nil) == "Asked you which screen goes first.")
    }

    @Test func searchKeepsTheMissionsWhoseObjectiveTicketOrCompanionMatches() {
        let sections = MissionSection.sections(
            of: [
                MissionTesting.entry(
                    MissionTesting.mission(id: "dictation", state: "waiting_human", botId: "b-1")),
                MissionTesting.entry(MissionTesting.mission(id: "uploads", botId: "b-2")),
                MissionTesting.entry(
                    MissionTesting.mission(id: "settings", state: "ready_to_merge", botId: "b-3")),
            ])
        let companions = [
            "b-1": Companion(id: "b-1", name: "Pico"), "b-2": Companion(id: "b-2", name: "Juniper"),
        ]

        let byObjective = MissionSection.sections(
            sections, matching: "DICTATION", companions: companions)
        let byCompanion = MissionSection.sections(
            sections, matching: "junip", companions: companions)

        #expect(byObjective.map(\.group) == [.needsYou])
        #expect(byObjective.flatMap(\.missions).map(\.id) == ["dictation"])
        #expect(byCompanion.flatMap(\.missions).map(\.id) == ["uploads"])
        #expect(
            MissionSection.sections(sections, matching: "ope-1", companions: companions)
                .flatMap(\.missions).count == 3)
        #expect(MissionSection.sections(sections, matching: "  ", companions: [:]) == sections)
        #expect(MissionSection.sections(sections, matching: "nothing", companions: [:]).isEmpty)
    }

    @Test func aChangeMovesTheMissionUnlessItIsStale() {
        let mission = MissionTesting.mission(state: "working", stateSeq: 4)
        let moved = mission.moved(
            by: MissionChanged(
                missionId: mission.id, state: .waitingHuman, stateSeq: 5, isAgentRunning: false,
                lastActivityAt: 9))
        let stale = mission.moved(
            by: MissionChanged(
                missionId: mission.id, state: .done, stateSeq: 3, isAgentRunning: true,
                lastActivityAt: 9))

        #expect(moved.state == .waitingHuman)
        #expect(moved.stateSeq == 5)
        #expect(stale.state == .working)
        #expect(stale.isAgentRunning)
        #expect(stale.lastActivityAt == 9)
    }

    @Test func aMissionChangedFrameIsRead() {
        let frame = MissionTesting.event(
            "mission://changed",
            payload:
                #"{"missionId":"m-1","state":"ready_to_merge","stateSeq":2,"isAgentRunning":false,"lastActivityAt":null}"#
        )

        #expect(
            MissionChanged(frame)
                == MissionChanged(
                    missionId: "m-1", state: .readyToMerge, stateSeq: 2, isAgentRunning: false,
                    lastActivityAt: nil))
        #expect(MissionChanged(MissionTesting.event("routine://changed", payload: "{}")) == nil)
    }
}
