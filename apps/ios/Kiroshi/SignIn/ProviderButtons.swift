import AuthenticationServices
import SwiftUI

private let providerButtonHeight: CGFloat = 52

struct AppleSignInButton: View {
    let model: SignInModel
    @Environment(\.colorScheme) private var colorScheme

    private var isSigningIn: Bool { model.signingInWith == .apple }

    var body: some View {
        SignInWithAppleButton(.signIn) { request in
            request.requestedScopes = [.fullName, .email]
            request.nonce = model.appleRequestNonce()
        } onCompletion: { result in
            model.appleCompleted(ProviderOutcome(apple: result))
        }
        .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
        .frame(height: providerButtonHeight)
        .clipShape(.capsule)
        .accessibilityHidden(model.isBusy)
        .overlay {
            if isSigningIn {
                Capsule()
                    .fill(colorScheme == .dark ? Color.white : Color.black)
                    .overlay {
                        ProgressView()
                            .tint(colorScheme == .dark ? Color.black : Color.white)
                    }
                    .accessibilityElement()
                    .accessibilityLabel("Signing in with Apple…")
            }
        }
        .allowsHitTesting(!model.isBusy)
        .opacity(model.isBusy && !isSigningIn ? 0.4 : 1)
    }
}

struct GoogleSignInButton: View {
    let model: SignInModel

    private var isSigningIn: Bool { model.signingInWith == .google }

    var body: some View {
        Button(action: model.continueWithGoogle) {
            HStack(spacing: 0) {
                Image("GoogleG")
                    .resizable()
                    .frame(width: 20, height: 20)
                    .frame(width: 24, height: 24)
                    .accessibilityHidden(true)
                Text("Continue with Google")
                    .fontWeight(.semibold)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity)
                Color.clear
                    .frame(width: 24, height: 24)
            }
            .opacity(isSigningIn ? 0 : 1)
            .overlay {
                if isSigningIn {
                    ProgressView()
                        .tint(Color("GoogleLabel"))
                }
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity, minHeight: providerButtonHeight)
            .foregroundStyle(Color("GoogleLabel"))
            .background(Color("GoogleFill"), in: .capsule)
            .overlay {
                Capsule()
                    .strokeBorder(Color("GoogleStroke"), lineWidth: 1)
            }
            .contentShape(.capsule)
        }
        .buttonStyle(GoogleButtonStyle())
        .accessibilityLabel(isSigningIn ? "Signing in with Google…" : "Continue with Google")
        .disabled(model.isBusy)
        .opacity(model.isBusy && !isSigningIn ? 0.4 : 1)
    }
}

private struct GoogleButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(configuration.isPressed ? 0.8 : 1)
    }
}
