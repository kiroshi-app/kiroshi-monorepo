import SwiftUI

struct ThreadScreen<Model: ThreadModel>: View {
    let model: Model
    let heading: ThreadHeading
    var opening: ThreadOpening?
    let space: SpaceStore
    @State private var position = ScrollPosition(idType: ThreadMessage.ID.self)
    @State private var scrolling = TranscriptScrolling.followingTheBottom
    @State private var sentTop: CGFloat?
    @State private var headerOverhang: CGFloat = 0

    var body: some View {
        transcript
            .background(Color(.systemBackground))
            .overlay {
                switch model.state {
                case .failed:
                    ContentUnavailableView {
                        Label(failedTitle, systemImage: "exclamationmark.triangle")
                    } description: {
                        Text("Check that your Mac is on, then try again.")
                    } actions: {
                        Button("Try Again") {
                            model.reload()
                        }
                        .buttonStyle(.bordered)
                    }
                    .background(Color(.systemBackground))
                case .empty:
                    EmptyThread(heading: heading)
                case .loading, .shown:
                    EmptyView()
                }
            }
            .safeAreaBar(edge: .bottom) {
                ThreadComposer(model: model, isHostOffline: space.offlineSpace != nil)
            }
            .scrollEdgeEffectStyle(.soft, for: .bottom)
            .navigationBarTitleDisplayMode(.inline)
            .navigationTitle(heading.title)
            .threadHeader(heading, overhang: $headerOverhang)
            .onChange(of: model.working?.spoken) { _, spoken in
                guard let spoken else { return }
                AccessibilityNotification.Announcement(spoken).post()
            }
            .task(id: space.connection.map(ObjectIdentifier.init)) {
                guard let connection = space.connection else { return }
                await model.follow(connection)
            }
    }

    @ViewBuilder private var transcript: some View {
        if model.state == .loading, space.offlineSpace == nil {
            ProgressView()
                .accessibilityLabel(loadingLabel)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            messages
        }
    }

    private var messages: some View {
        TimesRevealingScroll {
            LazyVStack(alignment: .leading, spacing: 0) {
                if let opening {
                    VStack(spacing: 20) {
                        if let separator = DaySeparator(label: opening.day) {
                            separator
                        }
                        MachineLine(text: opening.line)
                    }
                    .padding(.top, 20)
                }
                ForEach(model.entries) { message in
                    ThreadMessageView(message: message, soloCompanion: heading.companion)
                        .onGeometryChange(for: CGFloat?.self) { proxy in
                            message.id == model.lastSentId
                                ? proxy.frame(in: .transcript).minY : nil
                        } action: { top in
                            if let top {
                                sentTop = top
                            }
                        }
                }
                if let working = model.working {
                    WorkingLine(working: working)
                        .padding(.top, 20)
                }
                if let offlineSpace = space.offlineSpace {
                    HostOfflineLine(space: offlineSpace, email: space.email)
                        .padding(.top, 20)
                }
            }
            .scrollTargetLayout()
            .coordinateSpace(.transcript)
            .padding(.horizontal)
            .padding(.bottom, 12)
        }
        .contentMargins(.top, headerOverhang, for: .scrollContent)
        .scrollPosition($position)
        .defaultScrollAnchor(.bottom, for: .initialOffset)
        .defaultScrollAnchor(.bottom, for: .alignment)
        .defaultScrollAnchor(scrolling == .holdingTheSentBubble ? .top : .bottom, for: .sizeChanges)
        .onScrollGeometryChange(for: Bool.self) { geometry in
            sentTop.map { geometry.visibleTop >= $0 - 1 } ?? false
        } action: { _, sentBubbleReachesTheTop in
            if sentBubbleReachesTheTop {
                holdTheSentBubble()
            }
        }
        .onScrollPhaseChange { _, phase, context in
            if phase == .interacting {
                scrolling = .reading
            } else if phase == .idle, scrolling == .reading, context.geometry.isAtTheBottom {
                scrolling = .followingTheBottom
            }
        }
        .onChange(of: model.lastSentId) { _, sent in
            sentTop = nil
            guard let sent, scrolling == .holdingTheSentBubble else { return }
            scrolling = .followingTheBottom
            position.scrollTo(id: sent, anchor: .bottom)
        }
    }

    private func holdTheSentBubble() {
        guard let sent = model.lastSentId, scrolling == .followingTheBottom else { return }
        scrolling = .holdingTheSentBubble
        position.scrollTo(id: sent, anchor: .top)
    }

    private var failedTitle: LocalizedStringKey {
        switch model.kind {
        case .conversation: "Couldn’t load this conversation."
        case .mission: "Couldn’t load this mission."
        }
    }

    private var loadingLabel: LocalizedStringKey {
        switch model.kind {
        case .conversation: "Loading the conversation"
        case .mission: "Loading the mission"
        }
    }
}

extension ScrollGeometry {
    fileprivate var visibleTop: CGFloat {
        contentOffset.y + contentInsets.top
    }

    fileprivate var isAtTheBottom: Bool {
        visibleTop + containerSize.height >= contentSize.height - 1
    }
}

private enum TranscriptScrolling {
    case followingTheBottom
    case holdingTheSentBubble
    case reading
}

extension CoordinateSpaceProtocol where Self == NamedCoordinateSpace {
    fileprivate static var transcript: Self { .named("transcript") }
}
