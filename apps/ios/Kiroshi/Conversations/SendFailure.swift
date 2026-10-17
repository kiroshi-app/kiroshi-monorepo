enum SendFailure: Equatable {
    case hostOffline
    case storageUnreadable
    case stillWorking
    case tooLarge
    case refused

    init(_ error: any Error) {
        switch error {
        case ConversationCallError.refused(_, kind: "turnAlreadyRunning"): self = .stillWorking
        case ConversationCallError.refused(status: 413, _): self = .tooLarge
        case RelayCallError.counterUnreadable: self = .storageUnreadable
        case is RelayCallError: self = .hostOffline
        default: self = .refused
        }
    }
}
