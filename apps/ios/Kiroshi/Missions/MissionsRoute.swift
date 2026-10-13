enum MissionsRoute: Hashable {
    case mission(Mission)
}

extension MissionsRoute {
    @MainActor static var atLaunch: [MissionsRoute] {
        #if DEBUG
            if [.missionThread, .missionWorking, .slowMission].contains(SignInFixture.opened) {
                return [.mission(MissionsFixture.splitOnboarding)]
            }
        #endif
        return []
    }
}
