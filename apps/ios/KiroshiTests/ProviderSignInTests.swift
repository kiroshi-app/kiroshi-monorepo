import AuthenticationServices
import Foundation
import Testing

@testable import Kiroshi

struct NonceTests {
    @Test func aRandomNonceIs32HexBytesAndNeverRepeats() {
        let first = Nonce.random()
        let second = Nonce.random()

        #expect(first.count == 64)
        #expect(first.allSatisfy { $0.isHexDigit })
        #expect(first != second)
    }

    @Test func theHashedNonceIsTheLowercaseHexSHA256OfTheRawOne() {
        #expect(
            Nonce.sha256("abc")
                == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    }
}

struct AppleOutcomeTests {
    @Test func aCancelledAppleSheetIsACancellation() {
        let outcome = ProviderOutcome(apple: .failure(ASAuthorizationError(.canceled)))

        #expect(outcome == .cancelled)
    }

    @Test(arguments: [ASAuthorizationError.Code.failed, .unknown, .invalidResponse])
    func anyOtherAppleErrorIsAFailure(code: ASAuthorizationError.Code) {
        let outcome = ProviderOutcome(apple: .failure(ASAuthorizationError(code)))

        #expect(outcome == .failed)
    }

    @Test func theFullNameIsGivenThenFamilyName() {
        var components = PersonNameComponents()
        components.givenName = "Tim"
        components.familyName = "Berners"

        #expect(ProviderOutcome.name(of: components) == "Tim Berners")
    }

    @Test func noNameOrAnEmptyOneSendsNone() {
        #expect(ProviderOutcome.name(of: nil) == nil)
        #expect(ProviderOutcome.name(of: PersonNameComponents()) == nil)
    }

    @Test func aNameLongerThanTheRelayTakesIsClipped() {
        var components = PersonNameComponents()
        components.givenName = String(repeating: "a", count: 120)

        #expect(ProviderOutcome.name(of: components)?.count == ProviderOutcome.nameMaxLength)
    }
}

@MainActor
struct ProviderSignInModelTests {
    struct StubGoogle: GoogleAuthorizing {
        let outcome: ProviderOutcome

        @MainActor func authorize() async -> ProviderOutcome {
            outcome
        }
    }

    nonisolated static let refusedToken = CloudFixture.refused(
        "ID token is invalid, expired, minted for another client or for another nonce")

    let transport = ScriptedTransport()
    let sessions = InMemorySessionStore()

    func makeModel(
        google: ProviderOutcome = .authorized(idToken: "google-id-token", name: nil)
    ) -> SignInModel {
        SignInModel(
            cloud: KiroshiCloud(
                baseURL: KiroshiCloud.productionURL, transport: transport,
                deviceName: "Sam's iPhone"),
            sessions: sessions, lastSpace: InMemoryLastSpaceStore(),
            agreements: CloudFixture.agreements(), relay: CloudFixture.relay,
            google: StubGoogle(outcome: google))
    }

    func lastRequestBody() async throws -> [String: String] {
        let body = try #require(await transport.requests.last?.httpBody)
        return try JSONDecoder().decode([String: String].self, from: body)
    }

    func signInWithApple(
        _ model: SignInModel, outcome: ProviderOutcome
    ) async -> String {
        let hashedNonce = model.appleRequestNonce()
        model.appleCompleted(outcome)
        await waitUntilSignedInOrIdle(model)
        return hashedNonce
    }

    func waitUntilSignedInOrIdle(_ model: SignInModel) async {
        while model.signingInWith != nil {
            await Task.yield()
        }
    }

    @Test func tappingAppleShowsItsLoadingAndHandsAppleTheHashOfAFreshNonce() {
        let model = makeModel()

        let first = model.appleRequestNonce()
        let second = model.appleRequestNonce()

        #expect(model.signingInWith == .apple)
        #expect(model.isBusy)
        #expect(first.count == 64)
        #expect(first != second)
    }

    @Test func appleSendsItsTokenTheRawNonceAndTheNameThenSignsIn() async throws {
        await transport.answer(CloudFixture.providerSignInPath, with: CloudFixture.signedIn)
        let model = makeModel()

        let hashedNonce = await signInWithApple(
            model, outcome: .authorized(idToken: "apple-id-token", name: "Sam Lee"))

        let request = try #require(await transport.requests.last)
        #expect(request.url?.absoluteString == "https://api.kiroshi.app/api/auth/sign-in/social")
        #expect(request.httpMethod == "POST")
        let body = try await lastRequestBody()
        #expect(
            body.filter { $0.key != "nonce" } == [
                "provider": "apple", "idToken": "apple-id-token", "name": "Sam Lee",
                "deviceName": "Sam's iPhone", "platform": "ios",
            ])
        let rawNonce = try #require(body["nonce"])
        #expect(Nonce.sha256(rawNonce) == hashedNonce)
        #expect(
            sessions.saved
                == Session(
                    bearer: "fixture-bearer", email: CloudFixture.email,
                    userId: CloudFixture.userId,
                    deviceName: "iPhone", platform: "ios"))
        #expect(model.stage == .loadingSpaces)
        #expect(model.signedInEmail == CloudFixture.email)
        #expect(model.signingInWith == nil)
        #expect(model.providerProblem == nil)
    }

    @Test func appleWithoutANameSendsNone() async throws {
        await transport.answer(CloudFixture.providerSignInPath, with: CloudFixture.signedIn)
        let model = makeModel()

        _ = await signInWithApple(model, outcome: .authorized(idToken: "apple-id-token", name: nil))

        #expect(try await lastRequestBody()["name"] == nil)
    }

    @Test func appleSendsTheAuthorizationCodeUnchangedWhenItHasOne() async throws {
        await transport.answer(CloudFixture.providerSignInPath, with: CloudFixture.signedIn)
        let model = makeModel()

        _ = await signInWithApple(
            model,
            outcome: .authorized(
                idToken: "apple-id-token", name: nil, authorizationCode: "c1a2.0.rsxq.Zx9-_"))

        #expect(try await lastRequestBody()["authorizationCode"] == "c1a2.0.rsxq.Zx9-_")
    }

    @Test func appleWithoutAnAuthorizationCodeLeavesItOut() async throws {
        await transport.answer(CloudFixture.providerSignInPath, with: CloudFixture.signedIn)
        let model = makeModel()

        _ = await signInWithApple(model, outcome: .authorized(idToken: "apple-id-token", name: nil))

        #expect(try await lastRequestBody().keys.contains("authorizationCode") == false)
    }

    @Test func eachAppleSheetSendsItsOwnCodeAndARetryNeverResendsTheLastOne() async throws {
        await transport.answer(CloudFixture.providerSignInPath, with: Self.refusedToken)
        let model = makeModel()
        _ = await signInWithApple(
            model,
            outcome: .authorized(idToken: "apple-id-token", name: nil, authorizationCode: "first"))

        _ = await signInWithApple(model, outcome: .authorized(idToken: "apple-id-token", name: nil))

        #expect(try await lastRequestBody().keys.contains("authorizationCode") == false)
    }

    @Test func aGoogleSignInNeverCarriesAnAuthorizationCode() async throws {
        await transport.answer(CloudFixture.providerSignInPath, with: CloudFixture.signedIn)
        let model = makeModel()

        await model.signInWithGoogle()

        let body = try #require(await transport.requests.last?.httpBody)
        let keys = try #require(try JSONSerialization.jsonObject(with: body) as? [String: Any]).keys
        #expect(!keys.contains("authorizationCode"))
    }

    @Test func googleSendsItsTokenWithoutNonceOrNameThenSignsIn() async throws {
        await transport.answer(CloudFixture.providerSignInPath, with: CloudFixture.signedIn)
        let model = makeModel()

        await model.signInWithGoogle()

        #expect(
            try await lastRequestBody() == [
                "provider": "google", "idToken": "google-id-token",
                "deviceName": "Sam's iPhone", "platform": "ios",
            ])
        #expect(sessions.saved?.bearer == "fixture-bearer")
        #expect(model.stage == .loadingSpaces)
    }

    @Test func tappingGoogleShowsItsLoading() {
        let model = makeModel()

        model.continueWithGoogle()

        #expect(model.signingInWith == .google)
        #expect(model.isBusy)
    }

    @Test(
        arguments: [
            refusedToken,
            CloudFixture.error(400, code: "VALIDATION_ERROR", message: "Invalid body"),
            CloudFixture.error(404, code: "NOT_FOUND", message: "Provider not configured"),
        ])
    func aRefusedAppleTokenSaysSoAndFreesTheButtons(answer: ScriptedTransport.Answer) async {
        await transport.answer(CloudFixture.providerSignInPath, with: answer)
        let model = makeModel()

        _ = await signInWithApple(model, outcome: .authorized(idToken: "apple-id-token", name: nil))

        #expect(model.providerProblem == .refused(.apple))
        #expect(model.signingInWith == nil)
        #expect(!model.isBusy)
        #expect(model.stage == .signedOut)
        #expect(sessions.saved == nil)
    }

    @Test func aRefusedGoogleTokenNamesGoogle() async {
        await transport.answer(CloudFixture.providerSignInPath, with: Self.refusedToken)
        let model = makeModel()

        await model.signInWithGoogle()

        #expect(model.providerProblem == .refused(.google))
        #expect(sessions.saved == nil)
    }

    @Test(arguments: [ScriptedTransport.Answer.offline, .status(500, "")])
    func anUnreachableRelaySaysSo(answer: ScriptedTransport.Answer) async {
        await transport.answer(CloudFixture.providerSignInPath, with: answer)
        let model = makeModel()

        _ = await signInWithApple(model, outcome: .authorized(idToken: "apple-id-token", name: nil))

        #expect(model.providerProblem == .unreachable)
        #expect(model.signingInWith == nil)
    }

    @Test func aCancelledAppleSheetGoesBackSilently() async {
        let model = makeModel()

        _ = await signInWithApple(model, outcome: .cancelled)

        #expect(model.providerProblem == nil)
        #expect(model.signingInWith == nil)
        #expect(await transport.requests.isEmpty)
    }

    @Test func aCancelledGoogleSheetGoesBackSilently() async {
        let model = makeModel(google: .cancelled)

        await model.signInWithGoogle()

        #expect(model.providerProblem == nil)
        #expect(model.signingInWith == nil)
        #expect(await transport.requests.isEmpty)
    }

    @Test func aFailedProviderSheetSaysSoWithoutCallingTheRelay() async {
        let model = makeModel(google: .failed)

        await model.signInWithGoogle()
        #expect(model.providerProblem == .refused(.google))

        _ = await signInWithApple(model, outcome: .failed)
        #expect(model.providerProblem == .refused(.apple))
        #expect(await transport.requests.isEmpty)
    }

    @Test func tryingAgainClearsTheLastRefusal() async {
        await transport.answer(CloudFixture.providerSignInPath, with: Self.refusedToken)
        let model = makeModel()
        _ = await signInWithApple(model, outcome: .authorized(idToken: "apple-id-token", name: nil))

        _ = model.appleRequestNonce()

        #expect(model.providerProblem == nil)
    }
}
