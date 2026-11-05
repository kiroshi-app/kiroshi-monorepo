import { useEffect, useMemo } from "react"

import {
	type ConversationTabOpeningOptions,
	createConversationTabOpening,
} from "./conversation-tab-opening"

import { isDesktopHost } from "../host"
import type { JoinedSpacesController } from "../spaces/joined-spaces-controller"

const reportUnwatchedReveals = (reason: unknown) => {
	console.error("this window does not answer tab reveals", reason)
	return () => undefined
}

export const useConversationTabOpening = (
	tabs: ConversationTabOpeningOptions["tabs"],
	joinedSpaces: Pick<JoinedSpacesController, "selectSpace">,
) => {
	const opening = useMemo(
		() =>
			createConversationTabOpening({
				tabs,
				selectSpace: joinedSpaces.selectSpace,
			}),
		[tabs, joinedSpaces],
	)

	useEffect(() => {
		if (!isDesktopHost()) {
			return
		}
		const watching = opening.answerReveals().catch(reportUnwatchedReveals)
		return () => {
			void watching.then((stop) => stop())
		}
	}, [opening])

	return opening
}
