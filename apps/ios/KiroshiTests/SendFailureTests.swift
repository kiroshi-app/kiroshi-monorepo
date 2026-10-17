import Testing

@testable import Kiroshi

struct SendFailureTests {
    @Test func anUnreadableCounterIsNotTheHostBeingOffline() {
        #expect(SendFailure(RelayCallError.counterUnreadable) == .storageUnreadable)
        #expect(SendFailure(RelayCallError.connectionClosed) == .hostOffline)
        #expect(SendFailure(RelayCallError.notConnected) == .hostOffline)
    }
}
