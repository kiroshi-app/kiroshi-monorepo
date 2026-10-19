import SwiftUI

struct DeviceRequestSheet: View {
    let requests: DeviceRequests
    let request: DeviceRequest
    @ScaledMetric(relativeTo: .title2) private var tileSide = 64
    @ScaledMetric(relativeTo: .title2) private var symbolSide = 30
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                VStack(spacing: 12) {
                    Image(systemName: systemImage)
                        .resizable()
                        .scaledToFit()
                        .frame(width: symbolSide, height: symbolSide)
                        .frame(width: tileSide, height: tileSide)
                        .background(Color(.tertiarySystemBackground), in: .rect(cornerRadius: 16))
                        .accessibilityHidden(true)
                    VStack(spacing: 6) {
                        Text("\(deviceName) wants to use your account")
                            .font(.title2.bold())
                            .accessibilityAddTraits(.isHeader)
                        Text(
                            "\(asked). Approve it only if it’s yours. If it isn’t, choose Not me and it’ll be signed out."
                        )
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    }
                    .multilineTextAlignment(.center)
                }
                .padding(.top, 16)
                DeviceCard(
                    name: deviceName, systemImage: systemImage, fingerprint: request.fingerprint
                )
                .padding(.vertical, 14)
                .padding(.horizontal, 20)
                .frame(maxWidth: .infinity)
                .background(Color(.tertiarySystemBackground), in: .rect(cornerRadius: 26))
                Text("Approve only if \(deviceName) shows these same six words.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                if let problem = requests.problem {
                    ProblemLabel(message: problem.message(for: deviceName))
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(.horizontal, 24)
        }
        .scrollBounceBehavior(.basedOnSize)
        .safeAreaBar(edge: .bottom) {
            VStack(spacing: 8) {
                if requests.problem == .expired {
                    Button("Close", action: requests.dismiss)
                        .fontWeight(.semibold)
                        .buttonSizing(.flexible)
                        .buttonStyle(.borderedProminent)
                        .buttonBorderShape(.capsule)
                        .controlSize(.large)
                        .tint(Color(.systemBlue))
                } else {
                    Button(action: requests.approve) {
                        if requests.isDeciding {
                            ProgressView()
                        } else {
                            Text(requests.problem == .couldNotApprove ? "Try again" : "Approve")
                        }
                    }
                    .fontWeight(.semibold)
                    .buttonSizing(.flexible)
                    .buttonStyle(.borderedProminent)
                    .buttonBorderShape(.capsule)
                    .controlSize(.large)
                    .tint(Color(.systemBlue))
                    Button(role: .destructive, action: requests.refuse) {
                        Text("Not me")
                            .frame(maxWidth: .infinity, minHeight: 50)
                            .contentShape(.rect)
                    }
                    .buttonStyle(.borderless)
                    .tint(Color(.systemRed))
                }
            }
            .disabled(requests.isDeciding)
            .padding(.horizontal, 24)
            .padding(.bottom, 8)
        }
        .presentationDetents(
            dynamicTypeSize.isAccessibilitySize ? [.large] : [.fraction(0.75), .large]
        )
        .presentationBackground(Color(.secondarySystemBackground))
    }

    private var systemImage: String {
        request.device.kind == .phone ? "iphone" : "laptopcomputer"
    }

    private var deviceName: String {
        request.device.name ?? String(localized: "A new device")
    }

    private var asked: Text {
        guard let askedAt = request.askedAt, askedAt.distance(to: .now) >= 60 else {
            return Text("Asked just now")
        }
        return Text("Asked \(askedAt, format: .relative(presentation: .named))")
    }
}

extension DeviceRequestProblem {
    func message(for deviceName: String) -> LocalizedStringKey {
        switch self {
        case .couldNotApprove:
            "Couldn’t approve \(deviceName). Check your connection and try again."
        case .couldNotRefuse:
            "Couldn’t sign out \(deviceName). Check your connection and tap Not me again."
        case .expired: "This request expired. \(deviceName) can ask again from its own screen."
        }
    }
}

#if DEBUG
    #Preview("10 New computer, approve on iPhone") {
        SignInRootView(model: .fixture(.deviceRequest))
    }
#endif
