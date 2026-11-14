import { useRouter } from "@tanstack/react-router"
import { useEffect } from "react"

import {
	createLibraryCommentMentionOpening,
	type MentionedSpace,
} from "./library-comment-mention-opening"
import { askForMentionedThread } from "./mentioned-comment-thread"
import { reportUnheard } from "./use-library-document-writers"

import {
	LIBRARY_COMMENT_MENTION_OPENED_EVENT,
	type LibraryCommentMentionOpened,
	type LibraryCommentThread,
} from "../bindings"
import { raiseReportedFailure } from "../failure-report"
import { invokeOn, isDesktopHost, listenOnThisWindow } from "../host"
import { showLibraryItemOfSpace } from "../navigation/use-open-library-document"
import {
	hostSpaceIdOf,
	type JoinedSpacesController,
	joinedRowIdOf,
} from "../spaces/joined-spaces-controller"

type MentionedSpaces = Pick<JoinedSpacesController, "getState" | "selectSpace">

const RAISED_IN = "use-library-comment-mention-opening"

const mentionedSpaceIn =
	(joinedSpaces: MentionedSpaces) =>
	(spaceId: string): MentionedSpace => {
		const joined = joinedSpaces
			.getState()
			.joinedSpaces.find(({ id }) => id === spaceId)
		return joined
			? {
					rowId: joinedRowIdOf(joined.id),
					hostId: joined.id,
					hostSpaceId: hostSpaceIdOf(joined),
				}
			: { rowId: spaceId, hostId: null, hostSpaceId: spaceId }
	}

const readThreadsOn = ({ hostId, hostSpaceId }: MentionedSpace, name: string) =>
	invokeOn(hostId)<LibraryCommentThread[]>("library_comment_threads", {
		spaceId: hostSpaceId,
		name,
	})

export const useLibraryCommentMentionOpening = (
	joinedSpaces: MentionedSpaces,
) => {
	const router = useRouter()

	useEffect(() => {
		if (!isDesktopHost()) {
			return
		}
		const { tabs } = router.options.context
		const openMention = createLibraryCommentMentionOpening({
			spaceOf: mentionedSpaceIn(joinedSpaces),
			readThreads: readThreadsOn,
			showItem: (rowId, opening) => {
				showLibraryItemOfSpace(router, rowId, opening)
				if (rowId !== tabs.getState().spaceId) {
					joinedSpaces.selectSpace(rowId)
				}
			},
			askForThread: askForMentionedThread,
			raiseFailure: (notice) =>
				void raiseReportedFailure(notice, { raisedIn: RAISED_IN }),
		})
		const subscription = listenOnThisWindow<LibraryCommentMentionOpened>(
			LIBRARY_COMMENT_MENTION_OPENED_EVENT,
			({ payload }) => void openMention(payload),
		).catch(reportUnheard(LIBRARY_COMMENT_MENTION_OPENED_EVENT))
		return () => {
			void subscription.then((unlisten) => unlisten?.())
		}
	}, [router, joinedSpaces])
}
