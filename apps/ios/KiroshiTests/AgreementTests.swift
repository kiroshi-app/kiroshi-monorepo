import Foundation
import Testing

@testable import Kiroshi

struct UserDefaultsAgreementStoreTests {
    let store = UserDefaultsAgreementStore(key: "test.agreements.\(UUID().uuidString)")

    @Test func remembersEachAccountThatAgreed() {
        #expect(!store.hasAgreed(account: "sam"))

        store.agree(account: "sam")
        store.agree(account: "sam")

        #expect(store.hasAgreed(account: "sam"))
        #expect(!store.hasAgreed(account: "alex"))
        #expect(UserDefaults.standard.stringArray(forKey: store.key) == ["sam"])

        store.agree(account: "alex")

        #expect(store.hasAgreed(account: "sam"))
        #expect(store.hasAgreed(account: "alex"))
    }

    @Test func forgetsOnlyTheAccountDeleted() {
        store.agree(account: "sam")
        store.agree(account: "alex")

        store.forget(account: "sam")

        #expect(!store.hasAgreed(account: "sam"))
        #expect(store.hasAgreed(account: "alex"))
        #expect(UserDefaults.standard.stringArray(forKey: store.key) == ["alex"])
    }
}

@MainActor
struct AgreementTests {
    let transport = ScriptedTransport()

    func makeModel(sessions: any SessionStore, agreements: any AgreementStore) -> SignInModel {
        SignInModel(
            cloud: KiroshiCloud(baseURL: KiroshiCloud.productionURL, transport: transport),
            sessions: sessions, lastSpace: InMemoryLastSpaceStore(), agreements: agreements,
            relay: CloudFixture.relay)
    }

    @Test func aFirstSignInAsksBeforeLoadingTheSpaces() async {
        await transport.answer(CloudFixture.signInPath, with: CloudFixture.signedIn)
        let sessions = InMemorySessionStore()
        let agreements = InMemoryAgreementStore()
        let model = makeModel(sessions: sessions, agreements: agreements)
        model.path = [.code]
        model.email = CloudFixture.email
        model.code = "482913"

        await model.signIn()

        #expect(model.stage == .agreeing)
        #expect(model.path.isEmpty)
        #expect(sessions.saved?.userId == CloudFixture.userId)
        #expect(agreements.agreed.isEmpty)
    }

    @Test func agreeingIsRememberedForTheAccountAndLoadsTheSpaces() {
        let agreements = InMemoryAgreementStore()
        let model = makeModel(
            sessions: InMemorySessionStore(CloudFixture.session), agreements: agreements)
        #expect(model.stage == .agreeing)

        model.agree()

        #expect(model.stage == .loadingSpaces)
        #expect(agreements.agreed == [CloudFixture.userId])
        let relaunched = makeModel(
            sessions: InMemorySessionStore(CloudFixture.session), agreements: agreements)
        #expect(relaunched.stage == .loadingSpaces)
    }

    @Test func notNowSignsOutWithoutAgreeing() async {
        await transport.answer(CloudFixture.signOutPath, with: CloudFixture.signedOut)
        let sessions = InMemorySessionStore(CloudFixture.session)
        let agreements = InMemoryAgreementStore()
        let model = makeModel(sessions: sessions, agreements: agreements)

        model.signOut()
        await model.revocation?.value

        #expect(model.stage == .signedOut)
        #expect(sessions.saved == nil)
        #expect(agreements.agreed.isEmpty)
        #expect(await transport.requests.last?.url?.path() == CloudFixture.signOutPath)
        let relaunched = makeModel(
            sessions: InMemorySessionStore(CloudFixture.session), agreements: agreements)
        #expect(relaunched.stage == .agreeing)
    }

    @Test func anotherAccountIsAskedAgain() {
        let other = Session(bearer: "other-bearer", email: "alex@example.com", userId: "alex-id")
        let model = makeModel(
            sessions: InMemorySessionStore(other), agreements: CloudFixture.agreements())

        #expect(model.stage == .agreeing)
    }

    @Test func aSessionSavedWithoutItsUserIdIsKnownByItsEmail() {
        let saved = Session(bearer: "fixture-bearer", email: CloudFixture.email)
        let agreements = InMemoryAgreementStore()
        let model = makeModel(sessions: InMemorySessionStore(saved), agreements: agreements)

        model.agree()

        #expect(agreements.agreed == [CloudFixture.email])
    }
}
