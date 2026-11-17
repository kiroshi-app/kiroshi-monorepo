import Foundation

struct RelayEvent: Sendable {
    let name: String
    let frame: Data

    func payload<Payload: Decodable>(as type: Payload.Type) throws -> Payload {
        try JSONDecoder().decode(Envelope<Payload>.self, from: frame).event.payload
    }

    var caller: RelayCaller? {
        guard let event = try? JSONDecoder().decode(CallerEnvelope.self, from: frame).event,
            let deviceId = event.deviceId
        else { return nil }
        return RelayCaller(deviceId: deviceId, callKey: event.callKey)
    }

    private struct Envelope<Payload: Decodable>: Decodable {
        struct Event: Decodable {
            let payload: Payload
        }

        let event: Event
    }

    private struct CallerEnvelope: Decodable {
        struct Event: Decodable {
            let deviceId: String?
            let callKey: String?
        }

        let event: Event
    }
}

struct RelayCaller: Equatable, Sendable {
    let deviceId: String
    let callKey: String?
}
