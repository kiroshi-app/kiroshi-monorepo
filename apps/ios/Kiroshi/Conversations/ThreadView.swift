import SwiftUI

struct ThreadView: View {
    let space: SpaceStore
    @State private var thread: ThreadStore
    @Environment(\.dismiss) private var dismiss

    init(subject: ConversationSubject, space: SpaceStore) {
        self.space = space
        #if DEBUG
            let draft = ConversationsFixture.draft
        #else
            let draft = ""
        #endif
        _thread = State(initialValue: ThreadStore(subject: subject, draft: draft))
    }

    var body: some View {
        TimesRevealingScroll {
            LazyVStack(alignment: .leading, spacing: 0) {
                ForEach(thread.entries) { entry in
                    ThreadEntryView(entry: entry, soloCompanion: soloCompanion)
                }
                if thread.isWorking {
                    WorkingLine(
                        companion: thread.workingCompanions.first ?? thread.subject.members.first,
                        name: thread.workingName, isSeveral: thread.workingCompanions.count > 1,
                        since: thread.workingSince
                    )
                    .padding(.top, 20)
                }
                if let offlineSpace = space.offlineSpace {
                    HostOfflineLine(space: offlineSpace, email: space.email)
                        .padding(.top, 20)
                }
            }
            .padding(.horizontal)
            .padding(.bottom, 12)
        }
        .defaultScrollAnchor(.bottom)
        .defaultScrollAnchor(.bottom, for: .sizeChanges)
        .background(Color(.systemBackground))
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
                .background(Color(.systemBackground))
            } else if thread.phase == .loaded, thread.entries.isEmpty, !thread.isWorking {
                EmptyThread(subject: thread.subject)
            } else if thread.phase == .loading, thread.entries.isEmpty, !thread.isWorking,
                space.offlineSpace == nil
            {
                ProgressView()
                    .accessibilityLabel("Loading the conversation")
            }
        }
        .safeAreaBar(edge: .bottom) {
            ThreadComposer(thread: thread, isHostOffline: space.offlineSpace != nil)
        }
        .navigationBarTitleDisplayMode(.inline)
        .navigationTitle(thread.subject.title)
        .toolbar {
            ToolbarItem(placement: .principal) {
                ThreadTitle(
                    subject: thread.subject,
                    working: thread.isWorking ? Set(thread.workingCompanions.map(\.id)) : [])
            }
        }
        .toolbar(.hidden, for: .tabBar)
        .task(id: space.connection.map(ObjectIdentifier.init)) {
            guard let connection = space.connection else { return }
            await thread.follow(connection)
        }
        .onChange(of: space.currentSpaceId) {
            dismiss()
        }
        .onChange(of: thread.isDeleted) {
            dismiss()
        }
    }

    private var soloCompanion: Companion? {
        guard case .companion(let companion) = thread.subject else { return nil }
        return companion
    }
}

struct ThreadEntryView: View {
    let entry: ThreadEntry
    let soloCompanion: Companion?

    var body: some View {
        switch entry {
        case .message(let message) where !message.bubbles.isEmpty:
            VStack(spacing: 20) {
                if let dayLabel = message.dayLabel {
                    DaySeparator(label: dayLabel)
                }
                MessageBubbles(
                    isYours: message.isYours, bubbles: message.bubbles,
                    author: message.author ?? soloCompanion,
                    showsAvatar: message.closesRun,
                    name: message.opensRun ? message.author?.name : nil, time: message.time,
                    accessibilityText: accessibilityText(of: message))
            }
            .padding(.top, message.opensRun ? 20 : 4)
        case .message:
            EmptyView()
        case .activities(let group):
            ActivityGroupView(group: group)
                .padding(.top, 20)
        }
    }

    private func accessibilityText(of message: ThreadMessage) -> Text {
        guard let author = message.author else { return Text(message.rendered) }
        return Text("\(author.name), \(message.rendered)")
    }
}

struct ThreadTitle: View {
    let subject: ConversationSubject
    let working: Set<Companion.ID>

    var body: some View {
        HStack(spacing: 8) {
            switch subject {
            case .companion(let companion):
                CompanionAvatar(companion, size: .title, isWorking: !working.isEmpty)
            case .group(let group):
                GroupAvatar(group: group, size: .title, working: working)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(subject.title)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                if case .companion(let companion) = subject, let role = companion.role {
                    Text(role)
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .padding(.horizontal, 6)
                        .background(Color(.systemGray5), in: .rect(cornerRadius: 5))
                }
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

struct EmptyThread: View {
    let subject: ConversationSubject

    var body: some View {
        ContentUnavailableView {
            Label {
                HStack(spacing: 6) {
                    Text(subject.title)
                    if case .companion(let companion) = subject, let role = companion.role {
                        RoleBadge(role: role)
                    }
                }
            } icon: {
                switch subject {
                case .companion(let companion):
                    CompanionAvatar(companion, size: .hero)
                case .group(let group):
                    GroupAvatar(group: group, size: .hero)
                }
            }
        } description: {
            Text("Nothing here yet. Your first message starts the conversation.")
        }
    }
}

struct WorkingLine: View {
    let companion: Companion?
    let name: String
    let isSeveral: Bool
    let since: Date?

    var body: some View {
        HStack(spacing: 8) {
            CompanionAvatar(companion, size: .message, isWorking: true)
            Group {
                if isSeveral {
                    Text("\(name) are working…")
                } else {
                    Text("\(name) is working…")
                }
            }
            .font(.subheadline.weight(.medium))
            .foregroundStyle(.secondary)
            .modifier(Shimmer())
            .frame(maxWidth: .infinity, alignment: .leading)
            if let since {
                TimelineView(.periodic(from: since, by: 1)) { timeline in
                    Text(ConversationTime.elapsed(since: since, at: timeline.date))
                        .font(.subheadline)
                        .monospacedDigit()
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.horizontal, 4)
    }
}

private struct Shimmer: ViewModifier {
    static let period = 2.0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        if reduceMotion {
            content
        } else {
            content.overlay {
                TimelineView(.animation) { timeline in
                    let phase =
                        timeline.date.timeIntervalSinceReferenceDate
                        .truncatingRemainder(dividingBy: Self.period) / Self.period
                    LinearGradient(
                        colors: [.clear, .primary.opacity(0.6), .clear],
                        startPoint: UnitPoint(x: phase * 3 - 1.5, y: 0.5),
                        endPoint: UnitPoint(x: phase * 3 - 0.5, y: 0.5))
                }
                .mask(content)
                .accessibilityHidden(true)
            }
        }
    }
}

struct MentionSuggestions: View {
    let companions: [Companion]
    let pick: (Companion) -> Void
    @ScaledMetric(relativeTo: .body) private var rowHeight: CGFloat = 44

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                ForEach(companions) { companion in
                    Button {
                        pick(companion)
                    } label: {
                        Label {
                            Text(companion.name)
                                .foregroundStyle(.primary)
                        } icon: {
                            CompanionAvatar(companion, size: .inline)
                        }
                        .frame(maxWidth: .infinity, minHeight: rowHeight, alignment: .leading)
                        .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Mention \(companion.name)")
                    if companion.id != companions.last?.id {
                        Divider()
                    }
                }
            }
            .padding(.horizontal, 14)
        }
        .scrollBounceBehavior(.basedOnSize)
        .frame(height: min(CGFloat(companions.count), 4.5) * (rowHeight + 1))
        .background(Color(.secondarySystemBackground), in: .rect(cornerRadius: 20))
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
    @ScaledMetric(relativeTo: .body) private var control: CGFloat = 32
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if !thread.mentionCandidates.isEmpty {
                MentionSuggestions(companions: thread.mentionCandidates) { companion in
                    thread.mention(companion)
                }
            }
            if let failure = thread.sendFailure {
                ProblemLabel(message: failure.message(name: thread.workingName))
            }
            if thread.stopFailed {
                ProblemLabel(
                    message: "Couldn’t stop \(thread.workingName). Tap Stop to try again.")
            }
            HStack(alignment: .bottom, spacing: 8) {
                TextField(placeholder, text: $thread.draft, axis: .vertical)
                    .lineLimit(1...(dynamicTypeSize.isAccessibilitySize ? 3 : 6))
                    .padding(.vertical, 11)
                    .disabled(isHostOffline)
                if thread.isWorking {
                    Button {
                        thread.stop()
                    } label: {
                        controlButton(systemImage: "stop.fill", font: .caption2)
                    }
                    .disabled(thread.runningScope == nil)
                    .accessibilityLabel("Stop")
                } else if !thread.draft.isEmpty {
                    Button {
                        thread.send()
                    } label: {
                        controlButton(systemImage: "arrow.up", font: .subheadline.weight(.semibold))
                            .opacity(thread.canSend && !isHostOffline ? 1 : 0.3)
                    }
                    .disabled(!thread.canSend || isHostOffline)
                    .accessibilityLabel("Send")
                }
            }
            .buttonStyle(.plain)
            .padding(.leading, 16)
            .padding(.trailing, 6)
            .background(Color(.secondarySystemBackground), in: .rect(cornerRadius: 22))
            .overlay {
                RoundedRectangle(cornerRadius: 22)
                    .strokeBorder(Color(.systemGray5))
            }
            .opacity(isHostOffline ? 0.4 : 1)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    private func controlButton(systemImage: String, font: Font) -> some View {
        Image(systemName: systemImage)
            .font(font)
            .foregroundStyle(Color(.systemBackground))
            .frame(width: control, height: control)
            .background(.primary, in: .circle)
            .padding(.vertical, 6)
    }

    private var placeholder: String {
        String(localized: "Message \(thread.subject.title)")
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

#if DEBUG
    #Preview("3.1 Thread · conversation") {
        SignInRootView(model: .fixture(.thread))
    }

    #Preview("3.2 State · empty thread") {
        SignInRootView(model: .fixture(.emptyThread))
    }

    #Preview("3.3 State · agent working") {
        SignInRootView(model: .fixture(.workingThread))
    }

    #Preview("3.4 State · host offline") {
        SignInRootView(model: .fixture(.threadHostOffline))
    }

    #Preview("3.5 Gesture · swipe left shows times") {
        SignInRootView(model: .fixture(.swipedThread))
    }

    #Preview("Group thread") {
        SignInRootView(model: .fixture(.groupThread))
    }
#endif
