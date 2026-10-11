import SwiftUI

extension View {
    func primaryAction() -> some View {
        fontWeight(.semibold)
            .buttonSizing(.flexible)
            .buttonStyle(.borderedProminent)
            .buttonBorderShape(.capsule)
            .controlSize(.large)
            .tint(Color.kiroshi(.foreground))
            .foregroundStyle(SignInGround())
    }

    func secondaryAction() -> some View {
        fontWeight(.semibold)
            .buttonSizing(.flexible)
            .buttonStyle(.borderedProminent)
            .buttonBorderShape(.capsule)
            .controlSize(.large)
            .tint(Color.kiroshi(.muted))
            .foregroundStyle(Color.kiroshi(.foreground))
    }

    func plainAction() -> some View {
        buttonSizing(.flexible)
            .frame(minHeight: 48)
            .buttonStyle(.borderless)
            .tint(Color.kiroshi(.foreground))
    }

    func bottomActions() -> some View {
        padding(.horizontal, 24)
            .padding(.bottom, 8)
    }

    func signInGround() -> some View {
        background(SignInGround())
    }
}

struct SignInGround: ShapeStyle {
    func resolve(in environment: EnvironmentValues) -> Color {
        Color.kiroshi(environment.colorScheme == .dark ? .background : .card)
    }
}
