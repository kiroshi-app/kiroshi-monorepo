import CryptoKit
import Foundation

enum Fingerprint {
    static let wordListSHA256 = "2f5eed53a4727b4bf8880d8f3f199efc90e58503646d9ff8eff3a2ed3b24dbda"

    static func words(in list: Data) -> [String]? {
        guard Data(SHA256.hash(data: list)).hex == wordListSHA256 else { return nil }
        let words = String(decoding: list, as: UTF8.self).split(separator: "\n").map(String.init)
        return words.count == 2048 ? words : nil
    }

    static func bundledWords() -> [String]? {
        guard let url = Bundle.main.url(forResource: "bip39-english", withExtension: "txt"),
            let list = try? Data(contentsOf: url)
        else { return nil }
        return words(in: list)
    }

    static func of(_ signingKey: Curve25519.Signing.PublicKey, words: [String]) -> [String] {
        let digest = Array(SHA256.hash(data: signingKey.rawRepresentation))
        return (0..<6).map { word in
            let index = (11 * word..<11 * word + 11).reduce(0) { index, bit in
                index << 1 | Int(digest[bit / 8] >> (7 - bit % 8) & 1)
            }
            return words[index]
        }
    }
}
