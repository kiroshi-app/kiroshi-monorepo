import type { AppSidebarConversation } from "@workspace/ui/components/app-sidebar"
import type { MissionCardModel } from "@workspace/ui/components/mission"
import type { RosterBot } from "@workspace/ui/components/roster"
import type { TurnCause } from "@workspace/ui/components/turn"

import { ROUTINE_TRIGGER_SOURCE, SCENE_COPY } from "./copy"
import {
	ASH,
	IVY,
	JUNO,
	MOCHI,
	MOVE,
	OLIVE,
	PIP,
	SABLE,
	sceneMission,
	TOMO,
	TRIAGE,
	WREN,
} from "./scene-cast"

type SceneTurn =
	| { kind: "reader"; text: string }
	| {
			kind: "bot"
			bot: RosterBot
			text: string
			cause?: TurnCause
			note?: string
	  }
	| { kind: "mission"; mission: MissionCardModel }

type SceneExchange = {
	bot?: RosterBot
	conversation?: AppSidebarConversation
	turns: SceneTurn[]
}

const asks = (text: string): SceneTurn => ({ kind: "reader", text })

const says = (bot: RosterBot, text: string, note?: string): SceneTurn => ({
	kind: "bot",
	bot,
	text,
	note,
})

const reports = (bot: RosterBot, text: string, title: string): SceneTurn => ({
	kind: "bot",
	bot,
	text,
	cause: { routineTitle: title, triggerSourceId: ROUTINE_TRIGGER_SOURCE },
})

const opens = (mission: MissionCardModel): SceneTurn => ({
	kind: "mission",
	mission,
})

const COPY = SCENE_COPY.exchanges

const EXCHANGES: Record<string, SceneExchange> = {
	[MOCHI.id]: {
		bot: MOCHI,
		turns: [
			asks(COPY.mochi.ask),
			says(MOCHI, COPY.mochi.answer),
			says(TOMO, COPY.mochi.handoff),
		],
	},
	[OLIVE.id]: {
		bot: OLIVE,
		turns: [
			asks(COPY.olive.ask),
			says(OLIVE, COPY.olive.answer, COPY.olive.note),
		],
	},
	[PIP.id]: {
		bot: PIP,
		turns: [
			reports(PIP, COPY.pip.report, COPY.pip.cause),
			asks(COPY.pip.ask),
			says(PIP, COPY.pip.answer),
		],
	},
	[TOMO.id]: {
		bot: TOMO,
		turns: [
			asks(COPY.tomo.ask),
			opens(
				sceneMission({
					bot: TOMO,
					objective: COPY.tomo.missionObjective,
					externalId: COPY.tomo.missionTicket,
					ticketTitle: COPY.tomo.missionTicketTitle,
					tools: ["Superset"],
					timestamp: COPY.tomo.missionTimestamp,
				}),
			),
			says(TOMO, COPY.tomo.answer),
		],
	},
	[ASH.id]: {
		bot: ASH,
		turns: [asks(COPY.ash.ask), says(ASH, COPY.ash.answer)],
	},
	[MOVE.id]: {
		conversation: MOVE,
		turns: [says(MOCHI, COPY.move.answer)],
	},
	[WREN.id]: {
		bot: WREN,
		turns: [
			asks(COPY.wren.ask),
			opens(
				sceneMission({
					bot: WREN,
					objective: COPY.wren.missionObjective,
					externalId: COPY.wren.missionTicket,
					ticketTitle: COPY.wren.missionTicketTitle,
					tools: ["GitHub"],
					timestamp: COPY.wren.missionTimestamp,
				}),
			),
			says(WREN, COPY.wren.answer),
		],
	},
	[IVY.id]: {
		bot: IVY,
		turns: [
			asks(COPY.ivy.ask),
			says(IVY, COPY.ivy.answer),
			says(SABLE, COPY.ivy.handoff),
		],
	},
	[SABLE.id]: {
		bot: SABLE,
		turns: [
			asks(COPY.sable.ask),
			says(SABLE, COPY.sable.answer, COPY.sable.note),
		],
	},
	[JUNO.id]: {
		bot: JUNO,
		turns: [
			reports(JUNO, COPY.juno.report, COPY.juno.cause),
			asks(COPY.juno.ask),
			says(JUNO, COPY.juno.answer),
		],
	},
	[TRIAGE.id]: {
		conversation: TRIAGE,
		turns: [says(IVY, COPY.triage.answer)],
	},
}

const exchangeOf = (id: string): SceneExchange | undefined => EXCHANGES[id]

export { exchangeOf, type SceneTurn }
