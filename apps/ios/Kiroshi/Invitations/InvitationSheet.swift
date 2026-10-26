import SwiftUI

struct InvitationSheet: View {
    let invitations: Invitations
    let invitation: Invitation
    @ScaledMetric(relativeTo: .title2) private var tileSide = 64
    @ScaledMetric(relativeTo: .title2) private var markSide = 22
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    identity
                    facts
                    message
                    if invitations.hasFailedToDecline {
                        ProblemLabel(message: declineFailure)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                .padding(.horizontal, 24)
            }
            .scrollBounceBehavior(.basedOnSize)
            .safeAreaBar(edge: .bottom) { actions }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(role: .close) { dismiss() }
                }
            }
        }
        .task(id: invitation.id) { await invitations.readState(of: invitation) }
        .presentationDetents(detents)
        .presentationBackground(Color(.secondarySystemBackground))
    }

    private var detents: Set<PresentationDetent> {
        if dynamicTypeSize.isAccessibilitySize {
            return [.large]
        }
        if case .refused = phase {
            return [.medium, .large]
        }
        return [.fraction(0.75), .large]
    }

    private var phase: InvitationPhase {
        invitations.phase(of: invitation)
    }

    private var details: ValidInvitation? {
        invitations.details[invitation.id]
    }

    private var inviter: String {
        invitation.inviterEmail.isEmpty ? details?.inviter ?? "" : invitation.inviterEmail
    }

    private var identity: some View {
        let accent = SpaceAccent(tint: invitation.colour)
        return VStack(spacing: 12) {
            Image(systemName: "square.fill")
                .resizable()
                .frame(width: markSide, height: markSide)
                .foregroundStyle(accent.tile)
                .frame(width: tileSide, height: tileSide)
                .background(accent.tileFill, in: .rect(cornerRadius: 16))
                .accessibilityHidden(true)
            VStack(spacing: 2) {
                Text(
                    invitation.instanceName.isEmpty
                        ? "This invitation can’t be used" : invitation.instanceName
                )
                .font(.title.bold())
                .accessibilityAddTraits(.isHeader)
                if !inviter.isEmpty {
                    Text("Invited by \(inviter)")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
            .multilineTextAlignment(.center)
        }
        .padding(.top, 8)
    }

    @ViewBuilder private var facts: some View {
        let rows = factRows
        if !rows.isEmpty {
            VStack(spacing: 0) {
                ForEach(rows) { row in
                    if row.id != rows.first?.id {
                        Divider()
                    }
                    factLayout {
                        Text(LocalizedStringKey(row.id))
                        if !dynamicTypeSize.isAccessibilitySize {
                            Spacer()
                        }
                        value(of: row)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityElement(children: .combine)
                    .padding(.vertical, 15)
                }
            }
            .padding(.horizontal, 20)
            .background(Color(.tertiarySystemBackground), in: .rect(cornerRadius: 26))
        }
    }

    private var factLayout: AnyLayout {
        dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 4)) : AnyLayout(HStackLayout())
    }

    private func value(of row: Fact) -> some View {
        HStack(spacing: 6) {
            if let isOnline = row.presence {
                Image(systemName: "circle.fill")
                    .imageScale(.small)
                    .font(.caption2)
                    .foregroundStyle(
                        isOnline ? Color.kiroshi(.presenceOnline) : Color(.systemGray)
                    )
                    .accessibilityHidden(true)
            }
            Text(row.value)
                .foregroundStyle(.secondary)
        }
    }

    private var factRows: [Fact] {
        switch phase {
        case .refused(let refusal):
            return [Fact(id: "Invitation", value: refusal.label)]
        case .waitingForHost:
            return expiry + [Fact(id: "Host", value: "Offline", presence: false)]
        case .open, .joining, .couldNotAccept:
            return expiry
        }
    }

    private var expiry: [Fact] {
        guard let details else { return [] }
        return [
            Fact(
                id: "Expires",
                value: "\(details.expiresAt.formatted(.dateTime.month(.wide).day()))")
        ]
    }

    @ViewBuilder private var message: some View {
        switch phase {
        case .open, .joining:
            Text(
                "What you share in \(invitation.instanceName) can be read by its members and their devices, and by nobody else."
            )
            .font(.footnote)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
        case .waitingForHost:
            Text("\(host)’s computer is offline. You can accept once it’s back.")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        case .couldNotAccept:
            refusalText("Couldn’t accept. Kiroshi’s servers didn’t answer.")
        case .refused(let refusal):
            refusalText(refusal.message(inviter: inviter, expiresAt: details?.expiresAt))
        }
    }

    private func refusalText(_ text: String) -> some View {
        Text(text)
            .font(.footnote)
            .foregroundStyle(Color(.systemRed))
            .multilineTextAlignment(.center)
    }

    private var host: String {
        details?.inviter ?? inviter
    }

    @ViewBuilder private var actions: some View {
        switch phase {
        case .refused:
            EmptyView()
        case .open, .joining, .waitingForHost, .couldNotAccept:
            VStack(spacing: 8) {
                Button {
                    invitations.accept(invitation)
                } label: {
                    Text(acceptTitle)
                }
                .fontWeight(.semibold)
                .buttonSizing(.flexible)
                .buttonStyle(.borderedProminent)
                .buttonBorderShape(.capsule)
                .controlSize(.large)
                .tint(Color(.systemBlue))
                .disabled(phase == .joining || phase == .waitingForHost)
                Button {
                    invitations.decline(invitation)
                } label: {
                    Text("Decline")
                        .frame(maxWidth: .infinity, minHeight: 50)
                        .contentShape(.rect)
                }
                .buttonStyle(.borderless)
                .tint(Color(.systemBlue))
                .disabled(phase == .joining || invitations.isDeclining)
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 8)
        }
    }

    private var acceptTitle: LocalizedStringKey {
        switch phase {
        case .joining: "Joining…"
        case .couldNotAccept: "Try again"
        case .open, .waitingForHost, .refused: "Accept"
        }
    }

    private var declineFailure: LocalizedStringKey {
        "Couldn’t decline. Check your connection and tap Decline again."
    }
}

private struct Fact: Identifiable {
    let id: String
    let value: LocalizedStringKey
    var presence: Bool?
}

extension InvitationRefusal {
    fileprivate var label: LocalizedStringKey {
        switch self {
        case .expired: "Expired"
        case .withdrawn: "Withdrawn"
        case .used: "Already used"
        case .otherEmail: "For another email"
        case .unknown: "Not found"
        }
    }

    fileprivate func message(inviter: String, expiresAt: Date?) -> String {
        let asker = inviter.isEmpty ? String(localized: "the host") : inviter
        switch self {
        case .expired:
            guard let expiresAt else {
                return String(
                    localized: "This invitation expired. Ask \(asker) to invite you again.")
            }
            return String(
                localized:
                    "This invitation expired on \(expiresAt.formatted(.dateTime.month(.wide).day())). Ask \(asker) to invite you again."
            )
        case .withdrawn:
            return inviter.isEmpty
                ? String(
                    localized: "The host withdrew this invitation. Ask them to invite you again.")
                : String(
                    localized: "\(inviter) withdrew this invitation. Ask them to invite you again.")
        case .used:
            return String(
                localized: "This invitation was already used. Ask \(asker) to invite you again.")
        case .otherEmail:
            return String(
                localized:
                    "This invitation is for another email. Sign in with the email \(asker) invited, then accept it again."
            )
        case .unknown:
            return String(
                localized:
                    "This invitation doesn’t exist anymore. Ask \(asker) to invite you again.")
        }
    }
}

#if DEBUG
    #Preview("4 · Invitation badge on the space menu") {
        SignInRootView(model: .fixture(.invitationBadge))
    }

    #Preview("4.2 · Invitation sheet") {
        SignInRootView(model: .fixture(.invitationSheet))
    }

    #Preview("4.3 · Joining") {
        SignInRootView(model: .fixture(.invitationJoining))
    }

    #Preview("4.4 · Host computer offline") {
        SignInRootView(model: .fixture(.invitationHostOffline))
    }

    #Preview("4.5 · Couldn't accept") {
        SignInRootView(model: .fixture(.invitationCouldNotAccept))
    }

    #Preview("4.6 · Invitation withdrawn") {
        SignInRootView(model: .fixture(.invitationWithdrawn))
    }

    #Preview("4.7 · Joined, Home on Studio") {
        SignInRootView(model: .fixture(.invitationJoined))
    }

    #Preview("Invitation expired") {
        SignInRootView(model: .fixture(.invitationExpired))
    }

    #Preview("Invitation for another email") {
        SignInRootView(model: .fixture(.invitationOtherEmail))
    }
#endif
