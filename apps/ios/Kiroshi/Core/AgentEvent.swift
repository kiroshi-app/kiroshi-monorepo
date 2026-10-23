struct AgentEvent: Decodable, Equatable, Sendable {
    struct Scope: Codable, Equatable, Sendable {
        let conversationId: String
        let botId: String
        let runtimeSessionId: String
        let epoch: Int

        func isSameRun(as other: Scope) -> Bool {
            runtimeSessionId == other.runtimeSessionId && epoch == other.epoch
        }
    }

    struct Turn: Decodable, Equatable, Sendable {
        let turnId: String
        let conversationId: String
    }

    struct Message: Decodable, Equatable, Sendable {
        let id: String
        let role: TranscriptMessage.Role
        let text: String
        let timestamp: Int
    }

    struct Activity: Decodable, Equatable, Sendable {
        enum Kind: String, Decodable, Sendable {
            case tool
            case permission
        }

        let kind: Kind
    }

    enum TurnState: String, Decodable, Sendable {
        case idle
        case submitting
        case running
        case stopping
        case failed

        var isWorking: Bool {
            self == .submitting || self == .running || self == .stopping
        }
    }

    enum Change: Equatable, Sendable {
        case turn(TurnState)
        case messageStarted(Message)
        case messageDelta(id: String, text: String)
        case messageCompleted(Message)
        case activity(Activity)
        case permissionRequested
        case questionRequested(QuestionRequest)
        case permissionResolved(id: String)
        case turnEnded
        case failed
        case other

        var opensWork: Bool {
            switch self {
            case .turn(let state): state.isWorking
            case .activity, .permissionRequested, .questionRequested: true
            default: false
            }
        }

        var closesWork: Bool {
            self == .turnEnded || self == .failed
        }
    }

    enum CodingKeys: String, CodingKey {
        case scope
        case turn
        case event
    }

    let scope: Scope?
    let turn: Turn?
    let change: Change

    init(scope: Scope?, turn: Turn? = nil, change: Change) {
        self.scope = scope
        self.turn = turn
        self.change = change
    }

    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        scope = try container.decodeIfPresent(Scope.self, forKey: .scope)
        turn = try? container.decodeIfPresent(Turn.self, forKey: .turn)
        change = try container.decode(Wire.self, forKey: .event).change
    }

    private struct Wire: Decodable {
        let type: String
        let state: TurnState?
        let message: Message?
        let id: String?
        let text: String?
        let activity: Activity?
        let request: QuestionRequest?

        var change: Change {
            switch type {
            case "turnChanged": state.map(Change.turn) ?? .other
            case "messageStarted": message.map(Change.messageStarted) ?? .other
            case "messageDelta":
                id.flatMap { id in text.map { Change.messageDelta(id: id, text: $0) } } ?? .other
            case "messageCompleted": message.map(Change.messageCompleted) ?? .other
            case "activity": activity.map(Change.activity) ?? .other
            case "permissionRequested": .permissionRequested
            case "questionRequested": request.map(Change.questionRequested) ?? .other
            case "permissionResolved": id.map { Change.permissionResolved(id: $0) } ?? .other
            case "turnEnded": .turnEnded
            case "failed": .failed
            default: .other
            }
        }

        enum CodingKeys: String, CodingKey {
            case type
            case state
            case message
            case id
            case text
            case activity
            case request
        }

        init(from decoder: any Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            type = try container.decode(String.self, forKey: .type)
            state = try? container.decodeIfPresent(TurnState.self, forKey: .state)
            message = try? container.decodeIfPresent(Message.self, forKey: .message)
            id = try? container.decodeIfPresent(String.self, forKey: .id)
            text = try? container.decodeIfPresent(String.self, forKey: .text)
            activity = try? container.decodeIfPresent(Activity.self, forKey: .activity)
            request =
                type == "questionRequested"
                ? try? container.decodeIfPresent(QuestionRequest.self, forKey: .request) : nil
        }
    }
}
