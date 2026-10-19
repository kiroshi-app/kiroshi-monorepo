import SwiftUI

struct DeviceCard: View {
    let name: String
    let systemImage: String
    let fingerprint: [String]
    var isThisDevice = false

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: systemImage)
                .font(.title3)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    Text(name)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    if isThisDevice {
                        Text("This device")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
                Text(Self.lines(of: fingerprint))
                    .font(.footnote.monospaced())
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityLabel(Text(fingerprint.joined(separator: ", ")))
            }
        }
        .multilineTextAlignment(.leading)
        .accessibilityElement(children: .combine)
    }

    static func lines(of fingerprint: [String]) -> String {
        let half = (fingerprint.count + 1) / 2
        return [fingerprint.prefix(half), fingerprint.dropFirst(half)]
            .map { $0.joined(separator: " ") }
            .joined(separator: "\n")
    }
}
