export const updaterQueryKeys = {
	all: ["updater"] as const,
	runningVersion: () => [...updaterQueryKeys.all, "runningVersion"] as const,
	releaseNotes: (version: string | null) =>
		[...updaterQueryKeys.all, "releaseNotes", version] as const,
}
