import SwiftUI
import UIKit

struct TableCard: View {
    let table: MarkdownTable
    let messageText: String

    @ScaledMetric(relativeTo: .subheadline) private var inset: CGFloat = 12
    @ScaledMetric(relativeTo: .subheadline) private var cellPadding: CGFloat = 9
    @ScaledMetric(relativeTo: .subheadline) private var columnGap: CGFloat = 16
    @State private var cardWidth: CGFloat = 0

    static func rowCount(_ count: Int) -> String {
        count == 1 ? "1 row" : "\(count) rows"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            MessageCardHeader(
                label: Self.rowCount(table.rows.count), copyLabel: "Copy table",
                copied: table.tabSeparated)
            ScrollView(.horizontal) {
                grid
                    .frame(minWidth: cardWidth, alignment: .leading)
            }
            .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
            .onGeometryChange(for: CGFloat.self) {
                $0.size.width
            } action: {
                cardWidth = $0
            }
        }
        .textSelection(.disabled)
        .messageCard()
        .contentShape(.contextMenuPreview, .rect(cornerRadius: MessageCard.cornerRadius))
        .contextMenu {
            Button("Copy Table", systemImage: "square.on.square", action: copyTable)
            Button("Copy Message", systemImage: "message", action: copyMessage)
        }
    }

    private func copyTable() {
        UIPasteboard.general.string = table.tabSeparated
    }

    private func copyMessage() {
        UIPasteboard.general.string = messageText
    }

    private var rows: [[MarkdownInline]] {
        [table.header] + table.rows
    }

    private var grid: some View {
        Grid(alignment: .leading, horizontalSpacing: columnGap, verticalSpacing: 0) {
            ForEach(rows.indices, id: \.self) { row in
                GridRow {
                    ForEach(0..<table.columnCount, id: \.self) { column in
                        cell(row: row, column: column)
                    }
                }
                .accessibilityAddTraits(row == 0 ? .isHeader : [])
                if row < rows.count - 1 {
                    Rectangle()
                        .fill(row == 0 ? Color(.separator) : Color(.separator).opacity(0.5))
                        .frame(height: 1)
                }
            }
        }
        .padding(.horizontal, inset)
        .padding(.bottom, 2)
    }

    private func cell(row: Int, column: Int) -> some View {
        let inline = rows[row][safe: column] ?? MarkdownInline(plain: "")
        let alignment = table.alignments[safe: column] ?? .leading
        let isLast = column == table.columnCount - 1
        return InlineText(inline: inline, codeFont: nil, strongWeight: row == 0 ? nil : .semibold)
            .font(row == 0 ? .subheadline.weight(.semibold) : .subheadline)
            .fixedSize()
            .padding(.vertical, cellPadding)
            .frame(maxWidth: isLast ? .infinity : nil, alignment: alignment.frame)
            .gridColumnAlignment(alignment.horizontal)
    }
}

extension MarkdownTable.Alignment {
    fileprivate var horizontal: HorizontalAlignment {
        switch self {
        case .leading: .leading
        case .center: .center
        case .trailing: .trailing
        }
    }

    fileprivate var frame: SwiftUI.Alignment {
        switch self {
        case .leading: .leading
        case .center: .center
        case .trailing: .trailing
        }
    }
}

extension Array {
    fileprivate subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
