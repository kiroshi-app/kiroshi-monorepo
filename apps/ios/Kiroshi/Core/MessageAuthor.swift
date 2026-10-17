import Foundation

enum MessageAuthor: Hashable, Sendable {
    case you
    case person(accountId: String?, name: String)
    case companion(String?)

    var isWrittenByPerson: Bool {
        switch self {
        case .you, .person: true
        case .companion: false
        }
    }

    var personName: String? {
        guard case .person(_, let name) = self else { return nil }
        return name
    }

    var companionId: String? {
        guard case .companion(let id) = self else { return nil }
        return id
    }
}

struct ThreadAuthorship: Equatable, Sendable {
    static let unknownAccount = ThreadAuthorship(accountId: nil, isHostedByYou: true)
    static let unnamed = String(localized: "No name")

    let accountId: String?
    let isHostedByYou: Bool

    func author(
        role: TranscriptMessage.Role, botId: String?, accountId authorAccountId: String?,
        name: String?
    ) -> MessageAuthor {
        guard role == .user, botId == nil else { return .companion(botId) }
        guard let accountId else { return .you }
        guard let authorAccountId else {
            return isHostedByYou ? .you : .person(accountId: nil, name: Self.unnamed)
        }
        guard authorAccountId != accountId else { return .you }
        let named = name?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return .person(accountId: authorAccountId, name: named.isEmpty ? Self.unnamed : named)
    }

    func author(of message: TranscriptMessage) -> MessageAuthor {
        author(
            role: message.role, botId: message.authorBotId, accountId: message.authorAccountId,
            name: message.authorName)
    }
}

enum Initials {
    static func of(_ name: String) -> String {
        name.split(whereSeparator: \.isWhitespace).prefix(2).compactMap(\.first)
            .map(String.init).joined().uppercased()
    }
}
