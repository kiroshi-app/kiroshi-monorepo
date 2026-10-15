import Foundation
import Testing

@testable import Kiroshi

@MainActor
struct AccountDeletionTests {
    let transport = ScriptedTransport()
    let sessions = InMemorySessionStore(CloudFixture.session)
    let lastSpace = InMemoryLastSpaceStore(CloudFixture.studioId)
    let agreements = CloudFixture.agreements()

    func makeModel() -> SignInModel {
        SignInModel(
            cloud: KiroshiCloud(baseURL: KiroshiCloud.productionURL, transport: transport),
            sessions: sessions, lastSpace: lastSpace, agreements: agreements,
            relay: CloudFixture.relay)
    }

    func deletionRequests() async -> [URLRequest] {
        await transport.requests.filter { $0.url?.path() == CloudFixture.accountPath }
    }

    @Test func deleteAccountAsksForConfirmationFirst() async {
        let model = makeModel()

        model.deleteAccountTapped()

        #expect(model.isConfirmingDeletion)
        #expect(sessions.saved == CloudFixture.session)
        #expect(await transport.requests.isEmpty)
    }

    @Test func theCloudDeletesTheAccountWithTheBearer() async throws {
        await transport.answer(CloudFixture.accountPath, with: CloudFixture.accountDeleted)
        let model = makeModel()

        model.deleteAccount()
        await model.deletion?.value

        let request = try #require(await deletionRequests().first)
        #expect(await deletionRequests().count == 1)
        #expect(request.url?.absoluteString == "https://api.kiroshi.app/me")
        #expect(request.httpMethod == "DELETE")
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer fixture-bearer")
        #expect(request.httpBody == nil)
    }

    @Test func aDeletedAccountLeavesNothingOnTheDeviceAndOpensWelcome() async {
        await transport.answer(CloudFixture.accountPath, with: CloudFixture.accountDeleted)
        let model = makeModel()
        var signOuts = 0
        model.onSignOut = { signOuts += 1 }

        model.deleteAccountTapped()
        model.isConfirmingDeletion = false
        model.deleteAccount()
        await model.deletion?.value

        #expect(sessions.saved == nil)
        #expect(lastSpace.saved == nil)
        #expect(!agreements.hasAgreed(account: CloudFixture.userId))
        #expect(model.stage == .signedOut)
        #expect(model.signedInEmail.isEmpty)
        #expect(!model.isDeletingAccount)
        #expect(!model.hasFailedToDeleteAccount)
        #expect(signOuts == 1)
    }

    @Test func anAccountAlreadyGoneIsForgottenTheSameWay() async {
        await transport.answer(
            CloudFixture.accountPath, with: CloudFixture.refused("Authentication required"))
        let model = makeModel()

        model.deleteAccount()
        await model.deletion?.value

        #expect(sessions.saved == nil)
        #expect(lastSpace.saved == nil)
        #expect(!agreements.hasAgreed(account: CloudFixture.userId))
        #expect(model.stage == .signedOut)
    }

    @Test(arguments: [CloudFixture.accountNotDeleted, .offline])
    func aFailedDeletionClearsNothingAndSaysSo(answer: ScriptedTransport.Answer) async {
        await transport.answer(CloudFixture.accountPath, with: answer)
        let model = makeModel()

        model.deleteAccount()
        await model.deletion?.value

        #expect(sessions.saved == CloudFixture.session)
        #expect(lastSpace.saved == CloudFixture.studioId)
        #expect(agreements.hasAgreed(account: CloudFixture.userId))
        #expect(model.stage == .loadingSpaces)
        #expect(model.signedInEmail == CloudFixture.email)
        #expect(model.hasFailedToDeleteAccount)
        #expect(!model.isDeletingAccount)
    }

    @Test func tryingAgainAfterAFailureDeletesTheAccount() async {
        await transport.answer(CloudFixture.accountPath, with: CloudFixture.accountNotDeleted)
        let model = makeModel()
        model.deleteAccount()
        await model.deletion?.value
        await transport.answer(CloudFixture.accountPath, with: CloudFixture.accountDeleted)

        model.deleteAccount()
        #expect(!model.hasFailedToDeleteAccount)
        await model.deletion?.value

        #expect(await deletionRequests().count == 2)
        #expect(sessions.saved == nil)
        #expect(model.stage == .signedOut)
    }

    @Test func aDeletionRunningCantBeStartedTwice() async {
        await transport.answer(CloudFixture.accountPath, with: .pending)
        let model = makeModel()

        model.deleteAccount()
        let running = model.deletion
        model.deleteAccount()
        await Task.yield()

        #expect(model.isDeletingAccount)
        #expect(model.deletion == running)
        #expect(sessions.saved == CloudFixture.session)
        running?.cancel()
        await running?.value
        #expect(await deletionRequests().count == 1)
    }

    @Test func aSessionEndedBeforeTheCloudAnswersStillForgetsTheAccount() async {
        await transport.answer(CloudFixture.accountPath, with: CloudFixture.accountDeleted)
        let model = makeModel()

        model.deleteAccount()
        model.signOut()
        await model.deletion?.value
        await model.revocation?.value

        #expect(sessions.saved == nil)
        #expect(lastSpace.saved == nil)
        #expect(!agreements.hasAgreed(account: CloudFixture.userId))
        #expect(model.stage == .signedOut)
    }
}
