#if DEBUG
    import Foundation

    struct FixtureQuestion: Sendable {
        let companionId: Companion.ID
        let request: String
        var answeredElsewhereAfter: Duration?

        var conversationId: String {
            FixtureHost.chat(of: companionId)
        }

        var text: String {
            let asked = try? JSONDecoder().decode(QuestionRequest.self, from: Data(request.utf8))
            return (asked?.questions ?? []).map(\.question).joined(separator: "\n")
        }

        var pending: String {
            #"[{"scope":\#(FixtureHost.scope(conversationId)),"turn":{"turnId":"turn-live","conversationId":"\#(conversationId)"},"event":{"type":"questionRequested","request":\#(request)}}]"#
        }
    }

    @MainActor
    enum QuestionsFixture {
        nonisolated static let questionId = "q-release-format"

        static let format =
            #"{"header":"Format","question":"Which format should the release notes take?","multiSelect":false,"options":[{"label":"Summary","description":"One line per change, grouped by area","preview":null},{"label":"Full changelog","description":"Every merged pull request, by number","preview":null},{"label":"Blog post","description":"A short story of the release for readers","preview":null}]}"#
        static let sections =
            #"{"header":"Sections","question":"Which sections should the notes include?","multiSelect":true,"options":[{"label":"New features","description":"What people can do now","preview":null},{"label":"Fixes","description":"Bugs closed since 4.1","preview":null},{"label":"Breaking changes","description":"What people must update by hand","preview":null}]}"#
        static let audience =
            #"{"header":"Audience","question":"Who reads these notes first?","multiSelect":false,"options":[{"label":"People using the app","description":"Plain words, no jargon","preview":null},{"label":"Developers","description":"API and integration changes first","preview":null},{"label":"Both","description":"Two sections, one for each","preview":null}]}"#
        static let length =
            #"{"header":"Length","question":"How long should the notes run?","multiSelect":false,"options":[{"label":"Under a page","description":"The headlines and a line each","preview":null},{"label":"As long as it takes","description":"Every change gets its paragraph","preview":null}]}"#

        static func request(_ questions: String...) -> String {
            #"{"id":"\#(questionId)","subject":null,"questions":[\#(questions.joined(separator: ","))]}"#
        }

        static func asking(_ questions: String...) -> QuestionAsking {
            let json =
                #"{"id":"\#(questionId)","questions":[\#(questions.joined(separator: ","))]}"#
            let request = try! JSONDecoder().decode(QuestionRequest.self, from: Data(json.utf8))
            return QuestionAsking(
                question: WaitingQuestion(
                    scope: AgentEvent.Scope(
                        conversationId: "chat-juniper-6", botId: "juniper-6",
                        runtimeSessionId: "session-juniper-6", epoch: 1),
                    turnId: "turn-live", request: request))
        }

        static let thread = [
            FixtureHost.Message(
                id: "q-ask", isYours: true, content: "Can you draft the release notes for 4.2?",
                daysAgo: 0, hour: 9, minute: 40),
            FixtureHost.Message(
                id: "q-read", isYours: false,
                content:
                    "I’ve read the 31 pull requests merged since 4.1. One thing before I write.",
                daysAgo: 0, hour: 9, minute: 41),
            FixtureHost.Message(
                id: "question-\(questionId)", isYours: false,
                content: "### Which format should the release notes take?", daysAgo: 0, hour: 9,
                minute: 41),
        ]

        static func question(for fixture: SignInFixture) -> FixtureQuestion? {
            let juniper = ConversationsFixture.juniper.id
            return switch fixture {
            case .questionsList, .questionSingle:
                FixtureQuestion(companionId: juniper, request: request(format))
            case .questionMulti:
                FixtureQuestion(companionId: juniper, request: request(sections))
            case .questionSeveral:
                FixtureQuestion(companionId: juniper, request: request(format, audience, length))
            case .questionElsewhere:
                FixtureQuestion(
                    companionId: juniper, request: request(format),
                    answeredElsewhereAfter: .seconds(3))
            default: nil
            }
        }
    }
#endif
