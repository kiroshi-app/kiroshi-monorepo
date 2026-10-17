import SwiftUI

struct ThreadHeading: Equatable {
    var avatar: ConversationAvatar
    var working: Set<Companion.ID> = []
    var overline: String?
    var title: String
    var subtitle: String?

    var companion: Companion? {
        guard case .companion(let companion) = avatar else { return nil }
        return companion
    }
}

extension View {
    func threadHeader(_ heading: ThreadHeading, overhang: Binding<CGFloat>) -> some View {
        modifier(ThreadHeaderBar(heading: heading, overhang: overhang))
    }
}

private struct ThreadHeaderBar: ViewModifier {
    let heading: ThreadHeading
    @Binding var overhang: CGFloat
    @State private var barWidth: CGFloat?

    func body(content: Content) -> some View {
        content
            .onGeometryChange(for: CGFloat.self, of: \.size.width) { barWidth = $0 }
            .toolbar {
                ToolbarItem(placement: .principal) {
                    ThreadHeader(heading: heading)
                        .onGeometryChange(for: CGFloat.self) { proxy in
                            ThreadHeaderLayout.overhang(ofHeaderHeight: proxy.size.height)
                        } action: {
                            overhang = $0
                        }
                        .frame(height: ThreadHeaderLayout.barHeight, alignment: .top)
                        .offset(y: -ThreadHeaderLayout.raise)
                        .frame(width: barWidth.map(ThreadHeaderLayout.width(in:)))
                }
            }
            .scrollEdgeEffectStyle(.soft, for: .top)
    }
}

enum ThreadHeaderLayout {
    static let barHeight: CGFloat = 44
    static let raise: CGFloat = 4
    static let overlap: CGFloat = 8
    static let sideReserve: CGFloat = 76

    static func width(in barWidth: CGFloat) -> CGFloat {
        max(0, barWidth - 2 * sideReserve)
    }

    static func overhang(ofHeaderHeight height: CGFloat) -> CGFloat {
        max(0, height - barHeight - raise)
    }
}

struct ThreadHeader: View {
    let heading: ThreadHeading

    var body: some View {
        VStack(spacing: -ThreadHeaderLayout.overlap) {
            ConversationAvatarView(
                avatar: heading.avatar, size: .header, isWorking: !heading.working.isEmpty
            )
            .zIndex(1)
            VStack(spacing: 0) {
                if let overline = heading.overline {
                    Text(overline)
                        .font(.caption2.monospaced())
                        .foregroundStyle(.secondary)
                }
                Text(heading.title)
                    .font(.footnote.weight(.semibold))
                if let subtitle = heading.subtitle {
                    Text(subtitle)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .lineLimit(1)
            .multilineTextAlignment(.center)
            .padding(.horizontal, 14)
            .padding(.top, 4)
            .padding(.bottom, 5)
            .glassEffect(in: .capsule)
            .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
        }
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
        .accessibilityShowsLargeContentViewer()
    }
}

#if DEBUG
    private struct HeaderPreview: View {
        let heading: ThreadHeading
        var hasTrailingItem = false

        var body: some View {
            NavigationStack {
                Color.clear
                    .navigationDestination(isPresented: .constant(true)) {
                        ScrollView {
                            Text("They’re waiting for your read.")
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding()
                        }
                        .defaultScrollAnchor(.bottom)
                        .navigationBarTitleDisplayMode(.inline)
                        .threadHeader(heading, overhang: .constant(0))
                        .toolbar {
                            if hasTrailingItem {
                                ToolbarItem(placement: .topBarTrailing) {
                                    Button("More", systemImage: "ellipsis") {}
                                }
                            }
                        }
                    }
            }
        }
    }

    #Preview("Header · conversation") {
        HeaderPreview(
            heading: ThreadHeading(
                avatar: .companion(ConversationsFixture.juniper), title: "Juniper",
                subtitle: "Writer"))
    }

    #Preview("Header · conversation · dark") {
        HeaderPreview(
            heading: ThreadHeading(
                avatar: .companion(ConversationsFixture.juniper), title: "Juniper",
                subtitle: "Writer")
        )
        .preferredColorScheme(.dark)
    }

    #Preview("Header · conversation · no title") {
        HeaderPreview(
            heading: ThreadHeading(
                avatar: .companion(ConversationsFixture.shoto), title: "Shoto"))
    }

    #Preview("Header · conversation · long name · trailing item") {
        HeaderPreview(
            heading: ThreadHeading(
                avatar: .companion(ConversationsFixture.longNamed),
                title: ConversationsFixture.longNamed.name,
                subtitle: ConversationsFixture.longNamed.role),
            hasTrailingItem: true)
    }

    #Preview("Header · solo") {
        HeaderPreview(heading: ConversationsFixture.everywhereHeadings[0])
    }

    #Preview("Header · solo · dark") {
        HeaderPreview(heading: ConversationsFixture.everywhereHeadings[0])
            .preferredColorScheme(.dark)
    }

    #Preview("Header · icon, no colour") {
        HeaderPreview(heading: ConversationsFixture.everywhereHeadings[1])
    }

    #Preview("Header · icon, no colour · dark") {
        HeaderPreview(heading: ConversationsFixture.everywhereHeadings[1])
            .preferredColorScheme(.dark)
    }

    #Preview("Header · icon, red") {
        HeaderPreview(heading: ConversationsFixture.everywhereHeadings[2])
    }

    #Preview("Header · icon, red · dark") {
        HeaderPreview(heading: ConversationsFixture.everywhereHeadings[2])
            .preferredColorScheme(.dark)
    }

    #Preview("Header · mission") {
        HeaderPreview(
            heading: ThreadHeading(
                avatar: .companion(ConversationsFixture.atlas),
                overline: MissionsFixture.splitOnboarding.titleLine(
                    companion: ConversationsFixture.atlas),
                title: MissionsFixture.splitOnboarding.objective))
    }

    #Preview("Header · mission · dark") {
        HeaderPreview(
            heading: ThreadHeading(
                avatar: .companion(ConversationsFixture.atlas),
                overline: MissionsFixture.splitOnboarding.titleLine(
                    companion: ConversationsFixture.atlas),
                title: MissionsFixture.splitOnboarding.objective)
        )
        .preferredColorScheme(.dark)
    }
#endif
