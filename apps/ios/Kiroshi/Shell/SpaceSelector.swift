import SwiftUI
import UIKit

struct SpaceSelector: View {
    static let avatarSize = SpaceAvatarSize.rail

    let store: SpaceStore
    let invitations: Invitations?

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.displayScale) private var displayScale

    var body: some View {
        Menu {
            Picker(
                "Space",
                selection: Binding(get: { store.currentSpaceId }, set: { store.select($0) })
            ) {
                ForEach(store.spaces) { space in
                    let presence = store.presence(of: space)
                    Label {
                        Text(space.name)
                            .accessibilityLabel(Text(space.accessibilityName(presence)))
                    } icon: {
                        Image(uiImage: avatar(of: space, presence))
                            .accessibilityHidden(true)
                    }
                    .tag(space.id)
                }
            }
            .pickerStyle(.inline)
            if let invitations, !invitations.pending.isEmpty {
                Section("Invitations") {
                    ForEach(invitations.pending) { invitation in
                        Button {
                            invitations.open(invitation)
                        } label: {
                            Label {
                                Text(invitation.instanceName)
                                Text("Invited by \(invitation.inviterEmail)")
                            } icon: {
                                Image(systemName: "envelope")
                            }
                        }
                    }
                }
            }
        } label: {
            HStack(spacing: 4) {
                Text(store.currentSpace?.name ?? "")
                    .font(.headline)
                    .lineLimit(1)
                Image(systemName: "chevron.down")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
        }
        .badge(invitations?.pending.count ?? 0)
        .accessibilityShowsLargeContentViewer {
            Label(store.currentSpace?.name ?? "", systemImage: "chevron.down")
        }
        .accessibilityLabel("Space")
        .accessibilityValue(accessibilityValue)
    }

    private func avatar(of space: Space, _ presence: SpacePresence) -> UIImage {
        SpaceAvatar(
            spaceId: space.id, name: space.name, colour: space.colour, size: Self.avatarSize,
            state: SpaceAvatarState(presence: presence)
        )
        .image(in: colorScheme, scale: displayScale)
    }

    private var accessibilityValue: Text {
        let space = Text(
            store.currentSpace.map { $0.accessibilityName(store.presence(of: $0)) } ?? "")
        guard let count = invitations?.pending.count, count > 0 else { return space }
        return count == 1
            ? Text("\(space), 1 invitation") : Text("\(space), \(count) invitations")
    }
}

extension Space {
    fileprivate func accessibilityName(_ presence: SpacePresence) -> String {
        "\(name), \(presence.name)"
    }
}

extension SpacePresence {
    fileprivate var name: String {
        switch self {
        case .shared: "Shared"
        case .online: "Online"
        case .connecting: "Connecting…"
        case .offline: "Offline"
        }
    }
}
