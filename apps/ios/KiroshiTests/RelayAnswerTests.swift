import Foundation
import Testing

@testable import Kiroshi

struct RelayAnswerTests {
    @Test(arguments: [
        #"{ "id": 7, "status": 403, "body": "this command belongs to the host" }"#,
        #"{ "id": 7, "status": 404, "body": "this host knows no command named mission_space_page" }"#,
    ])
    func aHostOfEitherBuildRefusingACommandItDoesNotKnowIsReadAsUnknown(frame: String) throws {
        #expect(try answer(frame).isUnknownToTheHost)
    }

    @Test(arguments: [
        #"{ "id": 7, "status": 403, "body": "this command reaches outside the shared space" }"#,
        #"{ "id": 7, "status": 403, "body": { "kind": "refusedToAMember" } }"#,
        #"{ "id": 7, "status": 404, "body": "no avatar of the shared space bears this name" }"#,
        #"{ "id": 7, "status": 404, "body": "no file answers this path" }"#,
        #"{ "id": 7, "status": 200, "body": "this host knows no command named mission_space_page" }"#,
        #"{ "id": 7, "status": 500, "body": "this command belongs to the host" }"#,
    ])
    func anyOtherAnswerIsNotACommandUnknownToTheHost(frame: String) throws {
        #expect(try !answer(frame).isUnknownToTheHost)
    }

    private func answer(_ frame: String) throws -> RelayAnswer {
        let data = Data(frame.utf8)
        let status = try JSONDecoder().decode(Status.self, from: data).status
        return RelayAnswer(status: status, frame: data)
    }

    private struct Status: Decodable {
        let status: Int
    }
}
