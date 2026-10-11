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
            content
                .scrollContentBackground(.hidden)
                .background(Color.kiroshi(.background))
                .spaceChrome(store: store, account: account)
                .navigationDestination(for: MissionsRoute.self) { route in
                    switch route {
                    case .mission(let mission):
                        MissionThreadView(mission: mission, missions: missions, space: store)
                    }
                }
        }
        .task(id: store.connection.map(ObjectIdentifier.init)) {
            guard let connection = store.connection else { return }
            await missions.follow(connection)
        }
    }

    @ViewBuilder
    private var content: some View {
        let sections = missions.sections
        if !sections.isEmpty {
            List(sections) { section in
                Section(section.group.title) {
                    ForEach(section.missions) { mission in
                        NavigationLink(value: MissionsRoute.mission(mission)) {
                            MissionRow(
                                mission: mission,
                                companion: missions.companion(of: mission))
                        }
                        .listRowBackground(Color.kiroshi(.card))
                    }
                }
            }
            .listStyle(.insetGrouped)
        } else if missions.hasLoaded {
            ContentUnavailableView {
                Label("No missions yet", systemImage: "target")
            } description: {
                Text("Missions your companions open in this space show up here.")
            }
        } else if missions.hasFailed {
            ContentUnavailableView {
                Label("Couldn’t load missions", systemImage: "exclamationmark.triangle")
            } description: {
                Text("The missions are still there; only the list didn’t load.")
            } actions: {
                Button("Try Again") { missions.retry() }
            }
        } else if store.offlineSpace == nil {
            ProgressView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            Color.kiroshi(.background)
                .ignoresSafeArea()
        }
    }
}

#if DEBUG
    #Preview("4.1 Missions · list") {
        SignInRootView(model: .fixture(.missions))
    }

    #Preview("4.2 Mission · thread") {
        SignInRootView(model: .fixture(.missionThread))
    }

    #Preview("4.3 State · no missions") {
        SignInRootView(model: .fixture(.noMissions))
    }

    #Preview("4.4 State · host offline") {
        SignInRootView(model: .fixture(.missionsHostOffline))
    }
#endif
