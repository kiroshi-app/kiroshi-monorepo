import Foundation
import Testing

@testable import Kiroshi

@MainActor
struct SignInModelTests {
    let transport = ScriptedTransport()
    let sessions = InMemorySessionStore()

    func makeModel() -> SignInModel {
        SignInModel(
            cloud: KiroshiCloud(baseURL: KiroshiCloud.productionURL, transport: transport),
            sessions: sessions,
            lastSpace: InMemoryLastSpaceStore(), agreements: CloudFixture.agreements(),
            relay: CloudFixture.relay)
    }

    func modelOnCodeScreen(code: String = "482913") -> SignInModel {
        let model = makeModel()
        model.path = [.code]
        model.email = CloudFixture.email
        model.code = code
        return model
    }

    func lastRequestBody() async throws -> [String: String] {
        let body = try #require(await transport.requests.last?.httpBody)
        return try JSONDecoder().decode([String: String].self, from: body)
    }

    @Test func opensOnSignInWithoutASavedSession() {
        let model = makeModel()

        #expect(model.stage == .signedOut)
        #expect(model.path.isEmpty)
    }

    @Test func skipsSignInAndLoadsSpacesWithASavedSession() {
        let sessions = InMemorySessionStore(CloudFixture.session)
        let model = SignInModel(
            cloud: KiroshiCloud(baseURL: KiroshiCloud.productionURL, transport: transport),
            sessions: sessions,
            lastSpace: InMemoryLastSpaceStore(), agreements: CloudFixture.agreements(),
            relay: CloudFixture.relay)

        #expect(model.stage == .loadingSpaces)
        #expect(model.signedInEmail == CloudFixture.email)
    }

    @Test func aSentCodeOpensTheCodeScreenForTheTrimmedEmail() async throws {
        await transport.answer(CloudFixture.codeRequestPath, with: CloudFixture.codeSent)
        let model = makeModel()
        model.email = "  sam@example.com "

        await model.requestCode()

        #expect(model.path == [.code])
        #expect(model.email == CloudFixture.email)
        #expect(model.emailProblem == nil)
        #expect(model.isRequestingCode == false)
        #expect(try await lastRequestBody() == ["email": CloudFixture.email])
        #expect(await transport.requests.last?.httpMethod == "POST")
    }

    @Test(
        arguments: [
            (
                CloudFixture.error(
                    503, code: "SERVICE_UNAVAILABLE", message: "Email delivery failed"),
                EmailProblem.unreachable
            ),
            (ScriptedTransport.Answer.offline, EmailProblem.unreachable),
            (
                CloudFixture.error(429, code: "TOO_MANY_REQUESTS", message: "Too many requests"),
                EmailProblem.tooManyCodes
            ),
            (
                CloudFixture.error(400, code: "VALIDATION_ERROR", message: "Invalid"),
                EmailProblem.invalidEmail
            ),
        ])
    func aRefusedCodeRequestStaysOnWelcome(
        answer: ScriptedTransport.Answer, problem: EmailProblem
    ) async {
        await transport.answer(CloudFixture.codeRequestPath, with: answer)
        let model = makeModel()
        model.email = CloudFixture.email

        await model.requestCode()

        #expect(model.path.isEmpty)
        #expect(model.emailProblem == problem)
    }

    @Test func aRightCodeSavesTheSessionAndLoadsSpaces() async throws {
        await transport.answer(CloudFixture.signInPath, with: CloudFixture.signedIn)
        let model = modelOnCodeScreen()

        await model.signIn()

        #expect(
            sessions.saved
                == Session(
                    bearer: "fixture-bearer", email: CloudFixture.email,
                    userId: CloudFixture.userId,
                    deviceName: "iPhone", platform: "ios"))
        #expect(model.stage == .loadingSpaces)
        #expect(model.signedInEmail == CloudFixture.email)
        #expect(model.path.isEmpty)
        #expect(model.isSigningIn == false)
        #expect(
            try await lastRequestBody() == [
                "email": CloudFixture.email, "otp": "482913", "deviceName": "iPhone",
                "platform": "ios",
            ])
    }

    @Test func aSignInNamesTheSessionAfterTheIPhone() async throws {
        await transport.answer(
            CloudFixture.signInPath,
            with: .status(
                200,
                #"{"token":"fixture-bearer","user":{"id":"7d3f1c2a-0000-4000-8000-000000000001","email":"sam@example.com"},"session":{"deviceName":"Sam's iPhone","platform":"ios"}}"#
            ))
        let model = SignInModel(
            cloud: KiroshiCloud(
                baseURL: KiroshiCloud.productionURL, transport: transport,
                deviceName: "Sam's iPhone"),
            sessions: sessions, lastSpace: InMemoryLastSpaceStore(),
            agreements: CloudFixture.agreements(), relay: CloudFixture.relay)
        model.email = CloudFixture.email
        model.code = "482913"

        await model.signIn()

        let body = try await lastRequestBody()
        #expect(body["deviceName"] == "Sam's iPhone")
        #expect(body["platform"] == "ios")
        #expect(sessions.saved?.deviceName == "Sam's iPhone")
        #expect(sessions.saved?.platform == "ios")
    }

    @Test func aSignInAnsweredWithoutTheSessionNameStillSignsIn() async {
        await transport.answer(
            CloudFixture.signInPath,
            with: .status(
                200,
                #"{"token":"fixture-bearer","user":{"id":"7d3f1c2a-0000-4000-8000-000000000001","email":"sam@example.com"},"session":{"expiresAt":"2026-10-17T12:00:00.000Z"}}"#
            ))
        let model = modelOnCodeScreen()

        await model.signIn()

        #expect(sessions.saved == CloudFixture.session)
        #expect(model.stage == .loadingSpaces)
    }

    @Test(
        arguments: [
            ("Code is wrong", CodeProblem.wrongCode, "482913"),
            ("Too many wrong codes, ask for a new one", CodeProblem.tooManyWrongCodes, "482913"),
            ("Code has expired", CodeProblem.expiredCode, ""),
        ])
    func eachRefusedCodeShowsItsState(message: String, problem: CodeProblem, codeLeft: String) async
    {
        await transport.answer(CloudFixture.signInPath, with: CloudFixture.refused(message))
        let model = modelOnCodeScreen()

        await model.signIn()

        #expect(model.codeProblem == problem)
        #expect(model.code == codeLeft)
        #expect(model.stage == .signedOut)
        #expect(model.path == [.code])
        #expect(sessions.saved == nil)
    }

    @Test func onlyAnExpiredOrSpentCodeAsksForANewOne() {
        #expect(CodeProblem.expiredCode.needsNewCode)
        #expect(CodeProblem.tooManyWrongCodes.needsNewCode)
        #expect(!CodeProblem.wrongCode.needsNewCode)
        #expect(!CodeProblem.tooManyCodes.needsNewCode)
        #expect(!CodeProblem.unreachable.needsNewCode)
    }

    @Test(arguments: [ScriptedTransport.Answer.offline, .status(500, "")])
    func anUnreachableSignInSaysSo(answer: ScriptedTransport.Answer) async {
        await transport.answer(CloudFixture.signInPath, with: answer)
        let model = modelOnCodeScreen()

        await model.signIn()

        #expect(model.codeProblem == .unreachable)
        #expect(model.stage == .signedOut)
    }

    @Test func aCancelledSignInShowsNoProblem() async {
        await transport.answer(CloudFixture.signInPath, with: .pending)
        let model = modelOnCodeScreen()

        let signingIn = Task { await model.signIn() }
        signingIn.cancel()
        await signingIn.value

        #expect(model.codeProblem == nil)
        #expect(model.isSigningIn == false)
        #expect(model.stage == .signedOut)
    }

    @Test func typingKeepsSixDigitsOnly() {
        let model = modelOnCodeScreen(code: "48 2a9137")

        model.codeChanged()

        #expect(model.code == "482913")
    }

    @Test func editingAWrongCodeClearsItsProblem() async {
        await transport.answer(CloudFixture.signInPath, with: CloudFixture.refused("Code is wrong"))
        let model = modelOnCodeScreen()
        await model.signIn()

        model.code = "48291"
        model.codeChanged()

        #expect(model.codeProblem == nil)
    }

    @Test func anExpiredCodeKeepsAskingForANewOneWhileTheBoxesEmpty() async {
        await transport.answer(
            CloudFixture.signInPath, with: CloudFixture.refused("Code has expired"))
        let model = modelOnCodeScreen()
        await model.signIn()

        model.codeChanged()

        #expect(model.codeProblem == .expiredCode)
    }

    @Test func aNewCodeClearsTheBoxesAndTheProblem() async {
        await transport.answer(
            CloudFixture.signInPath, with: CloudFixture.refused("Code has expired"))
        await transport.answer(CloudFixture.codeRequestPath, with: CloudFixture.codeSent)
        let model = modelOnCodeScreen()
        await model.signIn()

        await model.sendNewCode()

        #expect(model.codeProblem == nil)
        #expect(model.code.isEmpty)
        #expect(model.path == [.code])
    }

    @Test(
        arguments: [
            (
                CloudFixture.error(429, code: "TOO_MANY_REQUESTS", message: "Too many requests"),
                CodeProblem.tooManyCodes
            ),
            (ScriptedTransport.Answer.offline, CodeProblem.unreachable),
            (
                CloudFixture.error(
                    503, code: "SERVICE_UNAVAILABLE", message: "Email delivery failed"),
                CodeProblem.unreachable
            ),
        ])
    func aRefusedNewCodeKeepsWhatWasTyped(answer: ScriptedTransport.Answer, problem: CodeProblem)
        async
    {
        await transport.answer(CloudFixture.codeRequestPath, with: answer)
        let model = modelOnCodeScreen(code: "482")

        await model.sendNewCode()

        #expect(model.codeProblem == problem)
        #expect(model.code == "482")
    }

    @Test func aDifferentEmailGoesBackToWelcome() async {
        await transport.answer(CloudFixture.signInPath, with: CloudFixture.refused("Code is wrong"))
        let model = modelOnCodeScreen()
        await model.signIn()

        model.useDifferentEmail()

        #expect(model.path.isEmpty)
        #expect(model.code.isEmpty)
        #expect(model.codeProblem == nil)
        #expect(model.email == CloudFixture.email)
    }

    @Test func spacesLoadWithTheBearer() async {
        await transport.answer(CloudFixture.spacesPath, with: CloudFixture.twoSpaces)
        let sessions = InMemorySessionStore(CloudFixture.session)
        let model = SignInModel(
            cloud: KiroshiCloud(baseURL: KiroshiCloud.productionURL, transport: transport),
            sessions: sessions,
            lastSpace: InMemoryLastSpaceStore(), agreements: CloudFixture.agreements(),
            relay: CloudFixture.relay)

        await model.loadSpaces()

        #expect(
            model.stage
                == .spaces([
                    Space(
                        id: "9b1e0000-0000-4000-8000-000000000001", name: "Studio", role: .owner,
                        isHostOnline: true),
                    Space(
                        id: "9b1e0000-0000-4000-8000-000000000002", name: "Bench", role: .member,
                        isHostOnline: false),
                ]))
        let request = await transport.requests.last
        #expect(request?.url?.absoluteString == "https://api.kiroshi.app/instances")
        #expect(request?.value(forHTTPHeaderField: "Authorization") == "Bearer fixture-bearer")
    }

    @Test func noSpaceLandsOnTheEmptyState() async {
        await transport.answer(CloudFixture.spacesPath, with: CloudFixture.noSpaces)
        let model = SignInModel(
            cloud: KiroshiCloud(baseURL: KiroshiCloud.productionURL, transport: transport),
            sessions: InMemorySessionStore(CloudFixture.session),
            lastSpace: InMemoryLastSpaceStore(), agreements: CloudFixture.agreements(),
            relay: CloudFixture.relay)

        await model.loadSpaces()

        #expect(model.stage == .spaces([]))
    }

    @Test func aRefusedBearerClearsTheKeychainAndGoesBackToSignIn() async {
        await transport.answer(
            CloudFixture.spacesPath,
            with: CloudFixture.refused("Authentication required"))
        let sessions = InMemorySessionStore(CloudFixture.session)
        let model = SignInModel(
            cloud: KiroshiCloud(baseURL: KiroshiCloud.productionURL, transport: transport),
            sessions: sessions,
            lastSpace: InMemoryLastSpaceStore(), agreements: CloudFixture.agreements(),
            relay: CloudFixture.relay)

        await model.loadSpaces()

        #expect(sessions.saved == nil)
        #expect(model.stage == .signedOut)
        #expect(model.path.isEmpty)
    }

    @Test func unreachableSpacesKeepTheSession() async {
        await transport.answer(CloudFixture.spacesPath, with: .offline)
        let sessions = InMemorySessionStore(CloudFixture.session)
        let model = SignInModel(
            cloud: KiroshiCloud(baseURL: KiroshiCloud.productionURL, transport: transport),
            sessions: sessions,
            lastSpace: InMemoryLastSpaceStore(), agreements: CloudFixture.agreements(),
            relay: CloudFixture.relay)

        await model.loadSpaces()

        #expect(model.stage == .spacesUnreachable)
        #expect(sessions.saved == CloudFixture.session)
    }

    @Test func checkAgainReloadsSpaces() async {
        await transport.answer(CloudFixture.spacesPath, with: CloudFixture.noSpaces)
        let model = SignInModel(
            cloud: KiroshiCloud(baseURL: KiroshiCloud.productionURL, transport: transport),
            sessions: InMemorySessionStore(CloudFixture.session),
            lastSpace: InMemoryLastSpaceStore(), agreements: CloudFixture.agreements(),
            relay: CloudFixture.relay)
        await model.loadSpaces()

        model.checkAgain()

        #expect(model.stage == .loadingSpaces)
    }

    @Test func anotherAccountClearsTheKeychainAndOpensWelcome() async {
        let sessions = InMemorySessionStore(CloudFixture.session)
        let model = SignInModel(
            cloud: KiroshiCloud(baseURL: KiroshiCloud.productionURL, transport: transport),
            sessions: sessions,
            lastSpace: InMemoryLastSpaceStore(), agreements: CloudFixture.agreements(),
            relay: CloudFixture.relay)

        model.useAnotherAccount()

        #expect(sessions.saved == nil)
        #expect(model.stage == .signedOut)
        #expect(model.path.isEmpty)
        #expect(model.email.isEmpty)
    }
}
