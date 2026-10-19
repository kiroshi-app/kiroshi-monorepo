import SwiftUI

struct LoadingSpacesView: View {
    let model: SignInModel

    var body: some View {
        VStack(spacing: 24) {
            ProgressView()
                .controlSize(.large)
            Text("Loading your spaces…")
                .foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .combine)
        .padding(.horizontal, 40)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .signInGround()
        .task { await model.loadSpaces() }
    }
}

struct NoSpaceView: View {
    let model: SignInModel

    var body: some View {
        ScrollView { noSpaces }
            .defaultScrollAnchor(.center, for: .alignment)
            .scrollBounceBehavior(.basedOnSize)
            .signInGround()
            .task { await model.invitations?.refresh() }
            .invitationSheet(model.invitations)
            .safeAreaBar(edge: .bottom) {
                VStack(spacing: 4) {
                    Button("Check again", action: model.checkAgain)
                        .secondaryAction()
                    Button("Use another account", action: model.useAnotherAccount)
                        .fontWeight(.medium)
                        .plainAction()
                }
                .bottomActions()
            }
    }

    private var noSpaces: some View {
        VStack(spacing: 14) {
            Image(systemName: "square.stack")
                .font(.largeTitle)
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            Text("No spaces yet")
                .font(.title2.bold())
                .accessibilityAddTraits(.isHeader)
            Text(
                "Turn on hosting for a space on your computer, or ask someone to invite you. It shows up here."
            )
            .foregroundStyle(.secondary)
            Text("Signed in as \(model.signedInEmail)")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .padding(.top, 6)
            if let invitations = model.invitations, !invitations.pending.isEmpty {
                InvitationList(invitations: invitations)
                    .padding(.top, 10)
            }
        }
        .multilineTextAlignment(.center)
        .padding(.horizontal, 40)
        .frame(maxWidth: .infinity)
    }
}

struct SpacesUnreachableView: View {
    let model: SignInModel

    var body: some View {
        ContentUnavailableView {
            Label("Couldn’t load your spaces", systemImage: "wifi.exclamationmark")
        } description: {
            Text("Couldn’t reach Kiroshi. Check your connection and try again.")
        }
        .signInGround()
        .safeAreaBar(edge: .bottom) {
            Button("Check again", action: model.checkAgain)
                .secondaryAction()
                .bottomActions()
        }
    }
}

struct DeviceRefusedView: View {
    let model: SignInModel
    let problem: DeviceProblem

    var body: some View {
        ScrollView {
            ContentUnavailableView {
                Label(title, systemImage: "iphone.slash")
            } description: {
                Text(description)
            }
        }
        .defaultScrollAnchor(.center, for: .alignment)
        .scrollBounceBehavior(.basedOnSize)
        .signInGround()
        .safeAreaBar(edge: .bottom) {
            Button("Check again", action: model.checkAgain)
                .secondaryAction()
                .bottomActions()
        }
    }

    private var title: LocalizedStringKey {
        switch problem {
        case .notAdded: "Couldn’t add this iPhone to your account"
        case .keysUnreadable: "Couldn’t read this iPhone’s keys"
        }
    }

    private var description: LocalizedStringKey {
        switch problem {
        case .notAdded:
            "Kiroshi couldn’t confirm this iPhone’s keys. Wait a moment, then check again."
        case .keysUnreadable: "Unlock your iPhone, then check again."
        }
    }
}

#if DEBUG
    #Preview("1.5 Signed in · loading spaces") {
        SignInRootView(model: .fixture(.loadingSpaces))
    }

    #Preview("1.10 No remote space") {
        SignInRootView(model: .fixture(.noSpace))
    }

    #Preview("Spaces unreachable") {
        SignInRootView(model: .fixture(.spacesUnreachable))
    }

    #Preview("This iPhone not added to the account") {
        SignInRootView(model: .fixture(.deviceNotAdded))
    }
#endif
