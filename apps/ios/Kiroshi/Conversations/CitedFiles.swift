import Observation
import UIKit
import os

enum CitedFileError: Error, Equatable {
    case refused(status: Int)
    case undecodable
}

@MainActor
@Observable
final class CitedFiles {
    private(set) var images: [String: UIImage] = [:]
    private(set) var failedImages: Set<String> = []

    @ObservationIgnored private let connection: RelayConnection
    @ObservationIgnored private var loading: Set<String> = []
    @ObservationIgnored private var copies: [String: URL] = [:]

    init(connection: RelayConnection) {
        self.connection = connection
    }

    func loadImage(_ attachment: CitedAttachment) async {
        let path = attachment.path
        guard images[path] == nil, !failedImages.contains(path), !loading.contains(path) else {
            return
        }
        loading.insert(path)
        defer { loading.remove(path) }
        do {
            let answer = try await read(attachment)
            images[path] = try await Self.image(of: answer)
        } catch is CancellationError {
        } catch {
            failedImages.insert(path)
            Self.log.info(
                "The cited image \(attachment.file) wasn't shown: \(String(describing: error))")
        }
    }

    func retryImage(_ attachment: CitedAttachment) {
        failedImages.remove(attachment.path)
    }

    func copy(of attachment: CitedAttachment) async throws -> URL {
        if let copy = copies[attachment.path] { return copy }
        let answer = try await read(attachment)
        let copy = try await Self.save(answer, as: attachment)
        copies[attachment.path] = copy
        return copy
    }

    private func read(_ attachment: CitedAttachment) async throws -> RelayAnswer {
        try await connection.call(
            "relay_attachment",
            args: FileArgs(conversationId: attachment.conversationId, file: attachment.file))
    }

    @concurrent
    nonisolated private static func image(of answer: RelayAnswer) async throws -> UIImage {
        guard let image = UIImage(data: try data(of: answer))?.preparingForDisplay() else {
            throw CitedFileError.undecodable
        }
        return image
    }

    @concurrent
    nonisolated private static func save(_ answer: RelayAnswer, as attachment: CitedAttachment)
        async throws -> URL
    {
        let folder = URL.temporaryDirectory.appending(
            components: "cited", attachment.conversationId, attachment.file,
            directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let copy = folder.appending(component: attachment.savedName)
        try data(of: answer).write(to: copy, options: .atomic)
        return copy
    }

    nonisolated private static func data(of answer: RelayAnswer) throws -> Data {
        guard answer.status == 200 else { throw CitedFileError.refused(status: answer.status) }
        guard let body = try? answer.body(as: FileBody.self),
            let data = Data(base64Encoded: body.base64)
        else { throw CitedFileError.undecodable }
        return data
    }

    private static let log = Logger(subsystem: "com.kiroshi.app.ios", category: "cited-files")
}

private struct FileArgs: Encodable {
    let conversationId: String
    let file: String
}

private struct FileBody: Decodable {
    let base64: String
}
