import SwiftUI

enum SpaceSection {
    case conversations
    case missions
}

struct AccountInitial: View {
    let initial: String

    var body: some View {
        Text(initial)
            .font(.headline)
            .foregroundStyle(Color.kiroshi(.foreground))
    }
}
