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

    @Test(
        arguments: [
            ("needs_you", "working", MissionGroup?.some(.needsYou), false),
            ("working", "working", .working, true),
            ("idle", "working", .working, false),
            ("ready_to_merge", "ready_to_merge", .review, false),
            ("failed", "failed", nil, false),
            ("done", "done", nil, false),
            ("closed", "closed", nil, false),
        ])
    func theHostLivenessPlacesTheMissionAndMovesItsAvatar(
        liveness: String, state: String, group: MissionGroup?, isWorking: Bool
    ) {
        let mission = MissionTesting.mission(
            state: state, isAgentRunning: !isWorking, liveness: liveness)

        #expect(mission.group == group)
        #expect(mission.isWorking == isWorking)
    }

    @Test func theLivenessWinsOverTheStoredState() {
        let asking = MissionTesting.mission(state: "working", liveness: "needs_you")
        let answered = MissionTesting.mission(
            state: "waiting_human", isAgentRunning: true, liveness: "working")

        #expect(asking.group == .needsYou)
        #expect(asking.statusLine == "Blocked on you")
        #expect(answered.group == .working)
        #expect(answered.statusLine == "Working now")
    }

    @Test(arguments: [nil, "dreaming"])
    func withoutAReadableLivenessTheStoredStateDecides(liveness: String?) {
        let asking = MissionTesting.mission(
            state: "waiting_human", isAgentRunning: true, liveness: liveness)
        let running = MissionTesting.mission(isAgentRunning: true, liveness: liveness)

        #expect(asking.liveness == nil)
        #expect(asking.group == .needsYou)
        #expect(asking.isWorking)
        #expect(running.group == .working)
        #expect(running.statusLine == "Working now")
    }

    @Test func anIdleMissionKeepsItsWrittenStatusAndAStillAvatar() {
        let idle = MissionTesting.mission(
            isAgentRunning: true, liveness: "idle", status: "Fixed the red check, CI is running")

        #expect(idle.group == .working)
        #expect(!idle.isWorking)
        #expect(idle.statusLine == "Fixed the red check, CI is running")
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
        #expect(
            mission.titleLine(companion: Companion(id: "bot-1", name: "Atlas", role: "Planner"))
                == "OPE-1 · Atlas · Planner")
        #expect(mission.detailLine(companion: nil) == "Asked you which screen goes first.")
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

    @Test func aChangeCarriesItsLivenessUnlessItIsStale() {
        let mission = MissionTesting.mission(state: "working", stateSeq: 4, liveness: "idle")
        let moved = mission.moved(
            by: MissionChanged(
                missionId: mission.id, state: .working, stateSeq: 4, isAgentRunning: false,
                liveness: .needsYou, lastActivityAt: 9))
        let stale = mission.moved(
            by: MissionChanged(
                missionId: mission.id, state: .working, stateSeq: 3, isAgentRunning: true,
                liveness: .working, lastActivityAt: 9))
        let older = mission.moved(
            by: MissionChanged(
                missionId: mission.id, state: .working, stateSeq: 5, isAgentRunning: true,
                lastActivityAt: 9))

        #expect(moved.group == .needsYou)
        #expect(stale.liveness == .idle)
        #expect(!stale.isWorking)
        #expect(older.liveness == nil)
        #expect(older.isWorking)
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

    @Test func aMissionChangedFrameReadsItsLivenessAndSkipsAnUnknownOne() {
        let frame = { (liveness: String) in
            MissionTesting.event(
                "mission://changed",
                payload:
                    #"{"missionId":"m-1","state":"working","stateSeq":2,"isAgentRunning":true,"liveness":"\#(liveness)","lastActivityAt":null}"#
            )
        }

        #expect(MissionChanged(frame("needs_you"))?.liveness == .needsYou)
        #expect(MissionChanged(frame("dreaming"))?.liveness == nil)
        #expect(MissionChanged(frame("dreaming"))?.state == .working)
    }
}
