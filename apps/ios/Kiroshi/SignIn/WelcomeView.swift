import SwiftUI

struct WelcomeView: View {
    @Bindable var model: SignInModel
    @FocusState private var isEmailFocused: Bool
    @State private var visibleHeight: CGFloat = 0

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                hero
                    .frame(maxHeight: .infinity)
                VStack(spacing: 20) {
                    emailActions
                    OrSeparator()
                    providerActions
                }
                .padding(.horizontal, 24)
                .padding(.top, 16)
                .padding(.bottom, 8)
            }
            .frame(minHeight: visibleHeight)
        }
        .scrollBounceBehavior(.basedOnSize)
        .onScrollGeometryChange(for: CGFloat.self) { geometry in
            geometry.containerSize.height
        } action: { _, height in
            visibleHeight = height
        }
        .signInGround()
        .toolbarVisibility(.hidden, for: .navigationBar)
        .onAppear {
            #if DEBUG
                isEmailFocused = SignInFixture.opened == .email
            #endif
        }
    }

    private var hero: some View {
        VStack(spacing: 28) {
            if !isEmailFocused {
                Image("Hexagon")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 88, height: 80)
                    .accessibilityLabel("Kiroshi")
            }
            Text("Your agents, away from your computer.")
                .font(.title.bold())
                .multilineTextAlignment(.center)
                .frame(maxWidth: 290)
            if let notice = model.signOutNotice {
                Label(notice.message, systemImage: "iphone.slash")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.horizontal, 40)
        .padding(.vertical, 24)
    }

    private var emailActions: some View {
        VStack(alignment: .leading, spacing: 12) {
            TextField("Email", text: $model.email)
                .accessibilityLabel("Email")
                .textContentType(.emailAddress)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.go)
                .onSubmit(continueTapped)
                .focused($isEmailFocused)
                .tint(.blue)
                .padding(.horizontal, 16)
                .frame(minHeight: 52)
                .background(Color(.secondarySystemBackground), in: .capsule)
            Button(action: continueTapped) {
                if model.isRequestingCode {
                    ProgressView()
                } else {
                    Text("Continue")
                }
            }
            .primaryAction()
            if let problem = model.emailProblem {
                ProblemLabel(message: problem.message)
                    .padding(.horizontal, 12)
            }
        }
        .disabled(model.isBusy)
    }

    private var providerActions: some View {
        VStack(alignment: .leading, spacing: 12) {
            AppleSignInButton(model: model)
            GoogleSignInButton(model: model)
            if let problem = model.providerProblem {
                ProblemLabel(message: problem.message)
                    .padding(.horizontal, 18)
                    .padding(.top, 2)
            }
        }
    }

    private func continueTapped() {
        guard !model.email.trimmingCharacters(in: .whitespaces).isEmpty else {
            isEmailFocused = true
            return
        }
        isEmailFocused = false
        model.continueWithEmail()
    }
}

private struct OrSeparator: View {
    var body: some View {
        HStack(spacing: 14) {
            line
            Text("or")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            line
        }
    }

    private var line: some View {
        Rectangle()
            .fill(Color(.opaqueSeparator))
            .frame(height: 1)
    }
}

#if DEBUG
    #Preview("1.1 Welcome") {
        SignInRootView(model: .fixture(.opening))
    }

    #Preview("1.1b Apple · signing in") {
        SignInRootView(model: .fixture(.appleSigningIn))
    }

    #Preview("1.1c Google · signing in") {
        SignInRootView(model: .fixture(.googleSigningIn))
    }

    #Preview("1.1d Relay refused Apple") {
        SignInRootView(model: .fixture(.appleRefused))
    }

    #Preview("1.6 Couldn’t send the code") {
        SignInRootView(model: .fixture(.couldNotSendCode))
    }
#endif
