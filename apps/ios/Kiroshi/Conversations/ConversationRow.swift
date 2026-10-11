import SwiftUI

struct CompanionRow: View {
    let summary: CompanionSummary
    @Environment(\.redactionReasons) private var redactionReasons
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        HStack(spacing: 12) {
            CompanionAvatar(
                redactionReasons.isEmpty ? summary.companion : nil, size: .row,
                isWorking: summary.isWorking
            )
            .unredacted()
            VStack(alignment: .leading, spacing: 2) {
                headerLayout {
                    Text(summary.companion.name)
                        .font(.headline)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    if let label = summary.timeLabel {
                        Text(label)
                            .font(.subheadline)
                            .foregroundStyle(Color.kiroshi(.mutedForeground))
                    }
                }
                if summary.isWorking {
                    WorkingLabel(name: summary.companion.name, font: .subheadline)
                } else if let lastMessage = summary.lastMessage {
                    Text(lastMessage.line)
                        .font(.subheadline)
                        .foregroundStyle(Color.kiroshi(.mutedForeground))
                        .lineLimit(dynamicTypeSize.isAccessibilitySize ? 3 : 1)
                }
            }
        }
        .padding(.vertical, 6)
        .foregroundStyle(Color.kiroshi(.foreground))
        .accessibilityElement(children: .combine)
    }

    private var headerLayout: AnyLayout {
        dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 2))
            : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: 8))
    }

}

struct WorkingLabel: View {
    let name: String
    let font: Font

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "ellipsis")
                .symbolEffect(.variableColor.iterative.dimInactiveLayers.nonReversing)
                .accessibilityHidden(true)
            Text("\(name) is working…")
        }
        .font(font)
        .foregroundStyle(Color.kiroshi(.foreground))
    }
}
