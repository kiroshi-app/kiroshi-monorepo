import Foundation
import Observation

@MainActor
@Observable
final class MessageConsent {
    private(set) var hasAgreed: Bool
    @ObservationIgnored private let account: String
    @ObservationIgnored private let agreements: any AgreementStore

    init(account: String, agreements: any AgreementStore) {
        self.account = account
        self.agreements = agreements
        hasAgreed = agreements.hasAgreed(account: account)
    }

    func agree() {
        agreements.agree(account: account)
        hasAgreed = true
    }

    func withdraw() {
        agreements.forget(account: account)
        hasAgreed = false
    }
}

@MainActor
@Observable
final class SendGate {
    private(set) var isAsking = false
    private(set) var isDraftKept = false

    func send(with consent: MessageConsent, _ send: () -> Void) {
        guard consent.hasAgreed else {
            isAsking = true
            return
        }
        isDraftKept = false
        send()
    }

    func agreeAndSend(with consent: MessageConsent, _ send: () -> Void) {
        guard isAsking else { return }
        consent.agree()
        isAsking = false
        isDraftKept = false
        send()
    }

    func notNow() {
        guard isAsking else { return }
        isAsking = false
        isDraftKept = true
    }
}
