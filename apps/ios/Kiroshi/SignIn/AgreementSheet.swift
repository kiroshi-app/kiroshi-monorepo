import SwiftUI

struct AgreementSheet: View {
    static let privacyURL = URL(string: "https://kiroshi.app/privacy")!

    let model: SignInModel

    var body: some View {
        ScrollView { disclosure }
            .defaultScrollAnchor(.center, for: .alignment)
            .scrollBounceBehavior(.basedOnSize)
            .safeAreaBar(edge: .bottom) {
                VStack(spacing: 4) {
                    Button("I agree", action: model.agree)
                        .primaryAction()
                    Button("Not now", action: model.signOut)
                        .fontWeight(.medium)
                        .plainAction()
                }
                .bottomActions()
            }
            .interactiveDismissDisabled()
    }

    private var disclosure: some View {
        VStack(spacing: 14) {
            Text("Where your messages go")
                .font(.title2.bold())
                .accessibilityAddTraits(.isHeader)
            Text(
                "Messages you send here go to your Mac through Kiroshi’s relay. Your Mac passes them to the agent, which sends them to the model provider your Mac uses."
            )
            .foregroundStyle(.secondary)
            Text("Nothing is sent until you agree.")
                .foregroundStyle(.secondary)
            Link("Privacy Policy", destination: Self.privacyURL)
                .fontWeight(.medium)
                .padding(.top, 6)
        }
        .multilineTextAlignment(.center)
        .padding(.horizontal, 40)
        .padding(.vertical, 24)
        .frame(maxWidth: .infinity)
    }
}

#if DEBUG
    #Preview("Where your messages go") {
        SignInRootView(model: .fixture(.agreement))
    }
#endif
