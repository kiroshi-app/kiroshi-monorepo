import SwiftUI
import UIKit

struct CodeBlockCard: View {
    static let copiedFor = Duration.seconds(2)
    static let font = Font.footnote.monospaced()

    let code: MarkdownCode

    @State private var copies = 0
    @ScaledMetric(relativeTo: .footnote) private var headerHeight: CGFloat = 36
    @ScaledMetric(relativeTo: .footnote) private var inset: CGFloat = 12

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 0) {
                if let language = code.language {
                    Text(verbatim: language)
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(Color("code-card-label"))
                        .fixedSize()
                }
                Spacer(minLength: 8)
                copyButton
            }
            .padding(.leading, inset)
            .padding(.trailing, 4)
            .frame(minHeight: headerHeight)
            ScrollView(.horizontal) {
                Text(SyntaxHighlighting.shared.highlighted(code))
                    .font(Self.font)
                    .lineSpacing(1)
                    .fixedSize()
                    .padding(.horizontal, inset)
                    .padding(.bottom, inset)
            }
            .scrollIndicators(.automatic)
        }
        .background(Color(.tertiarySystemBackground), in: .rect(cornerRadius: 14))
        .overlay {
            RoundedRectangle(cornerRadius: 14).strokeBorder(Color("code-card-stroke"))
        }
        .task(id: copies) {
            guard copies > 0 else { return }
            do {
                try await Task.sleep(for: Self.copiedFor)
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
            UIPasteboard.general.string = code.text
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
                .frame(minHeight: headerHeight)
            } else {
                Label("Copy code", systemImage: "square.on.square")
                    .labelStyle(.iconOnly)
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .frame(minWidth: headerHeight, minHeight: headerHeight)
            }
        }
        .buttonStyle(.plain)
        .contentShape(.rect)
        .accessibilityLabel(isCopied ? Text("Copied") : Text("Copy code"))
    }
}
