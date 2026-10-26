#if DEBUG
    import SwiftUI

    extension ColorScheme {
        static let launchArgument: ColorScheme? =
            switch UserDefaults.standard.string(forKey: "appearance") {
            case "dark": .dark
            case "light": .light
            default: nil
            }
    }
#endif
