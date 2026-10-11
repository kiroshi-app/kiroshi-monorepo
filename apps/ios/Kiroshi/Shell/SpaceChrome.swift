import SwiftUI

struct SpaceChrome: ViewModifier {
    let store: SpaceStore
    let account: SignInModel
    let section: SpaceSection

    func body(content: Content) -> some View {
        content
            .safeAreaInset(edge: .top) {
                if let offlineSpace = store.offlineSpace {
                    HostOfflineLine(space: offlineSpace, email: store.email)
                        .padding(.horizontal, 12)
                        .padding(.bottom, 10)
                }
            }
            .navigationTitle(store.currentSpace?.name ?? "")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarTitleMenu {
                SpaceMenu(store: store)
            }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    SettingsButton(account: account, spaces: store.spaces, section: section) {
                        AccountInitial(initial: store.accountInitial)
                    }
                    .accessibilityLabel("Settings")
                }
                .sharedBackgroundVisibility(.hidden)
            }
    }
}

extension View {
    func spaceChrome(store: SpaceStore, account: SignInModel, section: SpaceSection) -> some View {
        modifier(SpaceChrome(store: store, account: account, section: section))
    }
}
