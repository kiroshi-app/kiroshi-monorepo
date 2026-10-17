import SwiftUI

struct SignInRootView: View {
    @Bindable var model: SignInModel

    var body: some View {
        switch model.stage {
        case .signedOut:
            NavigationStack(path: $model.path) {
                WelcomeView(model: model)
                    .navigationDestination(for: SignInStep.self) { step in
                        switch step {
                        case .code: CodeView(model: model)
                        }
                    }
            }
        case .loadingSpaces:
            LoadingSpacesView(model: model)
        case .spaces(let spaces) where spaces.isEmpty:
            NoSpaceView(model: model)
        case .spaces:
            if let shell = model.shell {
                ShellView(store: shell, account: model)
            }
        case .spacesUnreachable:
            SpacesUnreachableView(model: model)
        case .deviceRefused(let problem):
            DeviceRefusedView(model: model, problem: problem)
        }
    }
}
