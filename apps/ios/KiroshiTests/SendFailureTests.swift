import Testing

@testable import Kiroshi

struct SendFailureTests {
    @Test func onlyTheRelaySayingSoIsTheHostBeingOffline() {
        #expect(SendFailure(RelayCallError.hostOffline) == .hostOffline)
        #expect(SendFailure(RelayCallError.connectionClosed) == .unreachable)
        #expect(SendFailure(RelayCallError.notConnected) == .unreachable)
        #expect(SendFailure(RelayCallError.challengeRefused) == .unreachable)
    }

    @Test func aCallWithoutAnAnswerTookTooLong() {
        #expect(SendFailure(RelayCallError.timedOut) == .timedOut)
    }

    @Test func anUnreadableCounterIsNotTheHostBeingOffline() {
        #expect(SendFailure(RelayCallError.counterUnreadable) == .storageUnreadable)
    }

    @Test func everyLimitTheHostNamesIsFilesTooLarge() {
        #expect(SendFailure(refused(413, "tooLarge")) == .tooLarge)
        #expect(SendFailure(refused(413, "tooLargeTogether")) == .tooLarge)
        #expect(SendFailure(refused(413, nil)) == .tooLarge)
        #expect(SendFailure(refused(413, "tooMany")) == .tooMany)
    }

    @Test func aLimitCheckedOnTheIPhoneReadsLikeTheHostOne() {
        #expect(SendFailure(AttachmentRejection.tooLarge) == .tooLarge)
        #expect(SendFailure(AttachmentRejection.tooLargeTogether) == .tooLarge)
        #expect(SendFailure(AttachmentRejection.tooMany) == .tooMany)
    }

    @Test func anUnreadableAttachmentIsReadFromTheKindNotTheStatus() {
        #expect(SendFailure(refused(400, "unreadable")) == .unreadableAttachment)
        #expect(SendFailure(refused(400, nil)) == .refused)
        #expect(SendFailure(refused(400, "unreadableCursor")) == .refused)
    }

    @Test func aFailureOnTheHostSideIsNotTheHostBeingOffline() {
        #expect(SendFailure(refused(500, "unwritable")) == .hostFault)
        #expect(SendFailure(refused(500, nil)) == .hostFault)
        #expect(SendFailure(refused(502, nil)) == .hostFault)
    }

    @Test func aRunningTurnSaysTheCompanionIsStillWorking() {
        #expect(SendFailure(refused(409, "turnAlreadyRunning")) == .stillWorking)
    }

    @Test func anyOtherRefusalAsksToTryAgain() {
        #expect(SendFailure(refused(403, nil)) == .refused)
        #expect(SendFailure(ConversationCallError.unreadable) == .refused)
        #expect(SendFailure(ConversationCallError.unknownToTheHost) == .refused)
    }

    private func refused(_ status: Int, _ kind: String?) -> ConversationCallError {
        .refused(status: status, kind: kind)
    }
}
