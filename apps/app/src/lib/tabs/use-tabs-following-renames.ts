import { useEffect } from "react"

import type { WorkspaceTabs } from "./workspace-tabs"

import {
	LIBRARY_DOCUMENT_RENAMED_EVENT,
	type LibraryDocumentRenamed,
} from "../bindings"
import { listen } from "../host"
import { joinedRowIdOf } from "../spaces/joined-spaces-controller"

const spaceRowIdOf = (spaceId: string, hostId: string | null) =>
	hostId === null ? spaceId : joinedRowIdOf(hostId)

const reportUnheardRenames = (reason: unknown) => {
	console.error(
		`tabs: ${LIBRARY_DOCUMENT_RENAMED_EVENT} could not be listened to`,
		reason,
	)
}

export const useTabsFollowingRenames = (
	tabs: Pick<WorkspaceTabs, "followDocumentRename">,
) => {
	useEffect(() => {
		const subscription = listen<LibraryDocumentRenamed>(
			LIBRARY_DOCUMENT_RENAMED_EVENT,
			({ payload: { spaceId, ...rename } }, hostId) =>
				tabs.followDocumentRename(spaceRowIdOf(spaceId, hostId), rename),
		).catch(reportUnheardRenames)
		return () => {
			void subscription.then((unlisten) => unlisten?.())
		}
	}, [tabs])
}
