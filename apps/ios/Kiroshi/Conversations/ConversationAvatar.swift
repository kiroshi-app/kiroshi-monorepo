import SwiftUI

enum ConversationAvatar: Equatable {
    case companion(Companion?)
    case icon(ConversationIcon, color: Hue?)

    init(_ subject: ConversationSubject) {
        switch subject {
        case .companion(let companion): self = .companion(companion)
        case .group(let group): self = .icon(group.icon, color: group.color)
        }
    }
}

struct ConversationAvatarView: View {
    let avatar: ConversationAvatar
    let size: CompanionAvatar.Size
    var isWorking = false

    var body: some View {
        switch avatar {
        case .companion(let companion):
            CompanionAvatar(companion, size: size, isWorking: isWorking)
        case .icon(let icon, let color):
            ConversationIconCell(icon: icon, color: color, size: size)
        }
    }
}
