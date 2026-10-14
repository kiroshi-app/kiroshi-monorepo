import AuthenticationServices
import SwiftUI

struct AppleSignInButton: View {
    let model: SignInModel
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.authorizationController) private var authorizationController
    @State private var authorization: Task<Void, Never>?

    private var isSigningIn: Bool { model.signingInWith == .apple }

    var body: some View {
        Button("Sign in with Apple", action: signInTapped)
            .buttonStyle(
                ProviderButtonStyle(
                    logo: Image(systemName: "apple.logo"),
                    fill: colorScheme == .dark ? .white : .black,
                    foreground: colorScheme == .dark ? .black : .white,
                    stroke: nil,
                    isSigningIn: isSigningIn)
            )
            .accessibilityLabel(isSigningIn ? "Signing in with Apple…" : "Sign in with Apple")
            .providerAvailability(isBusy: model.isBusy, isSigningIn: isSigningIn)
            .onDisappear { authorization?.cancel() }
    }

    private func signInTapped() {
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.fullName, .email]
        request.nonce = model.appleRequestNonce()
        authorization?.cancel()
        authorization = Task {
            model.appleCompleted(await outcome(of: request))
        }
    }

    private func outcome(of request: ASAuthorizationAppleIDRequest) async -> ProviderOutcome {
        do {
            let result = try await authorizationController.performRequest(request)
            guard case .appleID(let credential) = result else { return .failed }
            return ProviderOutcome(apple: .success(credential))
        } catch {
            return ProviderOutcome(apple: .failure(error))
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
    let stroke: Color?
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
        .overlay {
            if let stroke {
                Capsule()
                    .strokeBorder(stroke, lineWidth: 1)
            }
        }
        .contentShape(.capsule)
        .opacity(configuration.isPressed ? 0.8 : 1)
    }
}

extension View {
    fileprivate func providerAvailability(isBusy: Bool, isSigningIn: Bool) -> some View {
        disabled(isBusy)
            .opacity(isBusy && !isSigningIn ? 0.4 : 1)
    }
}
