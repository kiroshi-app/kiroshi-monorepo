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
            .navigationBarTitleDisplayMode(.inline)
            .toolbarTitleMenu {
                SpaceMenu(store: store)
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    SettingsButton(account: account, spaces: store.spaces, section: .missions) {
                        Label("Settings", systemImage: "gearshape")
                    }
                }
            }
    }
}

extension View {
    func spaceChrome(store: SpaceStore, account: SignInModel) -> some View {
        modifier(SpaceChrome(store: store, account: account))
    }
}
