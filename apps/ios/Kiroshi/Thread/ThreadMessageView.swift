import SwiftUI

struct ThreadMessageView: View {
    let message: ThreadMessage
    let soloCompanion: Companion?

    var body: some View {
        if !message.bubbles.isEmpty {
            VStack(spacing: 20) {
                if let separator = DaySeparator(label: message.dayLabel) {
                    separator
                }
                VStack(spacing: 4) {
                    MessageBubbles(
                        isYours: message.isYours, bubbles: message.bubbles,
                        author: message.author ?? soloCompanion,
                        showsAvatar: message.closesRun,
                        name: message.opensRun ? message.author?.name : nil, time: message.time,
                        accessibilityText: accessibilityText)
                    if !message.attachedFiles.isEmpty {
                        AttachedFiles(names: message.attachedFiles)
                    }
                }
            }
            .padding(.top, message.opensRun ? 20 : 4)
        }
    }

    private var accessibilityText: Text {
        guard let author = message.author else { return Text(message.rendered) }
        return Text("\(author.name), \(message.rendered)")
    }
}
