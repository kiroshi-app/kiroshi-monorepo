import { useMemo } from "react"

import type { MissionState } from "@workspace/ui/components/mission"
import type { MissionCardWrap } from "@workspace/ui/components/mission-card"
import {
	MissionMenu,
	type MissionMenuTrigger,
} from "@workspace/ui/components/mission-menu"
import type { MissionsPageRowWrap } from "@workspace/ui/components/missions-page"

import type { ConversationController } from "@/lib/conversations/conversation-controller"
import { openInBrowser } from "@/lib/links/use-external-links"
import {
	type MissionActionsPort,
	missionActionsOf,
	type OpenMission,
} from "@/lib/missions/mission-actions"
import type { Mission } from "@/lib/missions/mission-contract"
import { missionsTransport } from "@/lib/missions/missions-transport"

type StoppableThread = Pick<ConversationController, "stop">

export type StoppableRuntimes = {
	heldFor: (conversationId: string) => StoppableThread | null
}

type MissionCardMenusInput = {
	missions: Mission[]
	runtimes: StoppableRuntimes
	onOpenMission: OpenMission
	onChanged: () => void
}

type MissionMenus = {
	wrapCard: MissionCardWrap
	wrapPageRow: MissionsPageRowWrap
}

const writeClipboard = (text: string) => navigator.clipboard.writeText(text)

export const useMissionMenus = ({
	missions,
	runtimes,
	onOpenMission,
	onChanged,
}: MissionCardMenusInput): MissionMenus =>
	useMemo(() => {
		const missionById = new Map(
			missions.map((mission) => [mission.id, mission]),
		)
		const port: MissionActionsPort = {
			openMission: onOpenMission,
			openInBrowser,
			writeClipboard,
			stopThread: async (conversationId) => {
				await runtimes.heldFor(conversationId)?.stop()
			},
			close: missionsTransport.close,
			reopen: missionsTransport.reopen,
			onChanged,
		}

		const menuOn = (
			missionId: string,
			state: MissionState,
			trigger: MissionMenuTrigger,
		) => {
			const mission = missionById.get(missionId)
			if (!mission) {
				return trigger
			}

			return (
				<MissionMenu
					{...missionActionsOf(mission, port)}
					hasBranch={mission.branch !== null}
					hasPullRequest={mission.pullRequestUrl !== null}
					hasWorkspacePath={mission.workspacePath !== null}
					state={state}
				>
					{trigger}
				</MissionMenu>
			)
		}

		return {
			wrapCard: (card) => menuOn(card.props.id, card.props.state, card),
			wrapPageRow: (row) =>
				menuOn(row.props.mission.id, row.props.mission.state, row),
		}
	}, [missions, runtimes, onOpenMission, onChanged])

export const useMissionCardMenus = (
	input: MissionCardMenusInput,
): MissionCardWrap => useMissionMenus(input).wrapCard
