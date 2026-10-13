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

    @ViewBuilder
    private var content: some View {
        let sections = missions.sections
        if !sections.isEmpty {
            List(sections) { section in
                Section {
                    ForEach(section.missions) { mission in
                        Button {
                            path.append(.mission(mission))
                        } label: {
                            MissionRow(mission: mission, companion: missions.companion(of: mission))
                        }
                        .listRowInsets(.vertical, 0)
                        .listRowSeparator(.hidden)
                    }
                } header: {
                    MissionSectionHeader(title: section.group.title)
                        .listRowInsets(EdgeInsets(top: 10, leading: 16, bottom: 4, trailing: 16))
                }
            }
            .listStyle(.plain)
            .listSectionSpacing(0)
            .environment(\.defaultMinListHeaderHeight, 0)
        } else if missions.hasLoaded {
            ScrollingUnavailable {
                ContentUnavailableView {
                    Label("No missions yet", systemImage: "flag")
                } description: {
                    Text("Missions your companions open in this space show up here.")
                }
            }
        } else if missions.hasFailed {
            ScrollingUnavailable {
                ContentUnavailableView {
                    Label("Couldn’t load missions", systemImage: "exclamationmark.triangle")
                } description: {
                    Text("The missions are still there; only the list didn’t load.")
                } actions: {
                    Button("Try Again") { missions.retry() }
                }
            }
        } else if store.offlineSpace == nil {
            ProgressView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            Color(.systemBackground)
                .ignoresSafeArea()
        }
    }
}

private struct ScrollingUnavailable<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        ScrollView {
            content
        }
        .defaultScrollAnchor(.center, for: .alignment)
        .scrollBounceBehavior(.basedOnSize)
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
