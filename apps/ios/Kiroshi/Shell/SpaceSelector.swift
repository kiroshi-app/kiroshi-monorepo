import SwiftUI
import UIKit

struct SpaceSelector: View {
    let store: SpaceStore
    let invitations: Invitations?

    var body: some View {
        Menu {
            Picker(
                "Space",
                selection: Binding(get: { store.currentSpaceId }, set: { store.select($0) })
            ) {
                ForEach(store.spaces) { space in
                    Label {
                        Text(space.name)
                            .accessibilityLabel(Text(space.accessibilityName))
                    } icon: {
                        Image(uiImage: space.isHostOnline ? .onlineDot : .offlineDot)
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

    private var accessibilityValue: Text {
        let space = Text(store.currentSpace?.accessibilityName ?? "")
        guard let count = invitations?.pending.count, count > 0 else { return space }
        return count == 1
            ? Text("\(space), 1 invitation") : Text("\(space), \(count) invitations")
    }
}

extension Space {
    fileprivate var accessibilityName: String {
        "\(name), \(isHostOnline ? "online" : "offline")"
    }
}

extension UIImage {
    fileprivate static let onlineDot = presenceDot(.kiroshi(.presenceOnline))
    fileprivate static let offlineDot = presenceDot(.systemGray)

    private static func presenceDot(_ color: UIColor) -> UIImage {
        let dot = UIImage(
            systemName: "circle.fill", withConfiguration: UIImage.SymbolConfiguration(scale: .small)
        )
        return dot?.withTintColor(color, renderingMode: .alwaysOriginal) ?? UIImage()
    }
}
