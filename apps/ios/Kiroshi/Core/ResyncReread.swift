@MainActor
final class ResyncReread {
    private var running: Task<Void, Never>?
    private var isTrailing = false

    func start(_ reread: @escaping () -> Task<Void, Never>?) {
        guard running == nil else {
            isTrailing = true
            return
        }
        guard let first = reread() else { return }
        running = Task { [weak self] in
            var reading: Task<Void, Never>? = first
            while let current = reading {
                await current.value
                guard let self, !Task.isCancelled else { return }
                guard self.isTrailing else { break }
                self.isTrailing = false
                reading = reread()
            }
            self?.running = nil
        }
    }

    func cancel() {
        running?.cancel()
        running = nil
        isTrailing = false
    }
}
