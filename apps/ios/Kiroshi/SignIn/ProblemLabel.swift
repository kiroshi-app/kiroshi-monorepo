import SwiftUI

struct ProblemLabel: View {
    let message: LocalizedStringKey

    var body: some View {
        Label(message, systemImage: "exclamationmark.circle.fill")
            .font(.footnote)
            .foregroundStyle(Color(.systemRed))
            .padding(.horizontal, 4)
    }
}

extension EmailProblem {
    var message: LocalizedStringKey {
        switch self {
        case .unreachable: "Couldn’t reach Kiroshi. Check your connection and try again."
        case .tooManyCodes:
            "Couldn’t send a new code, you’ve asked for too many. Wait a minute and try again."
        case .invalidEmail: "That email doesn’t look right. Check it and try again."
        }
    }
}

extension CodeProblem {
    var message: LocalizedStringKey {
        switch self {
        case .wrongCode: "That code didn’t work. Check it and try again."
        case .tooManyWrongCodes:
            "That code didn’t work three times, so it’s no longer valid. Send a new code to sign in."
        case .expiredCode: "That code has expired. Send a new code to sign in."
        case .tooManyCodes:
            "Couldn’t send a new code, you’ve asked for too many. Wait a minute and try again."
        case .unreachable: "Couldn’t reach Kiroshi. Check your connection and try again."
        }
    }
}
