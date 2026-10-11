import SwiftUI

struct ThreadView: View {
    let space: SpaceStore
    @State private var thread: ThreadStore
    @Environment(\.dismiss) private var dismiss

    init(companion: Companion, space: SpaceStore) {
        self.space = space
        #if DEBUG
            let draft = ConversationsFixture.draft
        #else
            let draft = ""
        #endif
        _thread = State(initialValue: ThreadStore(companion: companion, draft: draft))
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
                ForEach(thread.entries) { entry in
                    ThreadEntryView(entry: entry)
                }
                if thread.isWorking {
                    WorkingLabel(name: thread.companion.name, font: .subheadline)
                        .padding(.vertical, 4)
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 12)
        }
        .defaultScrollAnchor(.bottom)
        .defaultScrollAnchor(.bottom, for: .sizeChanges)
        .background(Color.kiroshi(.card))
        .overlay {
            if thread.phase == .failed {
                ContentUnavailableView {
                    Label(
                        "Couldn’t load this conversation.", systemImage: "exclamationmark.triangle")
                } description: {
                    Text("Check that your Mac is on, then try again.")
                } actions: {
                    Button("Try Again") {
                        thread.reload()
                    }
                    .buttonStyle(.bordered)
                }
                .background(Color.kiroshi(.card))
            } else if thread.phase == .loaded, thread.entries.isEmpty, !thread.isWorking {
                ContentUnavailableView {
                    Label {
                        Text(thread.companion.name)
                    } icon: {
                        CompanionAvatar(thread.companion, size: .hero)
                    }
                } description: {
                    Text("Nothing here yet. Your first message starts the conversation.")
                }
            }
        }
        .safeAreaInset(edge: .top) {
            if let offlineSpace = space.offlineSpace {
                HostOfflineLine(space: offlineSpace, email: space.email)
                    .padding(.horizontal)
                    .padding(.vertical, 8)
                    .background(.bar)
            }
        }
        .safeAreaBar(edge: .bottom) {
            ThreadComposer(thread: thread, isHostOffline: space.offlineSpace != nil)
        }
        .navigationBarTitleDisplayMode(.inline)
        .navigationTitle(thread.companion.name)
        .toolbar(.hidden, for: .tabBar)
        .task(id: space.connection.map(ObjectIdentifier.init)) {
            guard let connection = space.connection else { return }
            await thread.follow(connection)
        }
        .onChange(of: space.currentSpaceId) {
            dismiss()
        }
    }
}

struct ThreadEntryView: View {
    let entry: ThreadEntry

    var body: some View {
        switch entry {
        case .message(let message):
            if let dayLabel = message.dayLabel {
                Text(dayLabel)
                    .font(.footnote.weight(.medium))
                    .foregroundStyle(Color.kiroshi(.mutedForeground))
                    .frame(maxWidth: .infinity)
            }
            if message.isYours {
                Text(message.rendered)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(Color.kiroshi(.userBubble), in: .rect(cornerRadius: 20))
                    .foregroundStyle(Color.kiroshi(.userBubbleForeground))
                    .padding(.leading, 64)
                    .frame(maxWidth: .infinity, alignment: .trailing)
                    .textSelection(.enabled)
            } else {
                Text(message.rendered)
                    .lineSpacing(2)
                    .foregroundStyle(Color.kiroshi(.foreground))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .textSelection(.enabled)
            }
        case .activities(let group):
            ActivityGroupView(group: group)
        }
    }
}

struct ActivityGroupView: View {
    let group: ActivityGroup
    @State private var isExpanded = false

    var body: some View {
        DisclosureGroup(isExpanded: $isExpanded) {
            VStack(alignment: .leading, spacing: 4) {
                ForEach(group.activities) { activity in
                    Text(activity.title)
                        .font(.footnote.monospaced())
                        .foregroundStyle(Color.kiroshi(.mutedForeground))
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(.leading, 28)
            .padding(.top, 4)
        } label: {
            Label(group.summary, systemImage: "wrench")
                .font(.subheadline)
                .foregroundStyle(Color.kiroshi(.foreground))
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(Color.kiroshi(.muted), in: .rect(cornerRadius: 16))
    }
}

struct ThreadComposer: View {
    @Bindable var thread: ThreadStore
    let isHostOffline: Bool
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let failure = thread.sendFailure {
                ProblemLabel(message: failure.message(name: thread.companion.name))
            }
            if thread.stopFailed {
                ProblemLabel(
                    message: "Couldn’t stop \(thread.companion.name). Tap Stop to try again.")
            }
            HStack(alignment: .bottom, spacing: 8) {
                TextField(placeholder, text: $thread.draft, axis: .vertical)
                    .lineLimit(1...(dynamicTypeSize.isAccessibilitySize ? 3 : 6))
                    .padding(.vertical, 9)
                    .foregroundStyle(Color.kiroshi(.foreground))
                    .disabled(isHostOffline)
                if thread.isWorking {
                    Button {
                        thread.stop()
                    } label: {
                        Image(systemName: "stop.circle.fill")
                            .font(.title)
                    }
                    .disabled(thread.runningScope == nil)
                    .accessibilityLabel("Stop")
                } else if !thread.draft.isEmpty {
                    Button {
                        thread.send()
                    } label: {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.title)
                    }
                    .disabled(!thread.canSend || isHostOffline)
                    .accessibilityLabel("Send")
                }
            }
            .padding(.leading, 14)
            .padding(.trailing, 4)
            .padding(.vertical, 2)
            .overlay {
                RoundedRectangle(cornerRadius: 20)
                    .strokeBorder(Color.kiroshi(.border))
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    private var placeholder: String {
        thread.entries.isEmpty ? "Message \(thread.companion.name)" : String(localized: "Message")
    }
}

extension SendFailure {
    func message(name: String) -> LocalizedStringKey {
        switch self {
        case .hostOffline:
            "Couldn’t send, the Mac hosting this Space is offline. Tap Send again once it’s back."
        case .stillWorking:
            "Couldn’t send, \(name) is still working. Tap Send again once it answers."
        case .refused: "Couldn’t send. Tap Send to try again."
        }
    }
}
