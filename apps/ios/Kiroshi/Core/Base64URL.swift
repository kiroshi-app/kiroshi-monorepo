import Foundation

extension Data {
    init?(unpaddedBase64URL text: String) {
        guard !text.contains("=") else { return nil }
        let standard = text.replacing("-", with: "+").replacing("_", with: "/")
        let padding = String(repeating: "=", count: (4 - standard.count % 4) % 4)
        self.init(base64Encoded: standard + padding)
    }

    var unpaddedBase64URL: String {
        base64EncodedString()
            .replacing("+", with: "-")
            .replacing("/", with: "_")
            .replacing("=", with: "")
    }
}
