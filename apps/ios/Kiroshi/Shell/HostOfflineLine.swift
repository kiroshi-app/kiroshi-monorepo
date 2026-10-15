import SwiftUI

struct HostOfflineLine: View {
    let space: Space
    let email: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Image(systemName: "circle.fill")
                .imageScale(.small)
                .font(.caption2)
                .foregroundStyle(Color(.systemGray))
                .accessibilityHidden(true)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 4)
    }

    private var message: String {
        switch space.role {
        case .owner:
            "\(space.name) is offline. You can write again once \(email)’s computer is back."
        case .member:
            "\(space.name) is offline. You can write again once the host’s computer is back."
        }
    }
}
