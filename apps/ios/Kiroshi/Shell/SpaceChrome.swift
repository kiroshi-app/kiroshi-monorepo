import SwiftUI

struct SpaceChrome: ViewModifier {
    let store: SpaceStore
    let account: SignInModel
    let section: SpaceSection

    func body(content: Content) -> some View {
        content
            .safeAreaBar(edge: .top) {
                if let offlineSpace = store.offlineSpace {
                    HostOfflineLine(space: offlineSpace, email: store.email)
                        .padding(.horizontal, 12)
                        .padding(.bottom, 10)
                }
            }
            .scrollEdgeEffectStyle(.soft, for: .top)
            .navigationTitle(store.currentSpace?.name ?? "")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    SettingsButton(account: account, spaces: store.spaces, section: section) {
                        AccountInitial(initial: store.accountInitial)
                    }
                    .accessibilityLabel("Settings")
                }
                ToolbarSpacer(.fixed, placement: .topBarLeading)
                ToolbarItem(placement: .topBarLeading) {
                    SpaceSelector(store: store, invitations: account.invitations)
                }
            }
            .toolbar(removing: .title)
    }
}

extension View {
    func spaceChrome(store: SpaceStore, account: SignInModel, section: SpaceSection) -> some View {
        modifier(SpaceChrome(store: store, account: account, section: section))
    }
}

#if DEBUG
    #Preview("Header · Conversations · dark") {
        SignInRootView(model: .fixture(.home))
            .preferredColorScheme(.dark)
    }

    #Preview("Header · Missions · dark") {
        SignInRootView(model: .fixture(.missions))
            .preferredColorScheme(.dark)
    }

    #Preview("Header · host offline") {
        SignInRootView(model: .fixture(.conversationsHostOffline))
    }
#endif
