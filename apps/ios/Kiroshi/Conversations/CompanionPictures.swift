import Observation
import UIKit

enum CompanionPictureError: Error, Equatable {
    case refused(status: Int)
    case undecodable
}

@MainActor
@Observable
final class CompanionPictures {
    private(set) var pictures: [String: UIImage] = [:]

    @ObservationIgnored private let connection: RelayConnection
    @ObservationIgnored private var settled: Set<String> = []
    @ObservationIgnored private var loading: Set<String> = []

    init(connection: RelayConnection) {
        self.connection = connection
    }

    func load(_ file: String) async {
        guard !settled.contains(file), !loading.contains(file) else { return }
        loading.insert(file)
        defer { loading.remove(file) }
        do {
            let answer = try await connection.call("relay_avatar", args: PictureArgs(file: file))
            pictures[file] = try await Self.picture(of: answer)
            settled.insert(file)
        } catch is CancellationError {
        } catch let error as RelayCallError {
            CompanionAvatarEngine.log.info(
                "The picture \(file) wasn't fetched: \(String(describing: error))")
        } catch {
            settled.insert(file)
            CompanionAvatarEngine.log.error(
                "The picture \(file) falls back to the drawn avatar: \(String(describing: error))")
        }
    }

    @concurrent
    nonisolated private static func picture(of answer: RelayAnswer) async throws -> UIImage {
        guard answer.status == 200 else {
            throw CompanionPictureError.refused(status: answer.status)
        }
        guard let body = try? answer.body(as: PictureBody.self),
            let data = Data(base64Encoded: body.base64), let image = UIImage(data: data)
        else {
            throw CompanionPictureError.undecodable
        }
        return image
    }
}

private struct PictureArgs: Encodable {
    let file: String
}

private struct PictureBody: Decodable {
    let base64: String
}
