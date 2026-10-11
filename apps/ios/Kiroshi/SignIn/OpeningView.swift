import SwiftUI

struct OpeningView: View {
    let model: SignInModel

    var body: some View {
        VStack(spacing: 24) {
            Image("Hexagon")
                .resizable()
                .scaledToFit()
                .frame(width: 88, height: 80)
                .accessibilityLabel("Kiroshi")
            Text("Your companions, away from your Mac.")
                .font(.title2.weight(.semibold))
                .multilineTextAlignment(.center)
        }
        .padding(.horizontal, 40)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .signInGround()
        .safeAreaBar(edge: .bottom) {
            Button("Sign in", action: model.start)
                .primaryAction()
                .bottomActions()
        }
        .toolbarVisibility(.hidden, for: .navigationBar)
    }
}

#if DEBUG
    #Preview("1.1 Opening") {
        SignInRootView(model: .fixture(.opening))
    }
#endif
