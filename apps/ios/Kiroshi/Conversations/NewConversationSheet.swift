import SwiftUI

struct NewConversationSheet: View {
    let companions: [Companion]
    let creation: ConversationsStore.Creation
    let create: ([Companion.ID]) -> Void
    let cancel: () -> Void
    @State private var selection: Set<Companion.ID>

    init(
        companions: [Companion], creation: ConversationsStore.Creation,
        selection: Set<Companion.ID> = [], create: @escaping ([Companion.ID]) -> Void,
        cancel: @escaping () -> Void
    ) {
        self.companions = companions
        self.creation = creation
        self.create = create
        self.cancel = cancel
        _selection = State(initialValue: selection)
    }

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("New Conversation")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel", systemImage: "xmark", role: .cancel, action: cancel)
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        if creation == .creating {
                            ProgressView()
                                .accessibilityLabel("Creating the conversation")
                        } else {
                            Button("Create", systemImage: "checkmark", role: .confirm) {
                                create(companions.map(\.id).filter(selection.contains))
                            }
                            .disabled(selection.isEmpty)
                        }
                    }
                }
        }
        .interactiveDismissDisabled(creation == .creating)
    }

    @ViewBuilder private var content: some View {
        if companions.isEmpty {
            ContentUnavailableView(
                "No agents yet", systemImage: "person.2",
                description: Text("Add one on your computer. It shows up here."))
        } else {
            List {
                if creation == .failed {
                    Section {
                        Label {
                            Text(
                                "Couldn’t create the conversation. Check that the computer where Kiroshi runs is on, then try again."
                            )
                        } icon: {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundStyle(.red)
                        }
                    }
                }
                Section {
                    ForEach(companions) { companion in
                        CompanionChoice(
                            companion: companion, isSelected: selection.contains(companion.id)
                        ) {
                            toggle(companion.id)
                        }
                    }
                }
            }
            .disabled(creation == .creating)
        }
    }

    private func toggle(_ companionId: Companion.ID) {
        if selection.contains(companionId) {
            selection.remove(companionId)
        } else {
            selection.insert(companionId)
        }
    }
}

private struct CompanionChoice: View {
    let companion: Companion
    let isSelected: Bool
    let toggle: () -> Void

    var body: some View {
        Button(action: toggle) {
            HStack(spacing: 12) {
                CompanionAvatar(companion, size: .title)
                Text(companion.name)
                    .foregroundStyle(Color.primary)
                Spacer()
                if isSelected {
                    Image(systemName: "checkmark")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(.tint)
                        .accessibilityHidden(true)
                }
            }
        }
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

#if DEBUG
    #Preview("Several companions") {
        NewConversationSheet(
            companions: ConversationsFixture.companions, creation: .idle, create: { _ in },
            cancel: {})
    }

    #Preview("Empty Space") {
        NewConversationSheet(companions: [], creation: .idle, create: { _ in }, cancel: {})
    }

    #Preview("Creating") {
        NewConversationSheet(
            companions: ConversationsFixture.companions, creation: .creating,
            selection: [ConversationsFixture.juniper.id, ConversationsFixture.pico.id],
            create: { _ in }, cancel: {})
    }

    #Preview("Failure") {
        NewConversationSheet(
            companions: ConversationsFixture.companions, creation: .failed,
            selection: [ConversationsFixture.juniper.id, ConversationsFixture.pico.id],
            create: { _ in }, cancel: {})
    }
#endif
