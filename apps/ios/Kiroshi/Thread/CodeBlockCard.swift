import SwiftUI

struct CodeBlockCard: View {
    static let font = Font.footnote.monospaced()

    let code: MarkdownCode

    @ScaledMetric(relativeTo: .footnote) private var inset: CGFloat = 12

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            MessageCardHeader(label: code.language, copyLabel: "Copy code", copied: code.text)
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
        .messageCard()
    }
}
