import SwiftUI

struct ActivityGroupView: View {
    let group: ActivityGroup
    @State private var isExpanded = false

    var body: some View {
        DisclosureGroup(isExpanded: $isExpanded) {
            VStack(alignment: .leading, spacing: 4) {
                ForEach(group.activities) { activity in
                    Text(activity.title)
                        .font(.footnote.monospaced())
                        .foregroundStyle(Color.kiroshi(.mutedForeground))
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(.leading, 28)
            .padding(.top, 4)
        } label: {
            Label(group.summary, systemImage: "wrench")
                .font(.subheadline)
                .foregroundStyle(Color.kiroshi(.foreground))
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(Color.kiroshi(.muted), in: .rect(cornerRadius: 16))
    }
}
