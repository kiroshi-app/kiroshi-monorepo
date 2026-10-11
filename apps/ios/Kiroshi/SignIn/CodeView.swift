import SwiftUI

struct CodeView: View {
    @Bindable var model: SignInModel
    @FocusState private var isCodeFocused: Bool

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                SignInHeader(
                    title: "Check your email",
                    message: "Enter the six-digit code we sent to \(model.email).")
                VStack(alignment: .leading, spacing: 16) {
                    CodeField(
                        code: model.isSigningIn ? .constant(model.code) : $model.code,
                        focus: $isCodeFocused,
                        isWrong: model.codeProblem == .wrongCode
                            || model.codeProblem == .tooManyWrongCodes
                    )
                    .opacity(model.isSigningIn ? 0.5 : 1)
                    .disabled(model.needsNewCode)
                    footer
                }
                if !model.needsNewCode {
                    VStack(alignment: .leading, spacing: 4) {
                        Button("Send a new code", action: model.sendNewCodeTapped)
                            .fontWeight(.semibold)
                            .frame(minHeight: 44)
                        Button("Use a different email", action: model.useDifferentEmail)
                            .tint(Color.kiroshi(.mutedForeground))
                            .frame(minHeight: 44)
                    }
                    .buttonStyle(.borderless)
                    .tint(Color.kiroshi(.foreground))
                    .multilineTextAlignment(.leading)
                    .disabled(model.isSigningIn || model.isRequestingCode)
                }
            }
            .padding(.horizontal, 24)
            .padding(.top, 12)
        }
        .scrollBounceBehavior(.basedOnSize)
        .signInGround()
        .safeAreaBar(edge: .bottom) {
            if model.needsNewCode {
                VStack(spacing: 0) {
                    Button(action: model.sendNewCodeTapped) {
                        Text("Send a new code")
                            .multilineTextAlignment(.center)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .primaryAction()
                    .disabled(model.isRequestingCode)
                    Button("Use a different email", action: model.useDifferentEmail)
                        .plainAction()
                }
                .bottomActions()
            }
        }
        .onChange(of: model.code) { model.codeChanged() }
        .onChange(of: model.needsNewCode) { isCodeFocused = !model.needsNewCode }
        .onAppear { isCodeFocused = !model.needsNewCode }
    }

    @ViewBuilder private var footer: some View {
        if model.isSigningIn {
            HStack(spacing: 8) {
                ProgressView()
                Text("Signing in…")
                    .font(.subheadline)
                    .foregroundStyle(Color.kiroshi(.mutedForeground))
            }
            .padding(.horizontal, 4)
        } else if let problem = model.codeProblem {
            ProblemLabel(message: problem.message)
        } else {
            Text("The code works for 5 minutes.")
                .font(.footnote)
                .foregroundStyle(Color.kiroshi(.mutedForeground))
                .padding(.horizontal, 4)
        }
    }
}

#if DEBUG
    #Preview("1.3 Code") {
        SignInRootView(model: .fixture(.code))
    }

    #Preview("1.4 Code · signing in") {
        SignInRootView(model: .fixture(.signingIn))
    }

    #Preview("1.7 Wrong code") {
        SignInRootView(model: .fixture(.wrongCode))
    }

    #Preview("1.7b Too many wrong codes") {
        SignInRootView(model: .fixture(.tooManyWrongCodes))
    }

    #Preview("1.8 Code expired") {
        SignInRootView(model: .fixture(.expiredCode))
    }

    #Preview("1.9 Too many codes asked") {
        SignInRootView(model: .fixture(.tooManyCodes))
    }
#endif
