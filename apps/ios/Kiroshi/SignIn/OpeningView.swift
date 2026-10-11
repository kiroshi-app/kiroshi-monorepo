import SwiftUI

struct OpeningView: View {
    let model: SignInModel

    var body: some View {
        VStack(spacing: 24) {
            RoundedRectangle(cornerRadius: 22)
                .fill(Color.kiroshi(.card))
                .frame(width: 96, height: 96)
                .overlay {
                    Image(systemName: "hare.fill")
                        .font(.largeTitle)
                        .foregroundStyle(Color.kiroshi(.mutedForeground))
                }
                .accessibilityHidden(true)
            Text("Your companions, away from your Mac.")
                .font(.title2.weight(.semibold))
                .multilineTextAlignment(.center)
                .foregroundStyle(Color.kiroshi(.foreground))
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
