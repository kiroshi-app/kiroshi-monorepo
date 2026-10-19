import SwiftUI

struct JoinSpaceView: View {
    let name: String

    var body: some View {
        ScrollView {
            ContentUnavailableView {
                Label("Waiting for the key to \(name)", systemImage: "person.badge.key")
            } description: {
                Text(
                    "The computer where \(name) runs sends this iPhone its key once Kiroshi is open there."
                )
            }
        }
        .defaultScrollAnchor(.center, for: .alignment)
        .scrollBounceBehavior(.basedOnSize)
    }
}

#if DEBUG
    #Preview("Waiting for the key") {
        SignInRootView(model: .fixture(.joinSpace))
    }
#endif
