import Foundation

protocol AgreementStore {
    func hasAgreed(account: String) -> Bool
    func agree(account: String)
    func forget(account: String)
}

struct UserDefaultsAgreementStore: AgreementStore {
    var key = "messageRoutingAgreements"

    func hasAgreed(account: String) -> Bool {
        agreedAccounts.contains(account)
    }

    func agree(account: String) {
        guard !hasAgreed(account: account) else { return }
        UserDefaults.standard.set(agreedAccounts + [account], forKey: key)
    }

    func forget(account: String) {
        UserDefaults.standard.set(agreedAccounts.filter { $0 != account }, forKey: key)
    }

    private var agreedAccounts: [String] {
        UserDefaults.standard.stringArray(forKey: key) ?? []
    }
}
