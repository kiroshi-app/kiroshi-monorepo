import SwiftUI

struct SettingsView: View {
    @Bindable var model: SignInModel
    let spaces: [Space]
    @Environment(\.dismiss) private var dismiss
    @State private var shownPage: KiroshiPage?

    var body: some View {
        List {
            Section {
                AccountRow(email: model.signedInEmail)
            }
            Section {
                ForEach(KiroshiPage.allCases) { page in
                    Button(page.title) { shownPage = page }
                }
            }
            .tint(.primary)
            Section {
                Button("Sign out", role: .destructive, action: model.signOutTapped)
            } footer: {
                Text("Your spaces stop working on this iPhone until you sign in again.")
            }
        }
        .listStyle(.insetGrouped)
        .listSectionSpacing(22)
        .contentMargins(.top, 0, for: .scrollContent)
        .safeAreaBar(edge: .bottom) {
            BrandFooter()
        }
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button(role: .close) {
                    dismiss()
                }
                .tint(.primary)
            }
        }
        .fullScreenCover(item: $shownPage) { page in
            SafariView(url: page.url)
                .ignoresSafeArea()
        }
        .alert("Sign out of Kiroshi?", isPresented: $model.isConfirmingSignOut) {
            Button("Cancel", role: .cancel) {}
            Button("Sign out", role: .destructive, action: model.signOut)
        } message: {
            Text(Self.signOutMessage(for: spaces))
        }
    }

    static func signOutMessage(for spaces: [Space]) -> String {
        let names = spaces.map(\.name)
        switch names.count {
        case 0:
            return "Your spaces leave this iPhone until you sign in again."
        case 1:
            return "\(names[0]) leaves this iPhone until you sign in again."
        default:
            let listed = names.dropLast().joined(separator: ", ") + " and " + names[names.count - 1]
            return "\(listed) leave this iPhone until you sign in again."
        }
    }
}

private struct AccountRow: View {
    let email: String
    @ScaledMetric(relativeTo: .title2) private var avatarSide = 56
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        layout {
            Text(initial)
                .font(.title2.weight(.medium))
                .foregroundStyle(Color.kiroshi(.foreground))
                .frame(width: avatarSide, height: avatarSide)
                .background(Color.kiroshi(.muted), in: .circle)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text("Email")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                Text(email)
                    .font(.headline)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var layout: AnyLayout {
        dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 14))
            : AnyLayout(HStackLayout(spacing: 14))
    }

    private var initial: String {
        email.first.map { String($0).uppercased() } ?? ""
    }
}

private struct BrandFooter: View {
    @ScaledMetric(relativeTo: .footnote) private var markWidth = 32

    var body: some View {
        VStack(spacing: 8) {
            Image("Hexagon")
                .resizable()
                .scaledToFit()
                .frame(width: markWidth)
                .accessibilityHidden(true)
            Text(Self.version)
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.bottom, 10)
        .accessibilityElement(children: .combine)
    }

    private static let version: String = {
        let info = Bundle.main.infoDictionary
        let marketing = info?["CFBundleShortVersionString"] as? String ?? ""
        let build = info?["CFBundleVersion"] as? String ?? ""
        return "Kiroshi \(marketing) (\(build))"
    }()
}

#if DEBUG
    #Preview("6.1 Settings · sheet") {
        SignInRootView(model: .fixture(.settings))
    }

    #Preview("6.2 Sign out · confirmation alert") {
        SignInRootView(model: .fixture(.signOutAlert))
    }
#endif
