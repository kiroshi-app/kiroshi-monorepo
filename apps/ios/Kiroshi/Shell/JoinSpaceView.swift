import SwiftUI

struct JoinSpaceView: View {
    let name: String

    var body: some View {
        ScrollView {
            ContentUnavailableView {
                Label("Join this Space", systemImage: "person.badge.key")
            } description: {
                Text(
                    "This iPhone doesn’t have the key to \(name) yet. Open an invitation to \(name) on this iPhone to join."
                )
            }
        }
        .defaultScrollAnchor(.center, for: .alignment)
        .scrollBounceBehavior(.basedOnSize)
    }
}

#if DEBUG
    #Preview("Join this Space") {
        SignInRootView(model: .fixture(.joinSpace))
    }
#endif
