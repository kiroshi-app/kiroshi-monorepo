import SwiftUI

extension View {
    func primaryAction() -> some View {
        fontWeight(.semibold)
            .buttonSizing(.flexible)
            .buttonStyle(.borderedProminent)
            .buttonBorderShape(.capsule)
            .controlSize(.large)
            .tint(.primary)
            .foregroundStyle(Color(.systemBackground))
    }

    func secondaryAction() -> some View {
        fontWeight(.semibold)
            .buttonSizing(.flexible)
            .buttonStyle(.borderedProminent)
            .buttonBorderShape(.capsule)
            .controlSize(.large)
            .tint(Color(.systemGray5))
            .foregroundStyle(.primary)
    }

    func plainAction() -> some View {
        buttonSizing(.flexible)
            .frame(minHeight: 48)
            .buttonStyle(.borderless)
            .tint(.primary)
    }

    func bottomActions() -> some View {
        padding(.horizontal, 24)
            .padding(.bottom, 8)
    }

    func signInGround() -> some View {
        background(Color(.systemBackground))
    }
}
