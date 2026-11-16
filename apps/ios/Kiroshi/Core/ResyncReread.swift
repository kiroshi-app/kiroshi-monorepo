@MainActor
final class ResyncReread {
    private var running: Task<Void, Never>?

    func start(_ reread: () -> Task<Void, Never>?) {
        guard running == nil, let reading = reread() else { return }
        running = Task { [weak self] in
            await reading.value
            self?.running = nil
        }
    }
}
