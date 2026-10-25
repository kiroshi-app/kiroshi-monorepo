enum SendFailure: Equatable {
    case hostOffline
    case unreachable
    case timedOut
    case storageUnreadable
    case stillWorking
    case tooLarge
    case tooMany
    case unreadableAttachment
    case hostFault
    case refused

    init(_ error: any Error) {
        switch error {
        case RelayCallError.hostOffline: self = .hostOffline
        case RelayCallError.timedOut: self = .timedOut
        case RelayCallError.counterUnreadable: self = .storageUnreadable
        case is RelayCallError: self = .unreachable
        case AttachmentRejection.tooMany: self = .tooMany
        case is AttachmentRejection: self = .tooLarge
        case ConversationCallError.refused(_, kind: "turnAlreadyRunning"): self = .stillWorking
        case ConversationCallError.refused(status: 413, kind: "tooMany"): self = .tooMany
        case ConversationCallError.refused(status: 413, _): self = .tooLarge
        case ConversationCallError.refused(status: 400, kind: "unreadable"):
            self = .unreadableAttachment
        case ConversationCallError.refused(status: 500, _),
            ConversationCallError.refused(status: 502, _):
            self = .hostFault
        default: self = .refused
        }
    }
}
