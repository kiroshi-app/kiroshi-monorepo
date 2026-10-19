import SwiftUI

struct DeviceApprovalView: View {
    let approval: DeviceApproval
    let loadSpaces: () async -> Void

    var body: some View {
        stage
            .task(id: approval.stage.isWatched) {
                guard approval.stage.isWatched else { return }
                await approval.watch()
            }
    }

    @ViewBuilder private var stage: some View {
        switch approval.stage {
        case .waiting: WaitingForApprovalView(approval: approval)
        case .code: ApprovalCodeView(approval: approval)
        case .approved: ApprovedView(approval: approval, loadSpaces: loadSpaces)
        case .expired: ApprovalExpiredView(approval: approval)
        case .refused: ApprovalRefusedView(approval: approval)
        }
    }
}

private struct WaitingForApprovalView: View {
    let approval: DeviceApproval

    var body: some View {
        ApprovalScreen(
            systemImage: "iphone", title: "Approve this device from one you already use",
            message: Text(
                "Open Kiroshi on a device that uses \(approval.email) and approve this one.")
        ) {
            ThisDeviceCard(approval: approval)
            ApprovalProgress(label: "Waiting for approval…")
            if let problem = approval.requestProblem {
                ProblemLabel(message: problem.message)
            }
        } actions: {
            Button("I don’t have another device", action: approval.noOtherDeviceTapped)
                .disabled(approval.isRequestingCode)
            Button("Sign out", action: approval.signOut)
        }
    }
}

private struct ApprovalCodeView: View {
    @Bindable var approval: DeviceApproval
    @FocusState private var isCodeFocused: Bool

    var body: some View {
        ApprovalScreen(
            systemImage: "envelope", title: "Check your email",
            message: Text(
                "We sent a 6-digit code to \(approval.email). Enter it to approve this iPhone. It works once, for 5 minutes."
            )
        ) {
            CodeField(
                code: approval.isVerifying ? .constant(approval.code) : $approval.code,
                focus: $isCodeFocused,
                isWrong: approval.codeProblem == .wrongCode
                    || approval.codeProblem == .tooManyWrongCodes
            )
            .opacity(approval.isVerifying ? 0.5 : 1)
            .disabled(approval.needsNewCode)
            if let problem = approval.codeProblem {
                ProblemLabel(message: problem.message)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            Button(action: approval.approveWithCodeTapped) {
                if approval.isVerifying {
                    ProgressView()
                } else {
                    Text("Approve this iPhone")
                }
            }
            .fontWeight(.semibold)
            .buttonSizing(.flexible)
            .buttonStyle(.borderedProminent)
            .buttonBorderShape(.capsule)
            .controlSize(.large)
            .tint(Color(.systemGray4))
            .foregroundStyle(Color(.systemBlue))
            .disabled(!approval.canApproveWithCode)
        } actions: {
            Button("Send a new code", action: approval.sendNewCodeTapped)
                .disabled(approval.isRequestingCode || approval.isVerifying)
            Button("Sign out", action: approval.signOut)
        }
        .onChange(of: approval.code) { approval.codeChanged() }
        .onChange(of: approval.needsNewCode) { isCodeFocused = !approval.needsNewCode }
        .onAppear { isCodeFocused = true }
    }
}

private struct ApprovedView: View {
    let approval: DeviceApproval
    let loadSpaces: () async -> Void

    var body: some View {
        ApprovalScreen(
            systemImage: "iphone", title: "This device is approved",
            message: Text("Your spaces are coming in. The first time can take a minute.")
        ) {
            ThisDeviceCard(approval: approval)
            ApprovalProgress(label: "Loading your spaces…")
        } actions: {
        }
        .task { await loadSpaces() }
    }
}

private struct ApprovalExpiredView: View {
    let approval: DeviceApproval

    var body: some View {
        ApprovalScreen(
            systemImage: "iphone", title: "The request expired",
            message: Text(
                "Nobody approved this device in time. Ask again, then approve it on a device you already use."
            )
        ) {
            ThisDeviceCard(approval: approval)
            Button(action: approval.askAgain) {
                if approval.isAskingAgain {
                    ProgressView()
                } else {
                    Text("Ask again")
                }
            }
            .fontWeight(.semibold)
            .buttonSizing(.flexible)
            .buttonStyle(.borderedProminent)
            .buttonBorderShape(.capsule)
            .controlSize(.large)
            .tint(Color(.systemBlue))
            .disabled(approval.isAskingAgain)
            if let problem = approval.requestProblem {
                ProblemLabel(message: problem.message)
            }
        } actions: {
            Button("I don’t have another device", action: approval.noOtherDeviceTapped)
                .disabled(approval.isRequestingCode || approval.isAskingAgain)
            Button("Sign out", action: approval.signOut)
        }
    }
}

private struct ApprovalRefusedView: View {
    let approval: DeviceApproval

    var body: some View {
        ApprovalScreen(
            systemImage: "iphone", title: "This device wasn’t approved",
            message: Text(
                "Someone using \(approval.email) said it isn’t theirs, so it was signed out.")
        ) {
            ThisDeviceCard(approval: approval)
        } actions: {
            Button("Back to sign in", action: approval.signOut)
        }
    }
}

private struct ApprovalScreen<Content: View, Actions: View>: View {
    let systemImage: String
    let title: LocalizedStringKey
    let message: Text
    @ViewBuilder let content: Content
    @ViewBuilder let actions: Actions
    @ScaledMetric(relativeTo: .largeTitle) private var tileSide = 76
    @ScaledMetric(relativeTo: .largeTitle) private var symbolSide = 40

    var body: some View {
        ScrollView {
            VStack(spacing: 22) {
                Image(systemName: systemImage)
                    .resizable()
                    .scaledToFit()
                    .frame(width: symbolSide, height: symbolSide)
                    .frame(width: tileSide, height: tileSide)
                    .background(Color(.secondarySystemBackground), in: .rect(cornerRadius: 22))
                    .accessibilityHidden(true)
                VStack(spacing: 10) {
                    Text(title)
                        .font(.title.bold())
                        .accessibilityAddTraits(.isHeader)
                    message
                        .foregroundStyle(.secondary)
                }
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                content
            }
            .padding(.horizontal, 28)
            .padding(.top, 64)
            .padding(.bottom, 22)
            .frame(maxWidth: .infinity)
        }
        .scrollBounceBehavior(.basedOnSize)
        .signInGround()
        .safeAreaBar(edge: .bottom) {
            VStack(spacing: 0) {
                actions
                    .frame(minHeight: 44)
            }
            .buttonStyle(.borderless)
            .tint(Color(.systemBlue))
            .multilineTextAlignment(.center)
            .bottomActions()
        }
    }
}

private struct ThisDeviceCard: View {
    let approval: DeviceApproval

    var body: some View {
        DeviceCard(
            name: approval.deviceName, systemImage: "iphone", fingerprint: approval.fingerprint,
            isThisDevice: true
        )
        .padding(.vertical, 14)
        .padding(.horizontal, 16)
        .frame(maxWidth: .infinity)
        .background(Color(.secondarySystemBackground), in: .rect(cornerRadius: 22))
    }
}

private struct ApprovalProgress: View {
    let label: LocalizedStringKey

    var body: some View {
        HStack(spacing: 8) {
            ProgressView()
            Text(label)
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .combine)
    }
}

extension ApprovalCodeProblem {
    var message: LocalizedStringKey {
        switch self {
        case .wrongCode: "That code didn’t work. Check it and try again."
        case .tooManyWrongCodes:
            "That code didn’t work three times, so it’s no longer valid. Send a new code."
        case .tooManyCodes:
            "Couldn’t send a new code, you’ve asked for too many. Wait a few minutes and try again."
        case .unreachable: "Couldn’t reach Kiroshi. Check your connection and try again."
        }
    }
}

#if DEBUG
    #Preview("6 Waiting for approval") {
        SignInRootView(model: .fixture(.approvalWaiting))
    }

    #Preview("6.2 Approved") {
        SignInRootView(model: .fixture(.approvalApproved))
    }

    #Preview("6.3 Not me, signed out") {
        SignInRootView(model: .fixture(.approvalRefused))
    }

    #Preview("6.4 Request expired") {
        SignInRootView(model: .fixture(.approvalExpired))
    }

    #Preview("6.5 Code by email") {
        SignInRootView(model: .fixture(.approvalCode))
    }
#endif
