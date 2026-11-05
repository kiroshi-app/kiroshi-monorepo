import QuickLook
import SwiftUI

enum CitedImageState: Equatable {
    case loading
    case shown(UIImage)
    case failed
}

struct CitedAttachmentView: View {
    let attachment: CitedAttachment
    let shape: UnevenRoundedRectangle

    @Environment(CitedFiles.self) private var files: CitedFiles?
    @State private var attempt = 0
    @State private var isOpening = false
    @State private var hasFailedToOpen = false
    @State private var preview: URL?

    var body: some View {
        content
            .quickLookPreview($preview)
            .task(id: CitedLoad(path: attachment.path, attempt: attempt)) {
                guard attachment.kind == .image else { return }
                await files?.loadImage(attachment)
            }
            .task(id: isOpening) {
                guard isOpening else { return }
                defer { isOpening = false }
                guard let files else {
                    hasFailedToOpen = true
                    return
                }
                do {
                    preview = try await files.copy(of: attachment)
                    hasFailedToOpen = false
                } catch is CancellationError {
                } catch {
                    hasFailedToOpen = true
                }
            }
    }

    @ViewBuilder private var content: some View {
        switch attachment.kind {
        case .image:
            CitedImage(
                name: attachment.name, spokenName: attachment.spokenName, state: imageState,
                shape: shape, open: open, retry: retry)
        case .file:
            CitedFileItem(
                name: attachment.name, spokenName: attachment.spokenName, isOpening: isOpening,
                hasFailed: hasFailedToOpen, open: open)
        }
    }

    private var imageState: CitedImageState {
        guard let files else { return .loading }
        if let image = files.images[attachment.path] { return .shown(image) }
        return files.failedImages.contains(attachment.path) ? .failed : .loading
    }

    private func open() {
        isOpening = true
    }

    private func retry() {
        files?.retryImage(attachment)
        attempt += 1
    }
}

private struct CitedLoad: Equatable {
    let path: String
    let attempt: Int
}

struct CitedImage: View {
    static let maxWidth: CGFloat = 260
    static let maxHeight: CGFloat = 320

    let name: String
    var spokenName: String?
    let state: CitedImageState
    let shape: UnevenRoundedRectangle
    var open: () -> Void = {}
    var retry: () -> Void = {}

    var body: some View {
        switch state {
        case .shown(let image):
            Button(action: open) {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .clipShape(shape)
            }
            .buttonStyle(.plain)
            .frame(maxWidth: Self.maxWidth, maxHeight: Self.maxHeight, alignment: .leading)
            .accessibilityLabel(spokenName ?? name)
            .accessibilityAddTraits(.isImage)
            .accessibilityHint(Text("Opens the image."))
        case .loading:
            ProgressView()
                .frame(width: Self.maxWidth, height: Self.maxWidth * 3 / 4)
                .background(Color(.secondarySystemBackground), in: shape)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(Text("Loading \(spokenName ?? name)…"))
        case .failed:
            Button(action: retry) {
                Label {
                    Text("Couldn't load \(name). Tap to try again.")
                } icon: {
                    Image(systemName: "photo.badge.exclamationmark")
                }
                .font(.footnote)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(Color(.secondarySystemBackground), in: shape)
            }
            .buttonStyle(.plain)
        }
    }
}

struct CitedFileItem: View {
    let name: String
    var spokenName: String?
    var isOpening = false
    var hasFailed = false
    var open: () -> Void = {}

    var body: some View {
        Button(action: open) {
            VStack(alignment: .leading, spacing: 2) {
                Label {
                    Text(name)
                } icon: {
                    if isOpening {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Image(systemName: "paperclip")
                    }
                }
                if hasFailed {
                    Text("Couldn't open \(name). Tap to try again.")
                }
            }
            .font(.footnote)
            .foregroundStyle(.secondary)
            .padding(.horizontal, 14)
            .frame(minHeight: 44, alignment: .leading)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .disabled(isOpening)
        .accessibilityLabel(
            hasFailed
                ? Text("Couldn't open \(spokenName ?? name). Tap to try again.")
                : Text(spokenName ?? name)
        )
        .accessibilityHint(Text("Opens the file."))
    }
}

#if DEBUG
    private struct CitedPreview<Content: View>: View {
        @ViewBuilder let content: Content

        var body: some View {
            VStack(alignment: .leading, spacing: 4) {
                content
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding()
        }
    }

    @MainActor private var previewShape: UnevenRoundedRectangle {
        BubbleText.shape(of: .middle, isYours: false)
    }

    #Preview("Image loaded") {
        CitedPreview {
            CitedImage(
                name: "Build times, week 45", state: .shown(CitedFixture.chartImage),
                shape: previewShape)
        }
    }

    #Preview("Image loading") {
        CitedPreview {
            CitedImage(name: "Build times, week 45", state: .loading, shape: previewShape)
        }
    }

    #Preview("Image failed") {
        CitedPreview {
            CitedImage(name: "Crash on launch", state: .failed, shape: previewShape)
        }
    }

    #Preview("File item") {
        CitedPreview {
            CitedFileItem(name: "Release notes 4.2.pdf")
            CitedFileItem(name: "Release notes 4.2.pdf", isOpening: true)
            CitedFileItem(name: "Release notes 4.2.pdf", hasFailed: true)
        }
    }

    #Preview("Legacy block") {
        let message = ThreadMessage(
            id: "legacy", writer: .companion("juniper"), text: CitedFixture.legacyBlock,
            sentAt: .now, authors: [Companion(id: "juniper", name: "Juniper")])
        ScrollView {
            ThreadMessageView(message: message, soloCompanion: nil)
                .padding()
        }
    }

    #Preview("Cited reply · dark") {
        let message = ThreadMessage(
            id: "cited", writer: .companion("juniper"), text: CitedFixture.reply, sentAt: .now,
            authors: [Companion(id: "juniper", name: "Juniper")])
        ScrollView {
            ThreadMessageView(message: message, soloCompanion: nil)
                .padding()
        }
        .preferredColorScheme(.dark)
    }
#endif
