import SwiftUI

struct ThreadScreen<Model: ThreadModel>: View {
    let model: Model
    let heading: ThreadHeading
    var opening: ThreadOpening?
    let space: SpaceStore

    var body: some View {
        TimesRevealingScroll {
            LazyVStack(alignment: .leading, spacing: 0) {
                if let opening {
                    VStack(spacing: 20) {
                        DaySeparator(label: opening.day)
                        MachineLine(text: opening.line)
                    }
                    .padding(.top, 20)
                }
                ForEach(model.entries) { entry in
                    ThreadEntryView(entry: entry, soloCompanion: heading.companion)
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
            .padding(.horizontal)
            .padding(.bottom, 12)
        }
        .defaultScrollAnchor(.bottom)
        .defaultScrollAnchor(.bottom, for: .sizeChanges)
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
            case .loading where space.offlineSpace == nil:
                ProgressView()
                    .accessibilityLabel(loadingLabel)
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
        .threadHeader(heading)
        .toolbar(.hidden, for: .tabBar)
        .task(id: space.connection.map(ObjectIdentifier.init)) {
            guard let connection = space.connection else { return }
            await model.follow(connection)
        }
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
