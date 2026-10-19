import SwiftUI

struct InvitationList: View {
    let invitations: Invitations

    var body: some View {
        VStack(spacing: 8) {
            Text("Invitations")
                .font(.headline)
                .accessibilityAddTraits(.isHeader)
            ForEach(invitations.pending) { invitation in
                Button {
                    invitations.open(invitation)
                } label: {
                    VStack(spacing: 2) {
                        Text(invitation.instanceName)
                            .font(.body.weight(.semibold))
                        Text("Invited by \(invitation.inviterEmail)")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 6)
                }
                .buttonSizing(.flexible)
                .buttonStyle(.bordered)
                .buttonBorderShape(.roundedRectangle(radius: 16))
                .tint(.primary)
            }
        }
    }
}

extension View {
    func invitationSheet(_ invitations: Invitations?) -> some View {
        sheet(
            item: Binding {
                invitations?.opened
            } set: { opened in
                if opened == nil {
                    invitations?.opened = nil
                }
            }
        ) { invitation in
            if let invitations {
                InvitationSheet(invitations: invitations, invitation: invitation)
            }
        }
    }
}
