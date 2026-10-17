struct RelayEnvironment: Sendable {
    static let live = RelayEnvironment(
        transport: URLSessionRelayTransport(), clock: ContinuousRelayClock(),
        keychain: SystemKeychain(), spaceKeys: KeychainSpaceKeyStore(keychain: SystemKeychain()))

    let transport: any RelayTransport
    let clock: any RelayClock
    let deviceKeys: DeviceKeyStore
    let relayDevices: RelayDeviceStore
    let spaceKeys: any SpaceKeyStore
    let counters: FrameCounters

    init(
        transport: any RelayTransport, clock: any RelayClock, keychain: any KeychainItems,
        spaceKeys: any SpaceKeyStore
    ) {
        self.transport = transport
        self.clock = clock
        deviceKeys = DeviceKeyStore(keychain: keychain)
        relayDevices = RelayDeviceStore(keychain: keychain)
        self.spaceKeys = spaceKeys
        counters = FrameCounters(keychain: keychain)
    }
}
