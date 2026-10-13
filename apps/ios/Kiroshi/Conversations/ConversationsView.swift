import SwiftUI

struct ConversationsView: View {
    let space: SpaceStore
    @State private var store: ConversationsStore

    init(space: SpaceStore) {
        self.space = space
        #if DEBUG
            let opening = ConversationsFixture.opening
        #else
            let opening: Companion.ID? = nil
        #endif
        _store = State(initialValue: ConversationsStore(work: space.work, opening: opening))
    }

    var body: some View {
        content
            .task(id: space.connection.map(ObjectIdentifier.init)) {
                guard let connection = space.connection else { return }
                await store.follow(connection)
            }
            .navigationDestination(item: $store.opened) { subject in
                ThreadView(subject: subject, space: space)
            }
            .toolbarVisibility(store.opened == nil ? .visible : .hidden, for: .tabBar)
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
            .sheet(isPresented: $store.isPickingCompanions, onDismiss: store.stopPicking) {
                NewConversationSheet(
                    companions: store.companions, creation: store.creation,
                    create: { store.createGroup(with: $0) }, cancel: store.stopPicking)
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
                Text("Check that your Mac is on, then try again.")
            } actions: {
                Button("Try Again") {
                    store.reload()
                }
                .buttonStyle(.bordered)
            }
        case .loaded where store.summaries.isEmpty:
            ContentUnavailableView {
                Label {
                    Text("No companions yet")
                } icon: {
                    FlatHexagon(isDashed: true)
                        .frame(width: 56, height: 56)
                        .accessibilityHidden(true)
                }
            } description: {
                Text("Add one to \(space.currentSpace?.name ?? "") on your Mac. It shows up here.")
            }
        case .loaded:
            List(store.summaries) { summary in
                Button {
                    store.opened = summary.subject
                } label: {
                    ConversationRow(summary: summary)
                }
                .listRowInsets(.vertical, 0)
                .listRowSeparator(.hidden, edges: .top)
                .listRowSeparatorTint(Color(.separator))
            }
            .listStyle(.plain)
            .refreshable {
                await store.refresh()
            }
        }
    }
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
