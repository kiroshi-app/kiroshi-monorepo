import SwiftUI

struct ConversationMissionsScreen: View {
    let conversation: ConversationMissions
    let missions: MissionsStore
    let space: SpaceStore
    let open: (Mission) -> Void

    var body: some View {
        MissionsList(
            missions: missions, space: space, conversationId: conversation.conversationId,
            open: open
        )
        .background(Color(.systemBackground))
        .navigationTitle("Missions")
        .navigationSubtitle(conversation.title)
        .navigationBarTitleDisplayMode(.inline)
    }
}

#if DEBUG
    #Preview("Conversation missions") {
        SignInRootView(model: .fixture(.conversationMissions))
    }

    #Preview("Conversation missions · empty") {
        SignInRootView(model: .fixture(.conversationNoMissions))
    }

    #Preview("Conversation missions · dark") {
        SignInRootView(model: .fixture(.conversationMissions))
            .preferredColorScheme(.dark)
    }
#endif
