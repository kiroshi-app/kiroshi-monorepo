import AuthenticationServices
import Foundation

enum SignInProvider: String, Equatable, Sendable {
    case apple
    case google
}

struct ProviderCredential: Equatable, Sendable {
    let provider: SignInProvider
    let idToken: String
    var nonce: String?
    var name: String?
    var authorizationCode: String?
}

enum ProviderOutcome: Equatable, Sendable {
    case authorized(idToken: String, name: String?, authorizationCode: String? = nil)
    case cancelled
    case failed
}

protocol GoogleAuthorizing: Sendable {
    @MainActor func authorize() async -> ProviderOutcome
}

extension ProviderOutcome {
    static let nameMaxLength = 80

    init(apple result: Result<ASAuthorizationAppleIDCredential, any Error>) {
        switch result {
        case .success(let credential):
            guard
                let token = credential.identityToken.flatMap({
                    String(data: $0, encoding: .utf8)
                })
            else {
                self = .failed
                return
            }
            self = .authorized(
                idToken: token, name: Self.name(of: credential.fullName),
                authorizationCode: credential.authorizationCode.flatMap {
                    String(data: $0, encoding: .utf8)
                })
        case .failure(let error):
            self = Self.isCancellation(error) ? .cancelled : .failed
        }
    }

    static func isCancellation(_ error: any Error) -> Bool {
        (error as? ASAuthorizationError)?.code == .canceled || error is CancellationError
    }

    static func name(of components: PersonNameComponents?) -> String? {
        guard let components else { return nil }
        let full = PersonNameComponentsFormatter.localizedString(from: components, style: .default)
        var clipped = ""
        for character in full.trimmingCharacters(in: .whitespacesAndNewlines) {
            guard clipped.utf16.count + character.utf16.count <= nameMaxLength else { break }
            clipped.append(character)
        }
        let name = clipped.trimmingCharacters(in: .whitespacesAndNewlines)
        return name.isEmpty ? nil : name
    }
}
