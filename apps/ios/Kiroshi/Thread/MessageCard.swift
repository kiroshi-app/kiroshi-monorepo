import SwiftUI
import UIKit

enum MessageCard {
    static let fill = Color("card-fill")
    static let stroke = Color("card-stroke")
    static let label = Color("card-label")
    static let separator = Color("card-separator")
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
    var speaker: String?
    var time = ""

    @State private var copies = 0
    @ScaledMetric(relativeTo: .footnote) private var height: CGFloat = 36
    @ScaledMetric(relativeTo: .footnote) private var inset: CGFloat = 12
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        layout {
            if let label {
                Text(verbatim: label)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(MessageCard.label)
                    .fixedSize(horizontal: !isStacked, vertical: true)
                    .padding(.top, isStacked ? inset : 0)
                    .modifier(MessageOpening(speaker: speaker, time: time))
                    .accessibilitySortPriority(1)
            }
            if !isStacked {
                Spacer(minLength: 8)
            }
            copyButton
                .modifier(
                    MessageOpening(
                        speaker: label == nil ? speaker : nil, time: label == nil ? time : ""))
        }
        .accessibilityElement(children: .contain)
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

    private var isStacked: Bool {
        dynamicTypeSize.isAccessibilitySize
    }

    private var layout: AnyLayout {
        isStacked
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 0))
            : AnyLayout(HStackLayout(spacing: 0))
    }

    private var isCopied: Bool {
        copies > 0
    }

    private var copyButton: some View {
        Button {
            UIPasteboard.general.string = copied
            copies += 1
            AccessibilityNotification.Announcement(String(localized: "Copied")).post()
        } label: {
            if isCopied {
                HStack(spacing: 4) {
                    Image(systemName: "checkmark")
                        .foregroundStyle(Color(.systemGreen))
                        .accessibilityHidden(true)
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
                    .foregroundStyle(Color("card-copy"))
                    .frame(
                        minWidth: height, minHeight: height,
                        alignment: isStacked ? .leading : .center)
            }
        }
        .buttonStyle(.plain)
        .contentShape(.rect)
        .accessibilityLabel(isCopied ? Text("Copied") : Text(copyLabel))
    }
}
