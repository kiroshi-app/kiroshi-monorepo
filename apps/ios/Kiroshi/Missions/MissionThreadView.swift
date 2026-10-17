import SwiftUI

struct MissionThreadView: View {
    let missions: MissionsStore
    let space: SpaceStore
    @State private var thread: MissionThreadStore

    init(mission: Mission, missions: MissionsStore, space: SpaceStore) {
        self.missions = missions
        self.space = space
        _thread = State(
            initialValue: MissionThreadStore(
                mission: mission, missions: missions, work: space.work,
                authorship: space.authorship))
    }

    var body: some View {
        let companion = missions.companion(of: thread.mission)
        ThreadScreen(
            model: thread,
            heading: missions.live(thread.mission).heading(
                companion: companion, working: Set(thread.workers.map(\.companionId))),
            opening: ThreadOpening(
                day: thread.transcript.openedDay,
                line: MissionTranscript.openedLine(by: companion)),
            space: space)
    }
}

extension Mission {
    func heading(companion: MissionCompanion?, working: Set<Companion.ID> = []) -> ThreadHeading {
        ThreadHeading(
            avatar: .companion(companion),
            working: isAgentRunning ? working.union([botId]) : working,
            overline: titleLine(companion: companion), title: objective)
    }
}
