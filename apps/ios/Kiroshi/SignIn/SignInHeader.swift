import SwiftUI

struct SignInHeader: View {
    let title: LocalizedStringKey
    let message: LocalizedStringKey

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.largeTitle.bold())
                .foregroundStyle(Color.kiroshi(.foreground))
                .accessibilityAddTraits(.isHeader)
            Text(message)
                .foregroundStyle(Color.kiroshi(.mutedForeground))
        }
    }
}
