import SwiftUI

enum SpaceSection {
    case conversations
    case missions

    var title: LocalizedStringKey {
        switch self {
        case .conversations: "Conversations"
        case .missions: "Missions"
        }
    }

    var systemImage: String {
        switch self {
        case .conversations: "bubble.left.and.bubble.right"
        case .missions: "flag"
        }
    }
}

struct SpaceScreen: View {
    let store: SpaceStore
    let account: SignInModel
    let section: SpaceSection

    var body: some View {
        NavigationStack {
            content
                .spaceChrome(store: store, account: account, section: section)
        }
    }

    @ViewBuilder private var content: some View {
        switch section {
        case .conversations:
            ConversationsView(space: store)
        case .missions:
            ContentUnavailableView(section.title, systemImage: section.systemImage)
        }
    }
}

struct AccountInitial: View {
    let initial: String

    var body: some View {
        Text(initial)
            .font(.headline)
            .foregroundStyle(Color.kiroshi(.foreground))
    }
}
