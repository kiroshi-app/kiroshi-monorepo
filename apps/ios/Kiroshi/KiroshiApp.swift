import GoogleSignIn
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
                .onOpenURL { url in
                    if !model.openInvitation(from: url) {
                        GIDSignIn.sharedInstance.handle(url)
                    }
                }
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
                baseURL: KiroshiCloud.productionURL, transport: URLSessionTransport(),
                deviceName: DeviceName.of(
                    name: UIDevice.current.name, model: UIDevice.current.model)),
            sessions: KeychainSessionStore(),
            lastSpace: UserDefaultsLastSpaceStore(),
            agreements: UserDefaultsAgreementStore(),
            relay: .live,
            google: GoogleSignInAuthorizer())
    }
}
