import SwiftUI

struct ThreadEntryView: View {
    let entry: ThreadEntry
    let soloCompanion: Companion?

    var body: some View {
        switch entry {
        case .message(let message) where !message.bubbles.isEmpty:
            VStack(spacing: 20) {
                if let dayLabel = message.dayLabel {
                    DaySeparator(label: dayLabel)
                }
                VStack(spacing: 4) {
                    MessageBubbles(
                        isYours: message.isYours, bubbles: message.bubbles,
                        author: message.author ?? soloCompanion,
                        showsAvatar: message.closesRun,
                        name: message.opensRun ? message.author?.name : nil, time: message.time,
                        accessibilityText: accessibilityText(of: message))
                    if !message.attachedFiles.isEmpty {
                        AttachedFiles(names: message.attachedFiles)
                    }
                }
            }
            .padding(.top, message.opensRun ? 20 : 4)
        case .message:
            EmptyView()
        case .activities(let group):
            ActivityGroupView(group: group)
                .padding(.top, 20)
        }
    }

    private func accessibilityText(of message: ThreadMessage) -> Text {
        guard let author = message.author else { return Text(message.rendered) }
        return Text("\(author.name), \(message.rendered)")
    }
}
