import SwiftUI

struct MissionThreadView: View {
    let missions: MissionsStore
    let space: SpaceStore
    @State private var thread: MissionThreadStore

    init(mission: Mission, missions: MissionsStore, space: SpaceStore) {
        self.missions = missions
        self.space = space
        _thread = State(initialValue: MissionThreadStore(mission: mission))
    }

    var body: some View {
        let companion = missions.companion(of: thread.mission)
        ThreadScreen(
            model: thread, heading: thread.mission.heading(companion: companion),
            opening: ThreadOpening(
                day: thread.transcript.openedDay,
                line: MissionTranscript.openedLine(by: companion)),
            space: space)
    }
}

extension Mission {
    func heading(companion: MissionCompanion?) -> ThreadHeading {
        ThreadHeading(
            avatar: .companion(companion), working: isAgentRunning ? [botId] : [],
            overline: titleLine(companion: companion), title: objective)
    }
}
