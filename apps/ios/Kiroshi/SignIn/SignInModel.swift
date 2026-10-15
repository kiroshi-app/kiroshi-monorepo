import Foundation
import Observation

enum SignInStep: Hashable {
    case code
}

enum AccountStage: Equatable {
    case signedOut
    case loadingSpaces
    case spaces([Space])
    case spacesUnreachable
}

enum EmailProblem: Equatable {
    case unreachable
    case tooManyCodes
    case invalidEmail
}

enum ProviderProblem: Equatable {
    case refused(SignInProvider)
    case unreachable
}

enum CodeProblem: Equatable {
    case wrongCode
    case tooManyWrongCodes
    case expiredCode
    case tooManyCodes
    case unreachable

    var needsNewCode: Bool {
        self == .tooManyWrongCodes || self == .expiredCode
    }
}

@MainActor
@Observable
final class SignInModel {
    static let codeLength = 6

    var path: [SignInStep] = []
    var email = ""
    var code = ""
    private(set) var stage: AccountStage
    private(set) var signedInEmail = ""
    private(set) var isRequestingCode = false
    private(set) var isSigningIn = false
    private(set) var emailProblem: EmailProblem?
    private(set) var codeProblem: CodeProblem?
    private(set) var signingInWith: SignInProvider?
    private(set) var providerProblem: ProviderProblem?
    var isConfirmingSignOut = false
    var isConfirmingDeletion = false
    private(set) var isDeletingAccount = false
    private(set) var hasFailedToDeleteAccount = false
    @ObservationIgnored var onSignOut: () -> Void = {}
    @ObservationIgnored private(set) var revocation: Task<Void, Never>?
    @ObservationIgnored private(set) var deletion: Task<Void, Never>?
    private(set) var shell: SpaceStore?
    private(set) var consent: MessageConsent?

    @ObservationIgnored private let cloud: KiroshiCloud
    @ObservationIgnored private let sessions: any SessionStore
    @ObservationIgnored private let lastSpace: any LastSpaceStore
    @ObservationIgnored private let agreements: any AgreementStore
    @ObservationIgnored private let relay: RelayEnvironment
    @ObservationIgnored private let google: any GoogleAuthorizing
    @ObservationIgnored private var appleNonce: String?
    @ObservationIgnored private var session: Session?
    @ObservationIgnored private var work: Task<Void, Never>?

    init(
        cloud: KiroshiCloud,
        sessions: any SessionStore,
        lastSpace: any LastSpaceStore,
        agreements: any AgreementStore,
        relay: RelayEnvironment,
        google: any GoogleAuthorizing = GoogleSignInAuthorizer()
    ) {
        self.cloud = cloud
        self.sessions = sessions
        self.lastSpace = lastSpace
        self.agreements = agreements
        self.relay = relay
        self.google = google
        let session = sessions.load()
        self.session = session
        stage = session == nil ? .signedOut : .loadingSpaces
        signedInEmail = session?.email ?? ""
    }

    var needsNewCode: Bool {
        codeProblem?.needsNewCode ?? false
    }

    var isBusy: Bool {
        isRequestingCode || signingInWith != nil
    }

    func continueWithEmail() {
        run { [weak self] in await self?.requestCode() }
    }

    func sendNewCodeTapped() {
        run { [weak self] in await self?.sendNewCode() }
    }

    func codeChanged() {
        let digits = String(code.filter(\.isASCII).filter(\.isNumber).prefix(Self.codeLength))
        if digits != code {
            code = digits
            return
        }
        if let codeProblem, !codeProblem.needsNewCode {
            self.codeProblem = nil
        }
        if code.count == Self.codeLength, codeProblem == nil {
            run { [weak self] in await self?.signIn() }
        }
    }

    func useDifferentEmail() {
        work?.cancel()
        code = ""
        codeProblem = nil
        path = []
    }

    func appleRequestNonce() -> String {
        work?.cancel()
        let raw = Nonce.random()
        appleNonce = raw
        startSigningIn(with: .apple)
        return Nonce.sha256(raw)
    }

    func appleCompleted(_ outcome: ProviderOutcome) {
        let nonce = appleNonce
        appleNonce = nil
        run { [weak self] in await self?.finishSigningIn(with: .apple, outcome, nonce: nonce) }
    }

    func continueWithGoogle() {
        startSigningIn(with: .google)
        run { [weak self] in await self?.signInWithGoogle() }
    }

    func signInWithGoogle() async {
        await finishSigningIn(with: .google, await google.authorize(), nonce: nil)
    }

    func checkAgain() {
        shell = nil
        stage = .loadingSpaces
    }

    func useAnotherAccount() {
        signOut()
        email = ""
    }

    func requestCode() async {
        email = email.trimmingCharacters(in: .whitespacesAndNewlines)
        emailProblem = nil
        providerProblem = nil
        isRequestingCode = true
        defer { isRequestingCode = false }
        guard let answer = try? await cloud.requestCode(for: email) else { return }
        switch answer {
        case .sent:
            code = ""
            codeProblem = nil
            path = [.code]
        case .tooManyRequests: emailProblem = .tooManyCodes
        case .invalidEmail: emailProblem = .invalidEmail
        case .unreachable: emailProblem = .unreachable
        }
    }

    func sendNewCode() async {
        isRequestingCode = true
        defer { isRequestingCode = false }
        guard let answer = try? await cloud.requestCode(for: email) else { return }
        switch answer {
        case .sent:
            code = ""
            codeProblem = nil
        case .tooManyRequests: codeProblem = .tooManyCodes
        case .invalidEmail, .unreachable: codeProblem = .unreachable
        }
    }

    func signIn() async {
        isSigningIn = true
        defer { isSigningIn = false }
        guard let answer = try? await cloud.signIn(email: email, code: code) else { return }
        switch answer {
        case .signedIn(let granted): begin(granted)
        case .wrongCode: codeProblem = .wrongCode
        case .tooManyWrongCodes: codeProblem = .tooManyWrongCodes
        case .expiredCode:
            codeProblem = .expiredCode
            code = ""
        case .unreachable: codeProblem = .unreachable
        }
    }

    func loadSpaces() async {
        guard let session else { return }
        guard let answer = try? await cloud.spaces(bearer: session.bearer) else { return }
        switch answer {
        case .spaces(let spaces):
            shell = spaces.isEmpty ? nil : makeShell(spaces: spaces, session: session)
            stage = .spaces(spaces)
        case .unauthenticated: endSession()
        case .unreachable: stage = .spacesUnreachable
        }
    }

    func signOutTapped() {
        isConfirmingSignOut = true
    }

    func signOut() {
        if let bearer = session?.bearer {
            revocation = Task { [cloud] in await cloud.signOut(bearer: bearer) }
        }
        endSession()
    }

    func deleteAccountTapped() {
        isConfirmingDeletion = true
    }

    func deleteAccount() {
        guard !isDeletingAccount, let session else { return }
        isDeletingAccount = true
        hasFailedToDeleteAccount = false
        deletion = Task { [weak self] in await self?.delete(session) }
    }

    private func delete(_ deleted: Session) async {
        let answer = try? await cloud.deleteAccount(bearer: deleted.bearer)
        isDeletingAccount = false
        switch answer {
        case .deleted, .unauthenticated: forget(deleted)
        case .unreachable: hasFailedToDeleteAccount = true
        case nil: break
        }
    }

    private func forget(_ deleted: Session) {
        agreements.forget(account: deleted.accountId)
        guard session == nil || session == deleted else { return }
        lastSpace.clear()
        endSession()
    }

    private func startSigningIn(with provider: SignInProvider) {
        signingInWith = provider
        providerProblem = nil
        emailProblem = nil
    }

    private func finishSigningIn(
        with provider: SignInProvider, _ outcome: ProviderOutcome, nonce: String?
    ) async {
        defer { signingInWith = nil }
        switch outcome {
        case .authorized(let idToken, let name, let authorizationCode):
            let credential = ProviderCredential(
                provider: provider, idToken: idToken, nonce: nonce, name: name,
                authorizationCode: authorizationCode)
            guard let answer = try? await cloud.signIn(with: credential) else { return }
            switch answer {
            case .signedIn(let granted): begin(granted)
            case .refused: providerProblem = .refused(provider)
            case .unreachable: providerProblem = .unreachable
            }
        case .cancelled:
            break
        case .failed:
            providerProblem = .refused(provider)
        }
    }

    private func begin(_ granted: Session) {
        try? sessions.save(granted)
        session = granted
        signedInEmail = granted.email
        code = ""
        path = []
        stage = .loadingSpaces
    }

    private func makeShell(spaces: [Space], session: Session) -> SpaceStore {
        let shell = SpaceStore(
            spaces: spaces, session: session, cloud: cloud, lastSpace: lastSpace, relay: relay
        ) { [weak self] exit in
            self?.leaveShell(exit)
        }
        onSignOut = { [weak shell] in shell?.leave() }
        consent = MessageConsent(account: session.accountId, agreements: agreements)
        return shell
    }

    private func leaveShell(_ exit: ShellExit) {
        switch exit {
        case .signedOut: endSession()
        case .noSpaceLeft:
            shell = nil
            stage = .spaces([])
        }
    }

    private func endSession() {
        onSignOut()
        work?.cancel()
        sessions.clear()
        session = nil
        shell = nil
        consent = nil
        signedInEmail = ""
        code = ""
        codeProblem = nil
        emailProblem = nil
        providerProblem = nil
        isConfirmingSignOut = false
        isConfirmingDeletion = false
        isDeletingAccount = false
        hasFailedToDeleteAccount = false
        path = []
        stage = .signedOut
    }

    private func run(_ operation: @escaping @MainActor () async -> Void) {
        work?.cancel()
        work = Task { await operation() }
    }
}
