import SwiftUI

struct MentionSuggestions: View {
    let companions: [Companion]
    let pick: (Companion) -> Void
    @ScaledMetric(relativeTo: .body) private var rowHeight: CGFloat = 44

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                ForEach(companions) { companion in
                    Button {
                        pick(companion)
                    } label: {
                        Label {
                            Text(companion.name)
                                .foregroundStyle(.primary)
                        } icon: {
                            CompanionAvatar(companion, size: .inline)
                        }
                        .frame(maxWidth: .infinity, minHeight: rowHeight, alignment: .leading)
                        .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Mention \(companion.name)")
                    if companion.id != companions.last?.id {
                        Divider()
                    }
                }
            }
            .padding(.horizontal, 14)
        }
        .scrollBounceBehavior(.basedOnSize)
        .frame(height: min(CGFloat(companions.count), 4.5) * (rowHeight + 1))
        .background(Color(.secondarySystemBackground), in: .rect(cornerRadius: 20))
    }
}
