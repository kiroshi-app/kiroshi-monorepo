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
                        writer: message.writer, bubbles: message.bubbles,
                        companion: message.author ?? soloCompanion, initials: message.initials,
                        showsAvatar: message.closesRun,
                        name: message.opensRun ? message.authorName : nil,
                        speaker: message.authorName, time: message.time,
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
        guard let name = message.authorName else { return Text(message.rendered) }
        return Text("\(name), \(message.rendered)")
    }
}
