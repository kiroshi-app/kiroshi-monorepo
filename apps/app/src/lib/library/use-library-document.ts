import { skipToken, useQuery } from "@tanstack/react-query"

import { i18n } from "@workspace/ui/lib/i18n"

import { libraryQueryKeys } from "./library-query-keys"
import { readLibraryDocument } from "./library-reads"

export const useLibraryDocument = (spaceId: string, name: string | null) => {
	const read = useQuery({
		queryKey: libraryQueryKeys.documentOf(spaceId, name ?? ""),
		queryFn: name ? () => readLibraryDocument(spaceId, name) : skipToken,
		gcTime: 0,
		meta: {
			failureNotice: () => ({
				title: i18n.t("bots:skills.files.failure.read"),
			}),
			raisedIn: "use-library-document",
		},
	})
	return { document: read.data ?? null, readAgain: read.refetch }
}
