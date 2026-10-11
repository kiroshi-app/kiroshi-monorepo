import SwiftUI

struct EmailView: View {
    @Bindable var model: SignInModel
    @FocusState private var isEmailFocused: Bool

    private var canContinue: Bool {
        !model.isRequestingCode && !model.email.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                SignInHeader(
                    title: "Sign in",
                    message: "Enter your email and we’ll send you a code to sign in.")
                VStack(alignment: .leading, spacing: 8) {
                    TextField("Email", text: $model.email)
                        .accessibilityLabel("Email")
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .submitLabel(.go)
                        .onSubmit {
                            if canContinue { model.continueWithEmail() }
                        }
                        .focused($isEmailFocused)
                        .foregroundStyle(Color.kiroshi(.foreground))
                        .padding(.horizontal, 16)
                        .frame(minHeight: 52)
                        .background(Color.kiroshi(.muted), in: .capsule)
                    if let problem = model.emailProblem {
                        ProblemLabel(message: problem.message)
                            .padding(.horizontal, 12)
                    } else {
                        Text("No account yet? This creates one.")
                            .font(.footnote)
                            .foregroundStyle(Color.kiroshi(.mutedForeground))
                            .padding(.horizontal, 16)
                    }
                }
            }
            .padding(.horizontal, 24)
            .padding(.top, 12)
        }
        .scrollBounceBehavior(.basedOnSize)
        .signInGround()
        .safeAreaBar(edge: .bottom) {
            Button(action: model.continueWithEmail) {
                if model.isRequestingCode {
                    ProgressView()
                } else {
                    Text("Continue")
                }
            }
            .primaryAction()
            .disabled(!canContinue)
            .bottomActions()
        }
        .onAppear { isEmailFocused = true }
    }
}

#if DEBUG
    #Preview("1.2 Email") {
        SignInRootView(model: .fixture(.email))
    }

    #Preview("1.6 Couldn’t send the code") {
        SignInRootView(model: .fixture(.couldNotSendCode))
    }
#endif
