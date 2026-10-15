import SwiftUI

struct MessageConsentSheet: View {
    let agreeAndSend: () -> Void
    let notNow: () -> Void
    @State private var isShowingPrivacy = false
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        ScrollView { disclosure }
            .defaultScrollAnchor(.center, for: .alignment)
            .scrollBounceBehavior(.basedOnSize)
            .safeAreaBar(edge: .bottom) {
                VStack(spacing: 4) {
                    Button("Agree and send", action: agreeAndSend)
                        .primaryAction()
                    Button(action: notNow) {
                        Text("Not now")
                            .padding(.vertical, 13)
                            .padding(.horizontal, 16)
                    }
                    .fontWeight(.medium)
                    .buttonStyle(.borderless)
                    .tint(.primary)
                }
                .bottomActions()
            }
            .presentationDetents(dynamicTypeSize.isAccessibilitySize ? [.large] : [.medium])
            .presentationDragIndicator(.visible)
            .presentationBackground(Color(.systemBackground))
            .fullScreenCover(isPresented: $isShowingPrivacy) {
                SafariView(url: KiroshiPage.privacy.url)
                    .ignoresSafeArea()
            }
    }

    private var disclosure: some View {
        VStack(spacing: 14) {
            MessagePath()
                .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
                .padding(.bottom, 4)
            Text("Where your messages go")
                .font(.title2.bold())
                .accessibilityAddTraits(.isHeader)
            Text(
                "Messages you send here go to your Mac through Kiroshi’s relay. Your Mac passes them to the agent, which sends them to the model provider your Mac uses."
            )
            .foregroundStyle(.secondary)
            Button {
                isShowingPrivacy = true
            } label: {
                Text(KiroshiPage.privacy.title)
                    .frame(minHeight: 44)
            }
            .fontWeight(.medium)
            .tint(Color(.systemBlue))
        }
        .multilineTextAlignment(.center)
        .padding(.horizontal, 40)
        .padding(.vertical, 16)
        .frame(maxWidth: .infinity)
    }
}

private struct MessagePath: View {
    @ScaledMetric(relativeTo: .body) private var side: CGFloat = 44

    var body: some View {
        HStack(spacing: 10) {
            stop("iphone")
            link
            stop("laptopcomputer")
            link
            stop("sparkle")
        }
        .accessibilityHidden(true)
    }

    private func stop(_ symbol: String) -> some View {
        Image(systemName: symbol)
            .font(.title3)
            .frame(width: side, height: side)
            .background(.fill.tertiary, in: .circle)
    }

    private var link: some View {
        Image(systemName: "ellipsis")
            .font(.footnote.weight(.semibold))
            .foregroundStyle(Color(.systemGray3))
    }
}

#if DEBUG
    #Preview("D · Half sheet") {
        Color(.systemBackground)
            .sheet(isPresented: .constant(true)) {
                MessageConsentSheet(agreeAndSend: {}, notNow: {})
            }
    }
#endif
