import SwiftUI

struct SignInRootView: View {
    @Bindable var model: SignInModel

    var body: some View {
        switch model.stage {
        case .signedOut, .agreeing:
            NavigationStack(path: $model.path) {
                WelcomeView(model: model)
                    .navigationDestination(for: SignInStep.self) { step in
                        switch step {
                        case .code: CodeView(model: model)
                        }
                    }
            }
            .sheet(isPresented: .constant(model.stage == .agreeing)) {
                AgreementSheet(model: model)
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
        }
    }
}
