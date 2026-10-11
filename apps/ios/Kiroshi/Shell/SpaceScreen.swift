import SwiftUI
import UIKit

enum SpaceSection {
    case conversations
    case missions

    var title: LocalizedStringKey {
        switch self {
        case .conversations: "Conversations"
        case .missions: "Missions"
        }
    }

    var systemImage: String {
        switch self {
        case .conversations: "bubble.left.and.bubble.right"
        case .missions: "flag"
        }
    }
}

struct SpaceScreen: View {
    let store: SpaceStore
    let account: SignInModel
    let section: SpaceSection

    var body: some View {
        NavigationStack {
            content
                .safeAreaInset(edge: .top) {
                    if let offlineSpace = store.offlineSpace {
                        HostOfflineLine(space: offlineSpace, email: store.email)
                            .padding(.horizontal, 12)
                            .padding(.bottom, 10)
                    }
                }
                .navigationTitle(store.currentSpace?.name ?? "")
                .navigationBarTitleDisplayMode(.inline)
                .toolbarTitleMenu {
                    SpaceMenu(store: store)
                }
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        SettingsButton(
                            account: account, spaces: store.spaces, section: section
                        ) {
                            AccountInitial(initial: store.accountInitial)
                        }
                        .accessibilityLabel("Settings")
                    }
                    .sharedBackgroundVisibility(.hidden)
                }
        }
    }

    @ViewBuilder private var content: some View {
        switch section {
        case .conversations:
            ConversationsView(space: store)
        case .missions:
            ContentUnavailableView(section.title, systemImage: section.systemImage)
        }
    }
}

struct AccountInitial: View {
    let initial: String

    var body: some View {
        Text(initial)
            .font(.callout.weight(.medium))
            .foregroundStyle(Color.kiroshi(.foreground))
            .frame(width: 40, height: 40)
            .background(Color.kiroshi(.muted), in: .circle)
    }
}

struct SpaceMenu: View {
    let store: SpaceStore

    var body: some View {
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
