import SwiftUI

struct MissionsScreen: View {
    let store: SpaceStore
    let account: SignInModel
    @State private var missions: MissionsStore
    @State private var path = MissionsRoute.atLaunch

    init(store: SpaceStore, account: SignInModel, missions: MissionsStore = MissionsStore()) {
        self.store = store
        self.account = account
        _missions = State(initialValue: missions)
    }

    var body: some View {
        NavigationStack(path: $path) {
            MissionsList(missions: missions, space: store) { path.append(.mission($0)) }
                .background(Color(.systemBackground))
                .spaceChrome(store: store, account: account, section: .missions)
                .navigationDestination(for: MissionsRoute.self) { route in
                    switch route {
                    case .mission(let mission):
                        MissionThreadView(mission: mission, missions: missions, space: store)
                    }
                }
                .toolbarVisibility(path.isEmpty ? .visible : .hidden, for: .tabBar)
        }
        .task(id: store.connection.map(ObjectIdentifier.init)) {
            guard let connection = store.connection else { return }
            await missions.follow(connection)
        }
    }
}

#if DEBUG
    #Preview("5.1 Missions · list") {
        SignInRootView(model: .fixture(.missions))
    }

    #Preview("Mission · companion at work") {
        SignInRootView(model: .fixture(.missionWorking))
    }

    #Preview("5.2 Mission · thread") {
        SignInRootView(model: .fixture(.missionThread))
    }

    #Preview("State · mission loading") {
        SignInRootView(model: .fixture(.slowMission))
    }

    #Preview("5.3 State · no missions") {
        SignInRootView(model: .fixture(.noMissions))
    }

    #Preview("5.4 State · host offline") {
        SignInRootView(model: .fixture(.missionsHostOffline))
    }
#endif
