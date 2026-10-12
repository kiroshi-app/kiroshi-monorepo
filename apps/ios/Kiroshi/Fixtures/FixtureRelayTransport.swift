#if DEBUG
    import Foundation

    actor FixtureRelayTransport: RelayTransport {
        let onlineSpaceIds: Set<Space.ID>
        let onlineOnceSpaceIds: Set<Space.ID>
        let answers: [String: String]
        let answersAfter: [String: Duration]
        private var leftSpaceIds: Set<Space.ID> = []

        init(
            onlineSpaceIds: Set<Space.ID>, onlineOnceSpaceIds: Set<Space.ID> = [],
            answers: [String: String] = [:], answersAfter: [String: Duration] = [:]
        ) {
            self.onlineSpaceIds = onlineSpaceIds
            self.onlineOnceSpaceIds = onlineOnceSpaceIds
            self.answers = answers
            self.answersAfter = answersAfter
        }

        func open(_ request: URLRequest) async throws -> any RelaySocket {
            let path = request.url?.pathComponents ?? []
            let spaceId = path.dropLast(2).last ?? ""
            let sharedSpaceId = "space-\(spaceId)"
            if onlineOnceSpaceIds.contains(spaceId), !leftSpaceIds.contains(spaceId) {
                leftSpaceIds.insert(spaceId)
                return ScriptedRelaySocket(
                    sharedSpaceId: sharedSpaceId, answers: answers,
                    hostLeavesAfter: "mission_space_feed")
            }
            guard onlineSpaceIds.contains(spaceId) else {
                throw RelayClosure(code: RelayClosure.hostOffline)
            }
            return ScriptedRelaySocket(
                sharedSpaceId: sharedSpaceId, answers: answers, answersAfter: answersAfter)
        }
    }
#endif
