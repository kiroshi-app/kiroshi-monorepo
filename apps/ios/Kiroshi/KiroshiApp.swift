import SwiftUI
import UIKit

@main
struct KiroshiApp: App {
    @State private var model = KiroshiApp.makeModel()

    init() {
        #if DEBUG
            if UserDefaults.standard.bool(forKey: "disablesAnimations") {
                UIView.setAnimationsEnabled(false)
            }
        #endif
    }

    var body: some Scene {
        WindowGroup {
            SignInRootView(model: model)
        }
    }

    private static func makeModel() -> SignInModel {
        #if DEBUG
            if let fixture = SignInFixture.launchArgument {
                return .fixture(fixture)
            }
        #endif
        return SignInModel(
            cloud: KiroshiCloud(
                baseURL: KiroshiCloud.productionURL, transport: URLSessionTransport()),
            sessions: KeychainSessionStore(),
            lastSpace: UserDefaultsLastSpaceStore(),
            relay: .live)
    }
}
