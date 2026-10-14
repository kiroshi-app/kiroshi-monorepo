import SwiftUI

struct OlderMessagesRow: View {
    let isFailed: Bool
    let oldestId: ThreadMessage.ID?
    let load: () -> Void

    var body: some View {
        Group {
            if isFailed {
                VStack(spacing: 8) {
                    Text("Couldn’t load earlier messages. Try again.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                    Button("Try Again", action: load)
                        .buttonStyle(.bordered)
                }
            } else {
                ProgressView()
                    .accessibilityLabel("Loading earlier messages")
                    .task(id: oldestId) {
                        load()
                    }
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 40)
        .padding(.bottom, 12)
    }
}
