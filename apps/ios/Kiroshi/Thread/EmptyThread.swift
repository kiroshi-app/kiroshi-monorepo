import SwiftUI

struct EmptyThread: View {
    let heading: ThreadHeading

    var body: some View {
        ContentUnavailableView {
            Label {
                HStack(spacing: 6) {
                    Text(heading.title)
                    if let subtitle = heading.subtitle {
                        RoleBadge(role: subtitle)
                    }
                }
            } icon: {
                ConversationAvatarView(avatar: heading.avatar, size: .hero)
            }
        } description: {
            Text("Nothing here yet. Your first message starts the conversation.")
        }
    }
}

#if DEBUG
    private struct EmptyThreadsPreview: View {
        var body: some View {
            ScrollView {
                VStack(spacing: 24) {
                    let headings = ConversationsFixture.everywhereHeadings
                    ForEach(headings.indices, id: \.self) { index in
                        EmptyThread(heading: headings[index])
                    }
                }
            }
        }
    }

    #Preview("Empty thread · solo, no colour, red") {
        EmptyThreadsPreview()
    }

    #Preview("Empty thread · solo, no colour, red · dark") {
        EmptyThreadsPreview()
            .preferredColorScheme(.dark)
    }
#endif
