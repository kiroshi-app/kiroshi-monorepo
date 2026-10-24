import SwiftUI
import UIKit

enum MessageCard {
    static let fill = Color(.tertiarySystemBackground)
    static let stroke = Color("card-stroke")
    static let label = Color("card-label")
    static let cornerRadius: CGFloat = 14
    static let copiedFor = Duration.seconds(2)
}

extension View {
    func messageCard() -> some View {
        background(MessageCard.fill, in: .rect(cornerRadius: MessageCard.cornerRadius))
            .overlay {
                RoundedRectangle(cornerRadius: MessageCard.cornerRadius)
                    .strokeBorder(MessageCard.stroke)
            }
    }
}

struct MessageCardHeader: View {
    let label: String?
    let copyLabel: String
    let copied: String

    @State private var copies = 0
    @ScaledMetric(relativeTo: .footnote) private var height: CGFloat = 36
    @ScaledMetric(relativeTo: .footnote) private var inset: CGFloat = 12

    var body: some View {
        HStack(spacing: 0) {
            if let label {
                Text(verbatim: label)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(MessageCard.label)
                    .fixedSize()
            }
            Spacer(minLength: 8)
            copyButton
        }
        .padding(.leading, inset)
        .padding(.trailing, 4)
        .frame(minHeight: height)
        .task(id: copies) {
            guard copies > 0 else { return }
            do {
                try await Task.sleep(for: MessageCard.copiedFor)
            } catch {
                return
            }
            copies = 0
        }
    }

    private var isCopied: Bool {
        copies > 0
    }

    private var copyButton: some View {
        Button {
            UIPasteboard.general.string = copied
            copies += 1
        } label: {
            if isCopied {
                HStack(spacing: 4) {
                    Image(systemName: "checkmark")
                        .foregroundStyle(Color(.systemGreen))
                    Text("Copied")
                        .foregroundStyle(.secondary)
                }
                .font(.footnote.weight(.semibold))
                .padding(.leading, 8)
                .padding(.trailing, 6)
                .frame(minHeight: height)
            } else {
                Label(copyLabel, systemImage: "square.on.square")
                    .labelStyle(.iconOnly)
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .frame(minWidth: height, minHeight: height)
            }
        }
        .buttonStyle(.plain)
        .contentShape(.rect)
        .accessibilityLabel(isCopied ? Text("Copied") : Text(copyLabel))
    }
}
