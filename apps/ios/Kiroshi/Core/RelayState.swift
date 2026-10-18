enum RelayState: Equatable, Sendable {
    case paused
    case connecting
    case online(sharedSpaceId: String)
    case hostOffline
    case invitationPending
    case needsJoin
    case unreachable
    case signedOut
    case membershipEnded
    case deviceMoved
}

enum RelayUpdate: Sendable {
    case state(RelayState)
    case event(RelayEvent)
}
