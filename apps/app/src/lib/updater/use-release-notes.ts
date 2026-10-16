import { skipToken, useQuery } from "@tanstack/react-query"

import { updaterFailureNotice } from "./updater-failure"
import { updaterQueryKeys } from "./updater-query-keys"

import { commands, type ReleaseNotes } from "../bindings"

const readReleaseNotes = async (version: string): Promise<ReleaseNotes> => {
	const result = await commands.releaseNotes(version)
	if (result.status === "error") {
		throw result.error
	}
	return result.data
}

export type ReadReleaseNotes = {
	releaseNotes: ReleaseNotes | null
	hasFailedToLoad: boolean
	retry: () => void
}

type ReleaseNotesRequest = {
	version: string | null
	isWanted: boolean
}

export const useReleaseNotes = ({
	version,
	isWanted,
}: ReleaseNotesRequest): ReadReleaseNotes => {
	const { data, isError, refetch } = useQuery({
		queryKey: updaterQueryKeys.releaseNotes(version),
		queryFn: version && isWanted ? () => readReleaseNotes(version) : skipToken,
		meta: {
			failureNotice: updaterFailureNotice,
			raisedIn: "use-release-notes",
		},
	})
	return {
		releaseNotes: data ?? null,
		hasFailedToLoad: isError,
		retry: () => {
			void refetch()
		},
	}
}
