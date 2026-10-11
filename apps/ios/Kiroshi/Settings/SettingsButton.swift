import SwiftUI

struct SettingsButton<Label: View>: View {
    let account: SignInModel
    let spaces: [Space]
    let label: Label
    @State private var isPresented: Bool

    init(account: SignInModel, spaces: [Space], @ViewBuilder label: () -> Label) {
        self.account = account
        self.spaces = spaces
        self.label = label()
        _isPresented = State(initialValue: Self.isPresentedAtLaunch)
    }

    var body: some View {
        Button {
            isPresented = true
        } label: {
            label
        }
        .sheet(isPresented: $isPresented) {
            NavigationStack {
                SettingsView(model: account, spaces: spaces)
            }
        }
    }

    private static var isPresentedAtLaunch: Bool {
        #if DEBUG
            SignInFixture.opened?.opensSettings == true
        #else
            false
        #endif
    }
}
