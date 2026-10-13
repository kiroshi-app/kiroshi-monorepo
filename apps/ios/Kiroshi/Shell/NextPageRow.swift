import SwiftUI

struct NextPageRow: View {
    let nextPage: NextPage
    let loadingLabel: LocalizedStringKey
    let load: () -> Void

    var body: some View {
        switch nextPage {
        case .available, .loading:
            ProgressView()
                .accessibilityLabel(loadingLabel)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
                .listRowSeparator(.hidden)
                .task(id: nextPage) {
                    guard nextPage == .available else { return }
                    load()
                }
        case .failed:
            VStack(spacing: 8) {
                Text("Couldn’t load more. Try again.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                Button("Try Again", action: load)
                    .buttonStyle(.bordered)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .listRowSeparator(.hidden)
        case .complete:
            EmptyView()
        }
    }
}
