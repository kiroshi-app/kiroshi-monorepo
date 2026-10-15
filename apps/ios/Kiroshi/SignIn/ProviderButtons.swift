import AuthenticationServices
import SwiftUI

struct AppleSignInButton: View {
    let model: SignInModel
    @Environment(\.colorScheme) private var colorScheme
    @ScaledMetric(relativeTo: .body) private var height: CGFloat = 52

    private var isSigningIn: Bool { model.signingInWith == .apple }
    private var fill: Color { colorScheme == .dark ? .white : .black }

    var body: some View {
        SignInWithAppleButton(.signIn, onRequest: configure, onCompletion: completed)
            .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
            .frame(height: height)
            .clipShape(.capsule)
            .overlay {
                if isSigningIn {
                    ProgressView()
                        .tint(colorScheme == .dark ? .black : .white)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(fill, in: .capsule)
                }
            }
            .accessibilityLabel(isSigningIn ? "Signing in with Apple…" : "Sign in with Apple")
            .providerAvailability(isBusy: model.isBusy, isSigningIn: isSigningIn)
    }

    private func configure(_ request: ASAuthorizationAppleIDRequest) {
        request.requestedScopes = [.fullName, .email]
        request.nonce = model.appleRequestNonce()
    }

    private func completed(_ result: Result<ASAuthorization, any Error>) {
        switch result {
        case .success(let authorization):
            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential
            else {
                model.appleCompleted(.failed)
                return
            }
            model.appleCompleted(ProviderOutcome(apple: .success(credential)))
        case .failure(let error):
            model.appleCompleted(ProviderOutcome(apple: .failure(error)))
        }
    }
}

struct GoogleSignInButton: View {
    let model: SignInModel

    private var isSigningIn: Bool { model.signingInWith == .google }

    var body: some View {
        Button("Continue with Google", action: model.continueWithGoogle)
            .buttonStyle(
                ProviderButtonStyle(
                    logo: Image("GoogleG"),
                    fill: Color("GoogleFill"),
                    foreground: Color("GoogleLabel"),
                    stroke: Color("GoogleStroke"),
                    isSigningIn: isSigningIn)
            )
            .accessibilityLabel(isSigningIn ? "Signing in with Google…" : "Continue with Google")
            .providerAvailability(isBusy: model.isBusy, isSigningIn: isSigningIn)
    }
}

private struct ProviderButtonStyle: ButtonStyle {
    let logo: Image
    let fill: Color
    let foreground: Color
    let stroke: Color
    let isSigningIn: Bool
    @ScaledMetric(relativeTo: .body) private var logoSide: CGFloat = 20
    @ScaledMetric(relativeTo: .body) private var slotSide: CGFloat = 24

    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 0) {
            logo
                .resizable()
                .scaledToFit()
                .frame(width: logoSide, height: logoSide)
                .frame(width: slotSide, height: slotSide)
                .accessibilityHidden(true)
            configuration.label
                .font(.body.weight(.semibold))
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity)
            Color.clear
                .frame(width: slotSide, height: slotSide)
        }
        .opacity(isSigningIn ? 0 : 1)
        .overlay {
            if isSigningIn {
                ProgressView()
                    .tint(foreground)
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, minHeight: 52)
        .foregroundStyle(foreground)
        .background(fill, in: .capsule)
        .clipShape(.capsule)
        .overlay {
            Capsule()
                .strokeBorder(stroke, lineWidth: 1)
        }
        .contentShape(.capsule)
        .compositingGroup()
        .opacity(configuration.isPressed ? 0.8 : 1)
    }
}

extension View {
    fileprivate func providerAvailability(isBusy: Bool, isSigningIn: Bool) -> some View {
        disabled(isBusy)
            .opacity(isBusy && !isSigningIn ? 0.4 : 1)
    }
}
