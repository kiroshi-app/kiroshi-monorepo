import SwiftUI

struct ThreadView: View {
    let space: SpaceStore
    let openMissions: (ConversationMissions) -> Void
    @State private var thread: ThreadStore
    @Environment(\.dismiss) private var dismiss

    init(
        subject: ConversationSubject, space: SpaceStore,
        openMissions: @escaping (ConversationMissions) -> Void
    ) {
        self.space = space
        self.openMissions = openMissions
        #if DEBUG
            let draft = ConversationsFixture.draft
        #else
            let draft = ""
        #endif
        _thread = State(
            initialValue: ThreadStore(
                subject: subject, work: space.work, authorship: space.authorship, draft: draft))
    }

    var body: some View {
        ThreadScreen(model: thread, heading: thread.heading, space: space)
            .onChange(of: space.currentSpaceId) {
                dismiss()
            }
            .onChange(of: thread.isDeleted) {
                dismiss()
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Missions", systemImage: "flag") {
                        thread.missions.map(openMissions)
                    }
                    .disabled(thread.missions == nil)
                }
            }
            #if DEBUG
                .task(id: thread.missions) {
                    guard ConversationsFixture.opensMissions, let missions = thread.missions
                    else { return }
                    ConversationsFixture.opensMissions = false
                    openMissions(missions)
                }
            #endif
    }
}

extension ThreadStore {
    var missions: ConversationMissions? {
        conversationId.map { ConversationMissions(conversationId: $0, title: subject.title) }
    }

    var heading: ThreadHeading {
        let working = Set(workingCompanions.map(\.id))
        return switch subject {
        case .companion(let companion):
            ThreadHeading(
                avatar: .companion(companion), working: working, title: companion.name,
                subtitle: companion.role)
        case .group(let group):
            ThreadHeading(avatar: .group(group), working: working, title: group.name)
        }
    }
}

#if DEBUG
    #Preview("3.1 Thread · conversation") {
        SignInRootView(model: .fixture(.thread))
    }

    #Preview("3.2 State · empty thread") {
        SignInRootView(model: .fixture(.emptyThread))
    }

    #Preview("3.3 State · agent working") {
        SignInRootView(model: .fixture(.workingThread))
    }

    #Preview("State · at work after its own reply") {
        SignInRootView(model: .fixture(.workingAfterReply))
    }

    #Preview("3.4 State · host offline") {
        SignInRootView(model: .fixture(.threadHostOffline))
    }

    #Preview("3.5 Gesture · swipe left shows times") {
        SignInRootView(model: .fixture(.swipedThread))
    }

    #Preview("State · thread loading") {
        SignInRootView(model: .fixture(.slowThread))
    }

    #Preview("State · group thread loading") {
        SignInRootView(model: .fixture(.slowGroup))
    }

    #Preview("Group thread") {
        SignInRootView(model: .fixture(.groupThread))
    }

    #Preview("Long companion name") {
        SignInRootView(model: .fixture(.longName))
    }

    #Preview("Long group name") {
        SignInRootView(model: .fixture(.longGroup))
    }
#endif
