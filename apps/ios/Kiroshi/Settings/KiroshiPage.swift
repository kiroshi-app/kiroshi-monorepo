import Foundation

enum KiroshiPage: Identifiable, CaseIterable {
    case privacy
    case terms
    case support

    var id: Self { self }

    var title: String {
        switch self {
        case .privacy: "Privacy Policy"
        case .terms: "Terms of Use"
        case .support: "Support"
        }
    }

    var url: URL {
        switch self {
        case .privacy: URL(string: "https://kiroshi.app/privacy")!
        case .terms: URL(string: "https://kiroshi.app/terms")!
        case .support: URL(string: "https://kiroshi.app/support")!
        }
    }
}
