import Foundation
import Observation

enum ApprovalStage: Equatable {
    case waiting
    case code
    case approved
    case expired
    case refused

    var isWatched: Bool {
        self == .waiting || self == .code
    }
}

enum ApprovalCodeProblem: Equatable {
    case wrongCode
    case tooManyWrongCodes
    case tooManyCodes
    case unreachable

    var needsNewCode: Bool {
        self == .tooManyWrongCodes
    }
}

enum ApprovalOutcome: Equatable {
    case approved
    case refused
    case askAgain
    case signedOut
}

@MainActor
@Observable
final class DeviceApproval {
    static let checkInterval = Duration.seconds(5)
    static let allowedCodeTries = 3

    let deviceName: String
    let email: String
    let fingerprint: [String]
    private(set) var stage: ApprovalStage = .waiting
    var code = ""
    private(set) var isRequestingCode = false
    private(set) var isVerifying = false
    private(set) var isAskingAgain = false
    private(set) var requestProblem: ApprovalCodeProblem?
    private(set) var codeProblem: ApprovalCodeProblem?

    @ObservationIgnored private let bearer: String
    @ObservationIgnored private let cloud: KiroshiCloud
    @ObservationIgnored private let states: any DeviceStates
    @ObservationIgnored private let clock: any RelayClock
    @ObservationIgnored private let finish: (ApprovalOutcome) -> Void
    @ObservationIgnored private var wrongTries = 0
    @ObservationIgnored private var work: Task<Void, Never>?

    init(
        deviceName: String, email: String, fingerprint: [String], bearer: String,
        cloud: KiroshiCloud, states: any DeviceStates, clock: any RelayClock,
        finish: @escaping (ApprovalOutcome) -> Void
    ) {
        self.deviceName = deviceName
        self.email = email
        self.fingerprint = fingerprint
        self.bearer = bearer
        self.cloud = cloud
        self.states = states
        self.clock = clock
        self.finish = finish
    }

    var needsNewCode: Bool {
        codeProblem?.needsNewCode ?? false
    }

    var canApproveWithCode: Bool {
        code.count == SignInModel.codeLength && !isVerifying && codeProblem == nil
    }

    func watch() async {
        while !Task.isCancelled, stage.isWatched {
            guard let state = try? await states.ownState(bearer: bearer), stage.isWatched
            else { return }
            switch state {
            case .approved: approve()
            case .refused: refuse()
            case .expired: stage = .expired
            case .pending, .unreachable: break
            }
            guard stage.isWatched else { return }
            do {
                try await clock.sleep(for: Self.checkInterval)
            } catch {
                return
            }
        }
    }

    func noOtherDeviceTapped() {
        run { [weak self] in await self?.requestCode(opening: true) }
    }

    func sendNewCodeTapped() {
        run { [weak self] in await self?.requestCode(opening: false) }
    }

    func approveWithCodeTapped() {
        guard canApproveWithCode else { return }
        run { [weak self] in await self?.verify() }
    }

    func codeChanged() {
        let digits = String(
            code.filter(\.isASCII).filter(\.isNumber).prefix(SignInModel.codeLength))
        if digits != code {
            code = digits
            return
        }
        if let codeProblem, !codeProblem.needsNewCode {
            self.codeProblem = nil
        }
        if code.count == SignInModel.codeLength {
            approveWithCodeTapped()
        }
    }

    func askAgain() {
        guard stage == .expired, !isAskingAgain else { return }
        isAskingAgain = true
        finish(.askAgain)
    }

    func signOut() {
        work?.cancel()
        finish(.signedOut)
    }

    func requestCode(opening: Bool) async {
        isRequestingCode = true
        defer { isRequestingCode = false }
        requestProblem = nil
        guard let answer = try? await cloud.requestApprovalCode(bearer: bearer) else { return }
        guard stage.isWatched || stage == .expired else { return }
        switch answer {
        case .sent:
            code = ""
            codeProblem = nil
            wrongTries = 0
            stage = .code
        case .alreadyApproved: approve()
        case .expired: stage = .expired
        case .unauthenticated: refuse()
        case .tooManyRequests: report(.tooManyCodes, opening: opening)
        case .unreachable: report(.unreachable, opening: opening)
        }
    }

    func verify() async {
        isVerifying = true
        defer { isVerifying = false }
        guard let answer = try? await cloud.verifyApprovalCode(code, bearer: bearer),
            stage == .code
        else { return }
        switch answer {
        case .approved, .alreadyApproved: approve()
        case .wrongCode:
            wrongTries += 1
            codeProblem = wrongTries >= Self.allowedCodeTries ? .tooManyWrongCodes : .wrongCode
        case .expired: stage = .expired
        case .unauthenticated: refuse()
        case .tooManyRequests: codeProblem = .tooManyCodes
        case .unreachable: codeProblem = .unreachable
        }
    }

    private func report(_ problem: ApprovalCodeProblem, opening: Bool) {
        if opening {
            requestProblem = problem
        } else {
            codeProblem = problem
        }
    }

    private func approve() {
        stage = .approved
        finish(.approved)
    }

    private func refuse() {
        stage = .refused
        finish(.refused)
    }

    private func run(_ operation: @escaping @MainActor () async -> Void) {
        work?.cancel()
        work = Task { await operation() }
    }
}
