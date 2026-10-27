#if DEBUG
    import Foundation

    actor FixtureRelayTransport: RelayTransport {
        let onlineSpaceIds: Set<Space.ID>
        let onlineOnceSpaceIds: Set<Space.ID>
        let answers: [String: String]
        let answersAfter: [String: Duration]
        let plays: [String: [ScriptedRelaySocket.Inbound]]
        private var leftSpaceIds: Set<Space.ID> = []

        init(
            onlineSpaceIds: Set<Space.ID>, onlineOnceSpaceIds: Set<Space.ID> = [],
            answers: [String: String] = [:], answersAfter: [String: Duration] = [:],
            plays: [String: [ScriptedRelaySocket.Inbound]] = [:]
        ) {
            self.onlineSpaceIds = onlineSpaceIds
            self.onlineOnceSpaceIds = onlineOnceSpaceIds
            self.answers = answers
            self.answersAfter = answersAfter
            self.plays = plays
        }

        func open(_ request: URLRequest) async throws -> any RelaySocket {
            let path = request.url?.pathComponents ?? []
            let spaceId = path.dropLast(2).last ?? ""
            let sharedSpaceId = "space-\(spaceId)"
            if UserDefaults.standard.bool(forKey: "hostSilent") {
                try await Task.sleep(for: .seconds(3600))
            }
            if onlineOnceSpaceIds.contains(spaceId), !leftSpaceIds.contains(spaceId) {
                leftSpaceIds.insert(spaceId)
                return ScriptedRelaySocket(
                    sharedSpaceId: sharedSpaceId, answers: answers,
                    hostLeavesAfter: "mission_space_page")
            }
            guard onlineSpaceIds.contains(spaceId) else {
                throw RelayClosure(code: RelayClosure.hostOffline)
            }
            return ScriptedRelaySocket(
                sharedSpaceId: sharedSpaceId, answers: answers, answersAfter: answersAfter,
                plays: plays)
        }
    }
#endif
