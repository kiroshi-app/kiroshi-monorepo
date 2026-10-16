import type {
	MissionChanged,
	MissionDetail,
	MissionOnBoard,
} from "./mission-contract"
import { createMissionRunBegin } from "./mission-run-begin"
import { createMissionRunBook, reporting } from "./mission-run-book"
import type { ReportMissionRunFailure } from "./mission-run-failure"
import { createMissionReportWriter } from "./mission-run-report"
import { createMissionRunRoute } from "./mission-run-route"
import { createMissionRunSettle } from "./mission-run-settle"
import { createMissionRunTake, isTakenState } from "./mission-run-take"

import type { ChatController } from "../chat/chat-controller"
import type { ChatDriver } from "../chat/driver"
import type { ConversationRuntimes } from "../conversations/conversation-runtimes"
import type { TranscriptStore } from "../conversations/store-port"

export { RUN_DEADLINE_MS } from "./mission-run-begin"
export { MISSION_TRIGGER_SOURCE } from "./mission-run-report"

type MissionRunUnsubscribe = () => void

type MissionRunPort = {
	board: () => Promise<Pick<MissionOnBoard, "mission">[]>
	unreported: () => Promise<Pick<MissionOnBoard, "mission">[]>
	reported: (missionId: string, turnId: string | null) => Promise<unknown>
	answered: (missionId: string, seq: number) => Promise<unknown>
	onChanged: (
		listener: (changed: MissionChanged, hostId?: string | null) => void,
	) => Promise<MissionRunUnsubscribe>
	detail: (missionId: string) => Promise<MissionDetail>
	rosterBlock: (conversationId: string, botId: string) => Promise<string | null>
}

export type MissionRunDriverOptions = {
	driver: Pick<
		ChatDriver,
		| "startOrResumeSession"
		| "submitPrompt"
		| "cancelTurn"
		| "shutdown"
		| "subscribe"
	>
	store: Pick<TranscriptStore, "openRuntimeSession" | "mainChat" | "bots">
	runtimes: Pick<ConversationRuntimes, "runtimeFor">
	chat: Pick<ChatController, "reportRun">
	missions: MissionRunPort
	reportFailure: ReportMissionRunFailure
	now?: () => number
}

const onlyFromLocalHost =
	<Heard>(handle: (heard: Heard) => void) =>
	(heard: Heard, hostId?: string | null) => {
		if (!hostId) {
			handle(heard)
		}
	}

const listening = (
	opening: Promise<MissionRunUnsubscribe>,
	label: string,
): Promise<MissionRunUnsubscribe> =>
	opening.catch((reason) => {
		console.error(label, reason)
		return () => undefined
	})

export const startMissionRunDriver = ({
	driver,
	store,
	runtimes,
	chat,
	missions,
	reportFailure,
	now = () => Date.now(),
}: MissionRunDriverOptions): (() => void) => {
	const book = createMissionRunBook({
		driver,
		missions,
		reportFailure,
		retake: (changed) => void consider(changed),
	})
	const { live, rememberSpace, rememberThread, end } = book
	const run = createMissionRunBegin({ driver, store, missions, book, now })
	const consider = createMissionRunTake({
		store,
		runtimes,
		missions,
		book,
		run,
	})
	const writeReport = createMissionReportWriter({ store, chat, runtimes })
	const settle = createMissionRunSettle({ missions, book, writeReport })
	const route = createMissionRunRoute({ book, run, settle })

	const startRunsFor = (caughtUp: Pick<MissionOnBoard, "mission">[]) => {
		if (book.isStopped()) {
			return
		}

		for (const { mission } of caughtUp) {
			void consider({
				missionId: mission.id,
				spaceId: mission.spaceId,
				state: mission.state,
				stateSeq: mission.stateSeq,
				isAgentRunning: mission.isAgentRunning,
				lastActivityAt: mission.lastActivityAt,
			})
		}
	}

	const catchUpOnOpenMissions = async () => {
		const onBoard = await missions.board()

		for (const { mission } of onBoard) {
			rememberThread(mission)
			rememberSpace({ missionId: mission.id, spaceId: mission.spaceId })
		}

		startRunsFor(onBoard.filter(({ mission }) => isTakenState(mission.state)))
	}

	const catchUpOnUnreportedMissions = async () => {
		startRunsFor(await missions.unreported())
	}

	const catchUp = () => {
		void catchUpOnOpenMissions().catch((reason) => {
			console.error(
				"mission run driver: the open missions could not be read",
				reason,
			)
		})
		void catchUpOnUnreportedMissions().catch(reporting("mission_unreported"))
	}

	const changes = listening(
		missions.onChanged(onlyFromLocalHost((changed) => void consider(changed))),
		"mission run driver: mission changes could not be listened to",
	)
	const events = listening(
		driver.subscribe(onlyFromLocalHost(route)),
		"mission run driver: agent events could not be listened to",
	)

	catchUp()

	return () => {
		book.stop()

		for (const held of [...live.values()]) {
			end(held)
		}
		void changes.then((stop) => stop())
		void events.then((stop) => stop())
	}
}
