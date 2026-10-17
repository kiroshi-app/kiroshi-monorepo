import SwiftUI

struct EmptyThread: View {
    let heading: ThreadHeading
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        ScrollView {
            ContentUnavailableView {
                Label {
                    titleLayout {
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
        .defaultScrollAnchor(.center, for: .alignment)
        .scrollBounceBehavior(.basedOnSize)
    }

    private var titleLayout: AnyLayout {
        dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(spacing: 6))
            : AnyLayout(HStackLayout(spacing: 6))
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
