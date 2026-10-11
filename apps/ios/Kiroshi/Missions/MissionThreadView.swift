import SwiftUI

struct MissionThreadView: View {
    let missions: MissionsStore
    let space: SpaceStore
    @State private var thread: MissionThreadStore

    init(mission: Mission, missions: MissionsStore, space: SpaceStore) {
        self.missions = missions
        self.space = space
        _thread = State(initialValue: MissionThreadStore(mission: mission))
    }

    var body: some View {
        TimesRevealingScroll {
            LazyVStack(alignment: .leading, spacing: 0) {
                VStack(spacing: 20) {
                    DaySeparator(label: thread.transcript.openedDay)
                    MachineLine(text: MissionTranscript.openedLine(by: companion))
                }
                .padding(.top, 20)
                ForEach(thread.transcript.entries) { entry in
                    ThreadEntryView(entry: entry, soloCompanion: companion)
                    if let names = thread.transcript.attachments[entry.id] {
                        AttachedFiles(names: names)
                            .padding(.top, 4)
                    }
                }
            }
            .padding(.horizontal)
            .padding(.bottom, 12)
        }
        .defaultScrollAnchor(.bottom)
        .defaultScrollAnchor(.bottom, for: .sizeChanges)
        .background(Color(.systemBackground))
        .overlay {
            if thread.hasFailed {
                ContentUnavailableView {
                    Label("Couldn’t load this mission", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(
                        "The mission is still there; only this view didn’t load. Go back and open it again."
                    )
                }
                .background(Color(.systemBackground))
            }
        }
        .safeAreaBar(edge: .bottom) {
            MissionComposer(thread: thread)
        }
        .navigationTitle(thread.mission.objective)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                MissionTitle(mission: thread.mission, companion: companion)
            }
        }
        .toolbar(.hidden, for: .tabBar)
        .task(id: space.connection.map(ObjectIdentifier.init)) {
            guard let connection = space.connection else { return }
            await thread.follow(connection)
        }
    }

    private var companion: MissionCompanion? {
        missions.companion(of: thread.mission)
    }
}

struct MissionTitle: View {
    let mission: Mission
    let companion: MissionCompanion?

    var body: some View {
        HStack(spacing: 8) {
            CompanionAvatar(companion, size: .title, isWorking: mission.isAgentRunning)
            VStack(alignment: .leading, spacing: 0) {
                Text(mission.titleLine(companion: companion))
                    .font(.caption2.monospaced())
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Text(mission.objective)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
            }
        }
        .padding(.leading, 8)
        .padding(.trailing, 16)
        .frame(minHeight: 44)
        .glassEffect(in: .capsule)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
        .accessibilityShowsLargeContentViewer()
    }
}

struct MachineLine: View {
    let text: String

    var body: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(.tertiary)
                .frame(width: 5, height: 5)
                .accessibilityHidden(true)
            Text(text)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 4)
    }
}

struct AttachedFiles: View {
    let names: [String]

    var body: some View {
        VStack(alignment: .trailing, spacing: 2) {
            ForEach(names, id: \.self) { name in
                Label(name, systemImage: "paperclip")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .trailing)
        .padding(.trailing, 4)
    }
}
