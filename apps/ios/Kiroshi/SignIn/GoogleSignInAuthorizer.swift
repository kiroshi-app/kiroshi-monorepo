import GoogleSignIn
import UIKit

struct GoogleSignInAuthorizer: GoogleAuthorizing {
    @MainActor func authorize() async -> ProviderOutcome {
        guard let presenter = Self.presenter() else { return .failed }
        return await withCheckedContinuation { continuation in
            GIDSignIn.sharedInstance.signIn(withPresenting: presenter) { result, error in
                if let idToken = result?.user.idToken?.tokenString {
                    continuation.resume(returning: .authorized(idToken: idToken, name: nil))
                } else {
                    let isCancelled = (error as? GIDSignInError)?.code == .canceled
                    continuation.resume(returning: isCancelled ? .cancelled : .failed)
                }
            }
        }
    }

    @MainActor private static func presenter() -> UIViewController? {
        let scene = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }
        var top = scene?.keyWindow?.rootViewController
        while let presented = top?.presentedViewController {
            top = presented
        }
        return top
    }
}
