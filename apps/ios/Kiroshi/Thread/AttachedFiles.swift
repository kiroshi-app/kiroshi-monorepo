import SwiftUI

struct AttachedFiles: View {
    let names: [String]

    var body: some View {
        VStack(alignment: .trailing, spacing: 2) {
            ForEach(names, id: \.self) { name in
                Label(name, systemImage: "paperclip")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .trailing)
        .padding(.trailing, 4)
    }
}
