import { useNavigate } from "@tanstack/react-router"
import { useEffect, useRef, useSyncExternalStore } from "react"

import { isListPage, pageOf, sameThread, threadRowIdOf } from "./tab-pages"
import type { WorkspaceTabs } from "./workspace-tabs"

import type { RosterController } from "../bots/roster-controller"
import { missionsTransport } from "../missions/missions-transport"
import type {
	OpenedMission,
	OpenedMissionController,
	SelectedRow,
} from "../missions/opened-mission-controller"
import type { ThreadSearch } from "../navigation/thread-search"
import { hostOfSpaceRow } from "../spaces/joined-spaces-controller"

export type TabThreadSync = {
	tabs: WorkspaceTabs
	roster: RosterController
	selected: SelectedRow
	openedMission: OpenedMissionController
	openSpaceId: string | null
	isOpenSpaceRostered: boolean
}

type ThreadShowing = Pick<TabThreadSync, "roster" | "openedMission"> & {
	spaceId: string
}

export type ThreadHolder = {
	roster: Pick<RosterController, "getState">
	openedMission: Pick<OpenedMissionController, "getState">
}

const shownThreadOf = (
	{ selectedBotId, selectedConversationId }: SelectedRow,
	opened: OpenedMission | null,
): ThreadSearch => {
	const rowId = selectedBotId ?? selectedConversationId
	return {
		bot: selectedBotId ?? undefined,
		conversation: selectedConversationId ?? undefined,
		mission:
			opened !== null && opened.rowId === rowId ? opened.missionId : undefined,
	}
}

export const heldThreadOf = ({ roster, openedMission }: ThreadHolder) =>
	shownThreadOf(roster.getState(), openedMission.getState())

const selectRowOf = (roster: RosterController, thread: ThreadSearch) => {
	if (thread.bot) {
		roster.select(thread.bot)
		return
	}
	if (thread.conversation) {
		roster.selectConversation(thread.conversation)
		return
	}
	roster.showList()
}

const showThread = (
	thread: ThreadSearch,
	{ roster, openedMission, spaceId }: ThreadShowing,
) => {
	selectRowOf(roster, thread)
	const rowId = threadRowIdOf(thread)
	if (thread.mission === undefined || rowId === undefined) {
		if (openedMission.getState() !== null) {
			openedMission.leave()
		}
		return
	}
	if (openedMission.getState()?.missionId !== thread.mission) {
		openedMission.open({ missionId: thread.mission, rowId, spaceId })
	}
}

const presentRowIdsIn = (roster: RosterController) => {
	const { bots, conversations } = roster.getState()
	return new Set([...bots, ...conversations].map((row) => row.id))
}

export const useTabsFollowingSpace = (
	tabs: WorkspaceTabs,
	openSpaceId: string | null,
) => {
	useEffect(() => {
		if (openSpaceId !== null) {
			tabs.leaveAsked(() => tabs.showSpace(openSpaceId))
		}
	}, [tabs, openSpaceId])
}

export const useTabThreadSync = ({
	tabs,
	roster,
	selected,
	openedMission,
	openSpaceId,
	isOpenSpaceRostered,
}: TabThreadSync) => {
	const navigate = useNavigate()
	const { history } = tabs
	const shownHref = useSyncExternalStore(
		history.subscribe,
		() => history.location.href,
	)
	const shownSpaceId = useSyncExternalStore(
		tabs.subscribe,
		() => tabs.getState().spaceId,
	)
	const opened = useSyncExternalStore(
		openedMission.subscribe,
		openedMission.getState,
	)
	const readySpaceId =
		isOpenSpaceRostered && shownSpaceId === openSpaceId ? openSpaceId : null

	useTabsFollowingSpace(tabs, openSpaceId)

	const { selectedBotId, selectedConversationId } = selected
	const appliedHref = useRef<string | null>(null)
	useEffect(() => {
		if (readySpaceId === null) {
			appliedHref.current = null
			return
		}
		const present = presentRowIdsIn(roster)
		const hostOfReadySpace = hostOfSpaceRow(readySpaceId)
		void tabs.dropAbsentRestored(readySpaceId, {
			isRowPresent: (id) => present.has(id),
			readMission: (missionId) =>
				missionsTransport.detailOn(hostOfReadySpace, missionId),
		})
		if (history.location.href !== shownHref) {
			return
		}
		const page = pageOf(shownHref)
		if (!isListPage(page)) {
			appliedHref.current = shownHref
			return
		}
		if (shownHref !== appliedHref.current) {
			appliedHref.current = shownHref
			showThread(page.thread, { roster, openedMission, spaceId: readySpaceId })
			return
		}
		const renderedThread = shownThreadOf(
			{ selectedBotId, selectedConversationId },
			opened,
		)
		const isRenderStale = !sameThread(
			renderedThread,
			heldThreadOf({ roster, openedMission }),
		)
		if (!isRenderStale && !sameThread(renderedThread, page.thread)) {
			void navigate({ to: "/", search: renderedThread })
		}
	}, [
		tabs,
		history,
		navigate,
		roster,
		openedMission,
		readySpaceId,
		shownHref,
		selectedBotId,
		selectedConversationId,
		opened,
	])
}
