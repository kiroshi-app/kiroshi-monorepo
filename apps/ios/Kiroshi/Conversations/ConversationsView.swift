import SwiftUI

struct ConversationsView: View {
    let space: SpaceStore
    let account: SignInModel
    @State private var store: ConversationsStore
    @State private var missions = MissionsStore()

    init(space: SpaceStore, account: SignInModel) {
        self.space = space
        self.account = account
        #if DEBUG
            let opening = ConversationsFixture.opening
        #else
            let opening: Companion.ID? = nil
        #endif
        _store = State(initialValue: ConversationsStore(work: space.work, opening: opening))
    }

    var body: some View {
        NavigationStack(path: $store.path) {
            content
                .spaceChrome(store: space, account: account, section: .conversations)
                .task(id: space.connection.map(ObjectIdentifier.init)) {
                    guard let connection = space.connection else { return }
                    await store.follow(connection)
                }
                .navigationDestination(for: ConversationsRoute.self) { route in
                    destination(route)
                }
                .toolbarVisibility(store.path.isEmpty ? .visible : .hidden, for: .tabBar)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            store.pickCompanions()
                        } label: {
                            Image(systemName: "plus")
                        }
                        .accessibilityLabel("New Conversation")
                        .disabled(store.phase != .loaded)
                    }
                }
                .alert(
                    pinFailureTitle, isPresented: $store.isShowingPinFailure,
                    presenting: store.pinFailure
                ) { _ in
                    Button("OK") {}
                } message: { failure in
                    switch failure.change {
                    case .pin:
                        Text(
                            "Check that the computer where Kiroshi runs is on, then swipe the row again."
                        )
                    case .unpin:
                        Text(
                            "Check that the computer where Kiroshi runs is on, then touch and hold \(failure.title) again."
                        )
                    }
                }
                .sheet(isPresented: $store.isPickingCompanions, onDismiss: store.stopPicking) {
                    NewConversationSheet(
                        companions: store.companions, creation: store.creation,
                        create: { store.createGroup(with: $0) }, cancel: store.stopPicking)
                }
        }
        .task(
            id: MissionsFollow(
                connection: space.connection.map(ObjectIdentifier.init),
                isShown: store.showsMissions)
        ) {
            guard store.showsMissions, let connection = space.connection else { return }
            await missions.follow(connection)
        }
    }

    private var pinFailureTitle: Text {
        switch store.pinFailure?.change {
        case .pin: Text("Couldn’t pin \(store.pinFailure?.title ?? "").")
        case .unpin: Text("Couldn’t unpin \(store.pinFailure?.title ?? "").")
        case nil: Text(verbatim: "")
        }
    }

    @ViewBuilder private func destination(_ route: ConversationsRoute) -> some View {
        switch route {
        case .conversation(let subject):
            ThreadView(subject: subject, space: space) { store.path.append(.missions($0)) }
        case .missions(let conversation):
            ConversationMissionsScreen(conversation: conversation, missions: missions, space: space)
            {
                store.path.append(.mission($0))
            }
        case .mission(let mission):
            MissionThreadView(mission: mission, missions: missions, space: space)
        }
    }

    @ViewBuilder private var content: some View {
        switch store.phase {
        case .loading where space.offlineSpace != nil:
            Color(.systemBackground)
        case .loading:
            List(ConversationSummary.placeholders) { summary in
                ConversationRow(summary: summary)
                    .listRowInsets(.vertical, 0)
                    .listRowSeparator(.hidden, edges: .top)
                    .listRowSeparatorTint(Color(.separator))
            }
            .listStyle(.plain)
            .redacted(reason: .placeholder)
            .allowsHitTesting(false)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Loading companions")
        case .failed:
            ContentUnavailableView {
                Label("Couldn’t load your companions.", systemImage: "exclamationmark.triangle")
            } description: {
                Text("Check that the computer where Kiroshi runs is on, then try again.")
            } actions: {
                Button("Try Again") {
                    store.reload()
                }
                .buttonStyle(.bordered)
            }
        case .loaded where store.summaries.isEmpty && store.pinned.isEmpty:
            ContentUnavailableView {
                Label {
                    Text("No companions yet")
                } icon: {
                    FlatHexagon(isDashed: true)
                        .frame(width: 56, height: 56)
                        .accessibilityHidden(true)
                }
            } description: {
                Text(
                    "Add one to \(space.currentSpace?.name ?? "") on the computer where Kiroshi runs. It shows up here."
                )
            }
        case .loaded:
            List {
                if !store.pinned.isEmpty {
                    PinnedStrip(pinned: store.pinned) {
                        store.opened = $0
                    } unpin: {
                        store.unpin($0)
                    }
                    .alignmentGuide(.listRowSeparatorLeading) { _ in 0 }
                    .alignmentGuide(.listRowSeparatorTrailing) { $0[.trailing] }
                    .listRowInsets(EdgeInsets())
                    .listRowSeparator(.hidden, edges: .top)
                    .listRowSeparatorTint(Color(.systemGray5))
                }
                ForEach(store.summaries) { summary in
                    Button {
                        store.opened = summary.subject
                    } label: {
                        ConversationRow(summary: summary)
                    }
                    .listRowInsets(.vertical, 0)
                    .listRowSeparator(.hidden, edges: .top)
                    .listRowSeparatorTint(Color(.separator))
                    .swipeActions(edge: .leading) {
                        if store.canPin {
                            Button("Pin", systemImage: "pin") {
                                store.pin(summary.id)
                            }
                            .tint(.yellow)
                        }
                    }
                    .onAppear {
                        store.rowAppeared(summary.id)
                    }
                }
                NextPageRow(
                    nextPage: store.nextPage, loadingLabel: "Loading more conversations",
                    load: store.loadMore)
            }
            .listStyle(.plain)
            .refreshable {
                await store.refresh()
            }
        }
    }
}

private struct MissionsFollow: Hashable {
    let connection: ObjectIdentifier?
    let isShown: Bool
}

#if DEBUG
    #Preview("2.1 Accueil · conversations") {
        SignInRootView(model: .fixture(.home))
    }

    #Preview("2.2 Space · menu open") {
        SignInRootView(model: .fixture(.homeMenu))
    }

    #Preview("2.3 State · no companion") {
        SignInRootView(model: .fixture(.noCompanion))
    }

    #Preview("2.4 State · loading") {
        SignInRootView(model: .fixture(.loadingCompanions))
    }

    #Preview("2.5 State · host offline") {
        SignInRootView(model: .fixture(.conversationsHostOffline))
    }

    #Preview("2.6 State · agent working") {
        SignInRootView(model: .fixture(.workingList))
    }

    #Preview("3.2 Thread") {
        SignInRootView(model: .fixture(.thread))
    }

    #Preview("3.5 State · empty thread") {
        SignInRootView(model: .fixture(.emptyThread))
    }

    #Preview("3.8 State · agent working (thread)") {
        SignInRootView(model: .fixture(.workingThread))
    }

    #Preview("Group thread · two companions") {
        SignInRootView(model: .fixture(.groupThread))
    }

    #Preview("Group thread · two companions working") {
        SignInRootView(model: .fixture(.groupWorking))
    }

    #Preview("Group thread · failure") {
        SignInRootView(model: .fixture(.groupFailed))
    }

    #Preview("Group thread · mention picker") {
        SignInRootView(model: .fixture(.groupMention))
    }
#endif
