import { useQuery } from "@tanstack/react-query"
import { getVersion } from "@tauri-apps/api/app"

import { updaterFailureNotice } from "./updater-failure"
import { updaterQueryKeys } from "./updater-query-keys"

import { isDesktopHost } from "../host"

const readRunningVersion = (): Promise<string> =>
	isDesktopHost() ? getVersion() : Promise.resolve(__APP_VERSION__)

export const useRunningVersion = (): string | null => {
	const { data } = useQuery({
		queryKey: updaterQueryKeys.runningVersion(),
		queryFn: readRunningVersion,
		meta: {
			failureNotice: updaterFailureNotice,
			raisedIn: "use-running-version",
		},
	})
	return data ?? null
}
