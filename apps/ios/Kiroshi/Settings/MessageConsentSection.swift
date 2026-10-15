import SwiftUI

struct MessageConsentSection: View {
    let open: (KiroshiPage) -> Void
    @Environment(MessageConsent.self) private var consent

    var body: some View {
        Section {
            Toggle("Send messages to the agent", isOn: isSending)
                .tint(Color(.systemGreen))
                .disabled(!consent.hasAgreed)
            Button {
                open(.privacy)
            } label: {
                HStack {
                    Text(KiroshiPage.privacy.title)
                    Spacer()
                    Image(systemName: "arrow.up.right")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(.tertiary)
                        .accessibilityHidden(true)
                }
            }
            .tint(.primary)
        } header: {
            Text("Where your messages go")
                .font(.footnote.weight(.semibold))
                .textCase(nil)
        } footer: {
            Text(
                "Messages you send here go to your computer through Kiroshi’s relay. Your computer passes them to the agent, which sends them to the model provider your computer uses. Turn this off and nothing leaves this iPhone until you agree again."
            )
        }
    }

    private var isSending: Binding<Bool> {
        Binding {
            consent.hasAgreed
        } set: { isOn in
            if !isOn { consent.withdraw() }
        }
    }
}
