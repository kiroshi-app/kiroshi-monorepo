import SwiftUI

struct ShellView: View {
    let store: SpaceStore
    let account: SignInModel
    @Environment(\.scenePhase) private var scenePhase
    @State private var tab = SpaceSection.atLaunch

    var body: some View {
        TabView(selection: $tab) {
            Tab(
                "Conversations", systemImage: "bubble.left.and.bubble.right.fill",
                value: .conversations
            ) {
                ConversationsView(space: store, account: account)
                    .tint(.accentColor)
            }
            Tab(value: SpaceSection.missions) {
                MissionsScreen(store: store, account: account)
                    .tint(.accentColor)
            } label: {
                Label("Missions", systemImage: tab == .missions ? "flag.fill" : "flag")
                    .environment(\.symbolVariants, .none)
            }
        }
        .tint(.primary)
        .environment(store.pictures)
        .environment(account.consent)
        .task(id: RelayFollow(spaceId: store.currentSpaceId, isInForeground: isInForeground)) {
            guard isInForeground else { return }
            await store.follow()
        }
        .task(id: isInForeground) {
            guard isInForeground else { return }
            await store.refreshSpaces()
        }
        .task(id: isInForeground) {
            guard isInForeground, let requests = account.requests else { return }
            await requests.watch()
        }
        .sheet(item: askingDevice) { request in
            if let requests = account.requests {
                DeviceRequestSheet(requests: requests, request: request)
            }
        }
    }

    private var askingDevice: Binding<DeviceRequest?> {
        Binding {
            account.requests?.asking
        } set: { request in
            if request == nil {
                account.requests?.dismiss()
            }
        }
    }

    private var isInForeground: Bool {
        scenePhase != .background
    }
}

extension SpaceSection {
    @MainActor static var atLaunch: SpaceSection {
        #if DEBUG
            if SignInFixture.opened?.opensOnMissions == true { return .missions }
        #endif
        return .conversations
    }
}

private struct RelayFollow: Hashable {
    let spaceId: Space.ID
    let isInForeground: Bool
}
