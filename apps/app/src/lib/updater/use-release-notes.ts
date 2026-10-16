import { queryOptions, skipToken, useQuery } from "@tanstack/react-query"

import { updaterQueryKeys } from "./updater-query-keys"

import { commands, type ReleaseNotes } from "../bindings"

const readReleaseNotes = async (version: string): Promise<ReleaseNotes> => {
	const result = await commands.releaseNotes(version)
	if (result.status === "error") {
		throw result.error
	}
	return result.data
}

export const releaseNotesQueryOf = (version: string) =>
	queryOptions({
		queryKey: updaterQueryKeys.releaseNotes(version),
		queryFn: () => readReleaseNotes(version),
		meta: { rendersErrorInline: true },
	})

type ReleaseNotesRequest = {
	version: string | null
	isWanted: boolean
}

export const useReleaseNotes = ({
	version,
	isWanted,
}: ReleaseNotesRequest): ReleaseNotes | null => {
	const { data } = useQuery(
		version && isWanted
			? releaseNotesQueryOf(version)
			: {
					queryKey: updaterQueryKeys.releaseNotes(version),
					queryFn: skipToken,
				},
	)
	return data ?? null
}
