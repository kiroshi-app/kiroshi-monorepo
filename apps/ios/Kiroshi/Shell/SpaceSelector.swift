import SwiftUI
import UIKit

struct SpaceSelector: View {
    let store: SpaceStore

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
        .accessibilityShowsLargeContentViewer {
            Label(store.currentSpace?.name ?? "", systemImage: "chevron.down")
        }
        .accessibilityLabel("Space")
        .accessibilityValue(store.currentSpace.map { Text($0.accessibilityName) } ?? Text(""))
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
