import SwiftUI

struct MissionsList: View {
    let missions: MissionsStore
    let space: SpaceStore
    var conversationId: String?
    let open: (Mission) -> Void

    var body: some View {
        let sections = missions.sections(in: conversationId)
        if !sections.isEmpty || (missions.hasLoaded && missions.nextPage != .complete) {
            List {
                ForEach(sections) { section in
                    Section {
                        ForEach(section.missions) { mission in
                            Button {
                                open(mission)
                            } label: {
                                MissionRow(
                                    mission: mission, companion: missions.companion(of: mission))
                            }
                            .listRowInsets(.vertical, 0)
                            .listRowSeparator(.hidden)
                            .onAppear {
                                missions.rowAppeared(mission, in: conversationId)
                            }
                        }
                    } header: {
                        MissionSectionHeader(title: section.group.title)
                            .listRowInsets(
                                EdgeInsets(top: 10, leading: 16, bottom: 4, trailing: 16))
                    }
                }
                NextPageRow(
                    nextPage: missions.nextPage, loadingLabel: "Loading more missions",
                    load: missions.loadMore)
            }
            .listStyle(.plain)
            .listSectionSpacing(0)
            .environment(\.defaultMinListHeaderHeight, 0)
            .refreshable {
                await missions.refresh()
            }
        } else if missions.hasLoaded {
            ScrollingUnavailable {
                ContentUnavailableView {
                    Label("No missions yet", systemImage: "flag")
                } description: {
                    Text(emptyDescription)
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
        } else if let spaceToJoin = space.spaceToJoin {
            JoinSpaceView(name: spaceToJoin.name)
        } else if space.offlineSpace == nil {
            ProgressView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            Color(.systemBackground)
                .ignoresSafeArea()
        }
    }

    private var emptyDescription: LocalizedStringKey {
        conversationId == nil
            ? "Missions your companions open in this space show up here."
            : "Missions opened in this conversation show up here."
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
