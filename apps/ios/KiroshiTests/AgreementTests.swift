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
struct MessageConsentTests {
    @Test func readsTheAgreementOfItsAccountOnly() {
        let agreements = CloudFixture.agreements()

        #expect(MessageConsent(account: CloudFixture.userId, agreements: agreements).hasAgreed)
        #expect(!MessageConsent(account: "alex-id", agreements: agreements).hasAgreed)
    }

    @Test func agreeingAndWithdrawingAreStoredForTheAccount() {
        let agreements = InMemoryAgreementStore()
        let consent = MessageConsent(account: CloudFixture.userId, agreements: agreements)

        consent.agree()

        #expect(consent.hasAgreed)
        #expect(agreements.agreed == [CloudFixture.userId])

        consent.withdraw()

        #expect(!consent.hasAgreed)
        #expect(agreements.agreed.isEmpty)
    }
}

@MainActor
struct SendGateTests {
    let agreements = InMemoryAgreementStore()
    let gate = SendGate()
    var consent: MessageConsent {
        MessageConsent(account: CloudFixture.userId, agreements: agreements)
    }

    @Test func aFirstSendAsksAndSendsNothing() {
        var sends = 0

        gate.send(with: consent) { sends += 1 }

        #expect(gate.isAsking)
        #expect(sends == 0)
        #expect(agreements.agreed.isEmpty)
    }

    @Test func agreeAndSendSendsOnceAndNeverAsksAgain() {
        let consent = consent
        var sends = 0
        gate.send(with: consent) { sends += 1 }

        gate.agreeAndSend(with: consent) { sends += 1 }
        gate.agreeAndSend(with: consent) { sends += 1 }

        #expect(sends == 1)
        #expect(!gate.isAsking)
        #expect(agreements.agreed == [CloudFixture.userId])

        let nextThread = SendGate()
        nextThread.send(with: self.consent) { sends += 1 }

        #expect(!nextThread.isAsking)
        #expect(sends == 2)
    }

    @Test func notNowKeepsTheDraftAndTheNextSendAsksAgain() {
        let consent = consent
        var sends = 0
        gate.send(with: consent) { sends += 1 }

        gate.notNow()

        #expect(!gate.isAsking)
        #expect(gate.isDraftKept)
        #expect(sends == 0)
        #expect(agreements.agreed.isEmpty)

        gate.send(with: consent) { sends += 1 }

        #expect(gate.isAsking)
        #expect(sends == 0)
    }

    @Test func aSendThatGoesOutClearsTheNote() {
        let consent = consent
        gate.send(with: consent) {}
        gate.notNow()

        gate.send(with: consent) {}
        gate.agreeAndSend(with: consent) {}

        #expect(!gate.isDraftKept)
    }

    @Test func withdrawingMakesTheNextSendAsk() {
        let consent = consent
        consent.agree()
        var sends = 0
        gate.send(with: consent) { sends += 1 }
        #expect(sends == 1)

        consent.withdraw()
        gate.send(with: consent) { sends += 1 }

        #expect(gate.isAsking)
        #expect(sends == 1)
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

    @Test func aFirstSignInGoesStraightToTheSpaces() async {
        await transport.answer(CloudFixture.signInPath, with: CloudFixture.signedIn)
        await transport.answer(CloudFixture.spacesPath, with: CloudFixture.threeSpaces)
        let agreements = InMemoryAgreementStore()
        let model = makeModel(sessions: InMemorySessionStore(), agreements: agreements)
        model.path = [.code]
        model.email = CloudFixture.email
        model.code = "482913"

        await model.signIn()

        #expect(model.stage == .loadingSpaces)

        await model.loadSpaces()

        #expect(model.stage == .spaces(CloudFixture.artboardSpaces))
        #expect(model.consent?.hasAgreed == false)
        #expect(agreements.agreed.isEmpty)
    }

    @Test func theConsentFollowsTheSignedInAccountAndEndsWithTheSession() async {
        await transport.answer(CloudFixture.spacesPath, with: CloudFixture.threeSpaces)
        await transport.answer(CloudFixture.signOutPath, with: CloudFixture.signedOut)
        let agreements = InMemoryAgreementStore()
        let model = makeModel(
            sessions: InMemorySessionStore(CloudFixture.session), agreements: agreements)
        #expect(model.stage == .loadingSpaces)
        await model.loadSpaces()

        model.consent?.agree()
        model.signOut()
        await model.revocation?.value

        #expect(agreements.agreed == [CloudFixture.userId])
        #expect(model.consent == nil)
    }

    @Test func aSessionSavedWithoutItsUserIdIsKnownByItsEmail() async {
        await transport.answer(CloudFixture.spacesPath, with: CloudFixture.threeSpaces)
        let saved = Session(bearer: "fixture-bearer", email: CloudFixture.email)
        let agreements = InMemoryAgreementStore()
        let model = makeModel(sessions: InMemorySessionStore(saved), agreements: agreements)
        await model.loadSpaces()

        model.consent?.agree()

        #expect(agreements.agreed == [CloudFixture.email])
    }
}
