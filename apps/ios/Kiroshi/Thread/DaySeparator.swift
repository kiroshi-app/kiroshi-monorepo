import SwiftUI

struct DaySeparator: View {
    let label: String

    init?(label: String?) {
        guard let label, !label.isEmpty else { return nil }
        self.label = label
    }

    var body: some View {
        HStack(spacing: 12) {
            line
            Text(label)
                .font(.footnote.weight(.medium))
                .foregroundStyle(.secondary)
                .accessibilityAddTraits(.isHeader)
                .layoutPriority(1)
            line
        }
    }

    private var line: some View {
        Rectangle()
            .fill(Color(.systemGray4))
            .frame(height: 0.5)
            .accessibilityHidden(true)
    }
}
