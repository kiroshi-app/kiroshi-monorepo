import SwiftUI

extension View {
    func threadHeader<Lines: View>(
        companion: Companion?, isWorking: Bool, @ViewBuilder lines: () -> Lines
    ) -> some View {
        toolbar {
            ToolbarItem(placement: .principal) {
                ThreadHeader(companion: companion, isWorking: isWorking, lines: lines())
                    .frame(height: ThreadHeaderLayout.barHeight, alignment: .top)
                    .offset(y: -ThreadHeaderLayout.raise)
            }
        }
        .scrollEdgeEffectStyle(.soft, for: .top)
    }
}

enum ThreadHeaderLayout {
    static let barHeight: CGFloat = 44
    static let raise: CGFloat = 4
    static let overlap: CGFloat = 8
}

struct ThreadHeader<Lines: View>: View {
    let companion: Companion?
    let isWorking: Bool
    let lines: Lines

    var body: some View {
        VStack(spacing: -ThreadHeaderLayout.overlap) {
            CompanionAvatar(companion, size: .header, isWorking: isWorking)
                .zIndex(1)
            lines
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

struct CompanionHeaderLines: View {
    let companion: Companion

    var body: some View {
        VStack(spacing: 0) {
            Text(companion.name)
                .font(.footnote.weight(.semibold))
            if let role = companion.role {
                Text(role)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .lineLimit(1)
    }
}

struct MissionHeaderLines: View {
    let mission: Mission
    let companion: MissionCompanion?

    var body: some View {
        VStack(spacing: 0) {
            Text(mission.titleLine(companion: companion))
                .font(.caption2.monospaced())
                .foregroundStyle(.secondary)
            Text(mission.objective)
                .font(.footnote.weight(.semibold))
        }
        .lineLimit(1)
    }
}

#if DEBUG
    private struct HeaderPreview<Lines: View>: View {
        let companion: Companion?
        @ViewBuilder let lines: Lines

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
                        .threadHeader(companion: companion, isWorking: false) { lines }
                    }
            }
        }
    }

    #Preview("Header · conversation") {
        HeaderPreview(companion: ConversationsFixture.juniper) {
            CompanionHeaderLines(companion: ConversationsFixture.juniper)
        }
    }

    #Preview("Header · conversation · dark") {
        HeaderPreview(companion: ConversationsFixture.juniper) {
            CompanionHeaderLines(companion: ConversationsFixture.juniper)
        }
        .preferredColorScheme(.dark)
    }

    #Preview("Header · conversation · no title") {
        HeaderPreview(companion: ConversationsFixture.shoto) {
            CompanionHeaderLines(companion: ConversationsFixture.shoto)
        }
    }

    #Preview("Header · mission") {
        HeaderPreview(companion: ConversationsFixture.atlas) {
            MissionHeaderLines(
                mission: MissionsFixture.splitOnboarding, companion: ConversationsFixture.atlas)
        }
    }

    #Preview("Header · mission · dark") {
        HeaderPreview(companion: ConversationsFixture.atlas) {
            MissionHeaderLines(
                mission: MissionsFixture.splitOnboarding, companion: ConversationsFixture.atlas)
        }
        .preferredColorScheme(.dark)
    }
#endif
