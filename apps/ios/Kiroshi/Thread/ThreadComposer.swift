import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

struct ThreadComposer<Model: ThreadModel>: View {
    @Bindable var model: Model
    let isHostOffline: Bool
    let isDraftKept: Bool
    let send: () -> Void
    @State private var isPickingPhotos = false
    @State private var isPickingFiles = false
    @State private var photos: [PhotosPickerItem] = []
    @State private var couldNotAttach = false
    @ScaledMetric(relativeTo: .body) private var control: CGFloat = 32
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if !model.mentionCandidates.isEmpty {
                MentionSuggestions(companions: model.mentionCandidates) { companion in
                    model.mention(companion)
                }
            }
            if let problem {
                ProblemLabel(message: "\(problem)")
            }
            if isDraftKept {
                Label("Not sent. Your draft stays here.", systemImage: "info.circle.fill")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 8)
            }
            if !model.attachments.isEmpty {
                ScrollView(.horizontal) {
                    HStack {
                        ForEach(model.attachments) { attachment in
                            Button {
                                model.attachments.removeAll { $0.id == attachment.id }
                            } label: {
                                Label(attachment.name, systemImage: "xmark.circle.fill")
                                    .lineLimit(1)
                            }
                            .buttonStyle(.bordered)
                            .accessibilityLabel("Remove \(attachment.name)")
                        }
                    }
                }
                .scrollIndicators(.hidden)
            }
            HStack(alignment: .bottom, spacing: 8) {
                attach
                field
            }
            .disabled(isHostOffline)
            .opacity(isHostOffline ? 0.4 : 1)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .photosPicker(isPresented: $isPickingPhotos, selection: $photos, matching: .images)
        .fileImporter(
            isPresented: $isPickingFiles, allowedContentTypes: [.item],
            allowsMultipleSelection: true, onCompletion: attachFiles
        )
        .task(id: photos) { await attachPhotos() }
    }

    private var attach: some View {
        Menu {
            Button("Photo Library", systemImage: "photo.on.rectangle") {
                isPickingPhotos = true
            }
            Button("Choose File", systemImage: "folder") {
                isPickingFiles = true
            }
        } label: {
            Image(systemName: "plus")
                .font(.body.weight(.medium))
                .foregroundStyle(.primary)
                .frame(width: 44, height: 44)
                .glassEffect(.regular.interactive(), in: .circle)
        }
        .accessibilityLabel("Attach")
        .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
    }

    private var field: some View {
        TextField(model.placeholder, text: $model.draft, axis: .vertical)
            .lineLimit(1...(dynamicTypeSize.isAccessibilitySize ? 3 : 6))
            .id(dynamicTypeSize)
            .padding(.vertical, 11)
            .padding(.leading, 16)
            .padding(.trailing, control + 14)
            .glassEffect(in: .rect(cornerRadius: 22))
            .overlay(alignment: .bottomTrailing) {
                sendOrStop
                    .buttonStyle(.plain)
                    .padding(.trailing, 6)
            }
    }

    @ViewBuilder private var sendOrStop: some View {
        if model.working != nil, model.kind == .conversation {
            Button {
                model.stop()
            } label: {
                controlButton(systemImage: "stop.fill", font: .caption2)
            }
            .disabled(!model.canStop)
            .accessibilityLabel("Stop")
        } else if model.isSending {
            ProgressView()
                .frame(width: control, height: control)
                .padding(.vertical, 6)
        } else if model.canSend {
            Button(action: send) {
                controlButton(systemImage: "arrow.up", font: .subheadline.weight(.semibold))
            }
            .accessibilityLabel("Send")
        }
    }

    private func controlButton(systemImage: String, font: Font) -> some View {
        Image(systemName: systemImage)
            .font(font)
            .foregroundStyle(Color(.systemBackground))
            .frame(width: control, height: control)
            .background(.primary, in: .circle)
            .padding(.vertical, 6)
    }

    private var problem: String? {
        couldNotAttach
            ? String(localized: "Couldn’t attach that file. Pick it again.") : model.problem
    }

    private func attachPhotos() async {
        guard !photos.isEmpty else { return }
        couldNotAttach = false
        for photo in photos {
            guard let data = try? await photo.loadTransferable(type: Data.self) else {
                couldNotAttach = true
                continue
            }
            let suffix = photo.supportedContentTypes.first?.preferredFilenameExtension ?? "jpg"
            model.attachments.append(
                PickedAttachment(
                    id: UUID(), name: "Photo \(model.attachments.count + 1).\(suffix)", data: data)
            )
        }
        photos = []
    }

    private func attachFiles(_ result: Result<[URL], any Error>) {
        couldNotAttach = false
        guard case .success(let urls) = result else {
            couldNotAttach = true
            return
        }
        for url in urls {
            let isScoped = url.startAccessingSecurityScopedResource()
            defer { if isScoped { url.stopAccessingSecurityScopedResource() } }
            guard let data = try? Data(contentsOf: url) else {
                couldNotAttach = true
                continue
            }
            model.attachments.append(
                PickedAttachment(id: UUID(), name: url.lastPathComponent, data: data))
        }
    }
}
