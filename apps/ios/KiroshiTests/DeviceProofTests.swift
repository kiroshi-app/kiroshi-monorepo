import CryptoKit
import Foundation
import Testing

@testable import Kiroshi

struct DeviceProofTests {
    static let signingSeed = "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60"
    static let userId = "7d3f1c2a-0000-4000-8000-000000000001"
    static let message =
        "6b69726f7368692d6465766963652d72656769737465722d7631"
        + "37643366316332612d303030302d343030302d383030302d303030303030303030303031"
        + "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a"
        + "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f"

    let keys: DeviceKeys

    init() throws {
        keys = DeviceKeys(
            signing: try Curve25519.Signing.PrivateKey(
                rawRepresentation: try #require(Data(hex: Self.signingSeed))),
            agreement: Curve25519.KeyAgreement.PrivateKey())
    }

    @Test func theMessageIsTheContextTheUserIdTheKeyAndTheNonceWithNoSeparator() throws {
        let message = DeviceProof.message(
            userId: Self.userId, signingKey: keys.signing.publicKey, nonce: FixtureKeys.nonce)

        #expect(message.hex == Self.message)
        #expect(message.count == 26 + 36 + 32 + 32)
    }

    @Test func theSignatureSentVerifiesOverTheMessageOfTheDoc() async throws {
        let transport = ScriptedTransport()
        let cloud = KiroshiCloud(baseURL: KiroshiCloud.productionURL, transport: transport)

        _ = try await cloud.registerDevice(keys, userId: Self.userId, bearer: "b")

        let request = try #require(
            await transport.requests.last { $0.url?.path() == FixtureKeys.devicesPath })
        let body = try JSONDecoder().decode(
            [String: String].self, from: try #require(request.httpBody))
        #expect(body["ed25519PublicKey"] == "11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo")
        #expect(body["nonce"] == "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8")
        let encoded = try #require(body["signature"])
        #expect(encoded.count == 86)
        #expect(encoded.wholeMatch(of: /[A-Za-z0-9_-]{85}[AQgw]/) != nil)
        let signature = try #require(Data(unpaddedBase64URL: encoded))
        #expect(signature.count == 64)
        let publicKey = try Curve25519.Signing.PublicKey(
            rawRepresentation: try #require(
                Data(hex: "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a")))
        #expect(publicKey.isValidSignature(signature, for: try #require(Data(hex: Self.message))))
    }
}
