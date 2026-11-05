import { useEffect } from "react"

import { raiseTransientNotice } from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import { titleOf } from "./library-items"

import {
	LIBRARY_BOARD_FILE_REPLACED_EVENT,
	type LibraryBoardFileReplaced,
} from "../bindings"
import { listen } from "../host"

const reportUnheardReplacements = (reason: unknown) => {
	console.error(
		`library: ${LIBRARY_BOARD_FILE_REPLACED_EVENT} could not be listened to`,
		reason,
	)
}

const raiseReplacedNotice = (name: string) =>
	raiseTransientNotice({
		type: "info",
		title: i18n.t("common:library.boardFileReplaced", {
			name: titleOf({ kind: "board", name }),
		}),
	})

export const useLibraryBoardFileReplacedNotices = (
	spaceOnScreen: string | null,
) => {
	useEffect(() => {
		const subscription = listen<LibraryBoardFileReplaced>(
			LIBRARY_BOARD_FILE_REPLACED_EVENT,
			({ payload: { spaceId, name } }) => {
				if (spaceId !== spaceOnScreen) {
					console.info(
						`library: an outside edit of ${name} in Space ${spaceId} was replaced by the live board`,
					)
					return
				}
				raiseReplacedNotice(name)
			},
		).catch(reportUnheardReplacements)
		return () => {
			void subscription.then((unlisten) => unlisten?.())
		}
	}, [spaceOnScreen])
}
