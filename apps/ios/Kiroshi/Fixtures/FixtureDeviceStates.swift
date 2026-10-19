#if DEBUG
    import Foundation

    actor FixtureDeviceStates: DeviceStates {
        static let approvingDevice = AccountDevice(
            id: "5d2c0000-0000-4000-8000-0000000000c1", name: "Sam’s MacBook Pro",
            kind: .computer, isPending: true,
            approvalExpiresAt: .now.addingTimeInterval(DeviceRequest.approvalWindow),
            isCurrent: false, signingKey: FixtureKeys.host.signing.publicKey.rawRepresentation)

        private var ownStates: [OwnDeviceState]
        private var listed: AccountDevicesAnswer
        private(set) var ownStateReads = 0
        private(set) var deviceReads = 0

        init(
            own ownStates: [OwnDeviceState] = [.approved],
            devices listed: AccountDevicesAnswer = .devices([])
        ) {
            self.ownStates = ownStates
            self.listed = listed
        }

        func answer(devices: AccountDevicesAnswer) {
            listed = devices
        }

        func ownState(bearer: String) async throws -> OwnDeviceState {
            ownStateReads += 1
            guard ownStates.count > 1 else { return ownStates.first ?? .unreachable }
            return ownStates.removeFirst()
        }

        func devices(bearer: String) async throws -> AccountDevicesAnswer {
            deviceReads += 1
            return listed
        }
    }
#endif
