import SwiftUI

struct MarkdownBlocksView: View {
    let blocks: [MarkdownBlock]
    var messageText = ""
    var insetsText = false
    var speaker: String?
    var time = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(blocks.indices, id: \.self) { index in
                MarkdownBlockView(
                    block: blocks[index], messageText: messageText,
                    speaker: index == 0 ? speaker : nil, time: index == 0 ? time : ""
                )
                .padding(.horizontal, insetsText && !blocks[index].isCard ? 8 : 0)
                .padding(
                    .top,
                    index == 0
                        ? 0 : MarkdownBlock.spacing(between: blocks[index - 1], and: blocks[index]))
            }
        }
    }
}

private struct MarkdownBlockView: View {
    let block: MarkdownBlock
    let messageText: String
    let speaker: String?
    let time: String

    var body: some View {
        switch block {
        case .heading(let level, let inline):
            InlineText(inline: inline, codeFont: nil, strongWeight: nil)
                .font(Self.font(ofHeading: level))
                .foregroundStyle(level >= 6 ? Color.secondary : Color.primary)
                .accessibilityAddTraits(.isHeader)
                .modifier(MessageOpening(speaker: speaker, time: time))
        case .paragraph(let inline):
            InlineText(inline: inline)
                .font(.body)
                .modifier(MessageOpening(speaker: speaker, time: time))
        case .list(let list):
            MarkdownListView(list: list, messageText: messageText)
        case .quote(let blocks):
            MarkdownBlocksView(
                blocks: blocks, messageText: messageText, speaker: speaker, time: time
            )
            .padding(.leading, 13)
            .background(alignment: .leading) {
                RoundedRectangle(cornerRadius: 2)
                    .fill(Color(.tertiaryLabel))
                    .frame(width: 3)
            }
        case .code(let code):
            CodeBlockCard(code: code)
        case .table(let table):
            TableCard(table: table, messageText: messageText)
        case .rule:
            Rectangle()
                .fill(Color(.separator))
                .frame(height: 1)
                .accessibilityHidden(true)
        }
    }

    private static func font(ofHeading level: Int) -> Font {
        switch level {
        case 1: .title2.bold()
        case 2: .title3.weight(.semibold)
        case 3: .headline
        case 4: .subheadline.weight(.semibold)
        default: .footnote.weight(.semibold)
        }
    }
}

private struct MessageOpening: ViewModifier {
    let speaker: String?
    let time: String

    func body(content: Content) -> some View {
        if let speaker {
            content
                .accessibilityLabel { label in
                    Text(speaker)
                    label
                }
                .accessibilityValue(time)
        } else {
            content.accessibilityValue(time)
        }
    }
}

private struct MarkdownListView: View {
    let list: MarkdownList
    let messageText: String

    @ScaledMetric(relativeTo: .body) private var markerWidth: CGFloat = 26
    @ScaledMetric(relativeTo: .body) private var numberWidth: CGFloat = 20
    @ScaledMetric(relativeTo: .body) private var checkWidth: CGFloat = 22

    var body: some View {
        VStack(alignment: .leading, spacing: list.isTaskList ? 6 : 4) {
            ForEach(list.items.indices, id: \.self) { index in
                item(list.items[index])
            }
        }
    }

    private func item(_ item: MarkdownList.Item) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline, spacing: 0) {
                marker(item.marker)
                if let lead = item.lead {
                    InlineText(inline: lead)
                        .font(.body)
                }
            }
            .accessibilityElement(children: .combine)
            .accessibilityRemoveTraits(.isSelected)
            if !item.rest.isEmpty {
                MarkdownBlocksView(blocks: item.rest, messageText: messageText)
                    .padding(.leading, indent(of: item.marker))
            }
        }
    }

    private func indent(of marker: MarkdownList.Marker) -> CGFloat {
        if case .task = marker { checkWidth + 8 } else { markerWidth }
    }

    @ViewBuilder private func marker(_ marker: MarkdownList.Marker) -> some View {
        switch marker {
        case .bullet(let depth):
            Text(verbatim: ["•", "◦", "▪\u{FE0E}"][min(depth, 2)])
                .font(depth >= 2 ? .footnote : .body)
                .foregroundStyle(.secondary)
                .padding(.leading, 8)
                .frame(width: markerWidth, alignment: .leading)
                .accessibilityLabel(marker.spoken)
        case .number(let label):
            Text(verbatim: label)
                .font(.body)
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .fixedSize()
                .frame(minWidth: numberWidth, alignment: .trailing)
                .padding(.trailing, markerWidth - numberWidth)
        case .task(let isDone):
            Image(systemName: isDone ? "checkmark.circle.fill" : "circle")
                .symbolRenderingMode(isDone ? .palette : .monochrome)
                .foregroundStyle(
                    isDone ? Color.white : Color(.tertiaryLabel), Color(.systemGray)
                )
                .font(.body)
                .frame(width: checkWidth)
                .padding(.trailing, 8)
                .accessibilityLabel(marker.spoken)
        }
    }
}

#if DEBUG
    private struct MarkdownPreview: View {
        let replies: [String]
        var authors = [Companion(id: "atlas-3", name: "Atlas")]

        var body: some View {
            ScrollView {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(replies.indices, id: \.self) { index in
                        BubbleText(
                            bubble: Bubble(
                                id: "preview-\(index)", text: AttributedString(replies[index]),
                                markdown: MarkdownMessage(replies[index], among: authors),
                                position: Bubble.Position(index: index, count: replies.count)),
                            isYours: false)
                    }
                }
                .padding(.leading, 64)
                .padding(.trailing, 64)
                .padding(.vertical, 24)
            }
        }
    }

    #Preview("1 Headings") {
        MarkdownPreview(replies: [MarkdownFixture.headings])
    }

    #Preview("2 Paragraph, inline marks, link") {
        MarkdownPreview(replies: [MarkdownFixture.paragraph])
    }

    #Preview("3 Lists") {
        MarkdownPreview(
            replies: [MarkdownFixture.bullets, MarkdownFixture.numbers, MarkdownFixture.tasks])
    }

    #Preview("4 Blockquote and rule") {
        MarkdownPreview(replies: [MarkdownFixture.quote])
    }

    #Preview("5 Inline code") {
        MarkdownPreview(replies: [MarkdownFixture.inlineCode])
    }

    #Preview("6 Code block · dark") {
        MarkdownPreview(replies: [MarkdownFixture.codeBlock])
            .preferredColorScheme(.dark)
    }

    #Preview("7 Tables") {
        MarkdownPreview(replies: [MarkdownFixture.builds, MarkdownFixture.changes])
    }

    #Preview("8 Mention chip") {
        MarkdownPreview(replies: [MarkdownFixture.mention])
    }

    #Preview("9 Mermaid and math fallback") {
        MarkdownPreview(replies: [MarkdownFixture.diagrams])
    }

    #Preview("10 Mixed reply, one bubble per message") {
        MarkdownPreview(replies: [MarkdownFixture.mixedReply])
    }

    #Preview("10 Mixed reply · dark") {
        MarkdownPreview(replies: [MarkdownFixture.mixedReply])
            .preferredColorScheme(.dark)
    }
#endif
