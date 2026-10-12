import SwiftUI

struct MachineLine: View {
    let text: String

    var body: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(.tertiary)
                .frame(width: 5, height: 5)
                .accessibilityHidden(true)
            Text(text)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 4)
    }
}
