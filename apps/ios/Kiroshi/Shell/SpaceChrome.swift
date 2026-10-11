import SwiftUI

struct SpaceChrome: ViewModifier {
    let store: SpaceStore
    let account: SignInModel

    func body(content: Content) -> some View {
        content
            .safeAreaInset(edge: .top) {
                if let offlineSpace = store.offlineSpace {
                    HostOfflineLine(space: offlineSpace, email: store.email)
                        .padding(.horizontal)
                        .padding(.top, 8)
                }
            }
            .navigationTitle(store.currentSpace?.name ?? "")
            .navigationBarTitleDisplayMode(.large)
            .toolbarTitleMenu {
                SpaceMenu(store: store)
            }
            .toolbar {
                ToolbarItem(placement: .largeTitle) {
                    SpaceTitleMenu(store: store)
                }
                ToolbarItem(placement: .topBarLeading) {
                    SettingsButton(account: account, spaces: store.spaces, section: .missions) {
                        AccountInitial(initial: store.accountInitial)
                    }
                    .accessibilityLabel("Settings")
                }
                .sharedBackgroundVisibility(.hidden)
            }
    }
}

struct SpaceTitleMenu: View {
    let store: SpaceStore
    @ScaledMetric(relativeTo: .largeTitle) private var chevronSide: CGFloat = 24

    var body: some View {
        Menu {
            SpaceMenu(store: store)
        } label: {
            HStack(spacing: 6) {
                Text(store.currentSpace?.name ?? "")
                    .font(.largeTitle.bold())
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                Image(systemName: "chevron.down")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.secondary)
                    .frame(width: chevronSide, height: chevronSide)
                    .background(Color(.systemGray5), in: .circle)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityHint("Shows your spaces")
    }
}

extension View {
    func spaceChrome(store: SpaceStore, account: SignInModel) -> some View {
        modifier(SpaceChrome(store: store, account: account))
    }
}
