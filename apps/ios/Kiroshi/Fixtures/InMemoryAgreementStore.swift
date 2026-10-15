#if DEBUG
    final class InMemoryAgreementStore: AgreementStore {
        private(set) var agreed: Set<String>

        init(_ agreed: Set<String> = []) {
            self.agreed = agreed
        }

        func hasAgreed(account: String) -> Bool {
            agreed.contains(account)
        }

        func agree(account: String) {
            agreed.insert(account)
        }

        func forget(account: String) {
            agreed.remove(account)
        }
    }
#endif
