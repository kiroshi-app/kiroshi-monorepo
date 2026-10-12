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
                switch heading.avatar {
                case .companion(let companion):
                    CompanionAvatar(companion, size: .hero)
                case .group(let group):
                    GroupAvatar(group: group, size: .hero)
                }
            }
        } description: {
            Text("Nothing here yet. Your first message starts the conversation.")
        }
    }
}
