import type { NoticeMessage } from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import type {
	Mission,
	MissionChanged,
	MissionDetail,
	MissionOnBoard,
	MissionState,
} from "./mission-contract"
import { MISSION_RUN_OUTPUT_SCHEMA } from "./mission-run-output"
import {
	type MissionRunCall,
	type MissionRunCause,
	missionRunPromptFor,
} from "./mission-run-prompt"
import { createMissionSeqs } from "./mission-seqs"
import {
	isSummonedMissionState,
	missionSummonsFor,
	type SummonedMissionState,
} from "./mission-summons"
import { toMissionConversation } from "./mission-thread-model"

import type {
	RuntimeScope,
	ScopedEvent,
	TransportError,
	TurnEnded,
} from "../agent/contract"
import type { ChatController } from "../chat/chat-controller"
import { isSameRuntimeScope } from "../chat/chat-state"
import type { ChatDriver } from "../chat/driver"
import { needsFreshSession } from "../chat/screen-model"
import type { ConversationController } from "../conversations/conversation-controller"
import type { ConversationRuntimes } from "../conversations/conversation-runtimes"
import type { TranscriptStore } from "../conversations/store-port"
import { readRunReport } from "../routines/run-output"

export const MISSION_TRIGGER_SOURCE = "mission"

export const RUN_DEADLINE_MS = 30 * 60_000

type MissionRunUnsubscribe = () => void

type MissionRunPort = {
	board: () => Promise<Pick<MissionOnBoard, "mission">[]>
	unreported: () => Promise<Pick<MissionOnBoard, "mission">[]>
	reported: (missionId: string, turnId: string | null) => Promise<unknown>
	answered: (missionId: string, seq: number) => Promise<unknown>
	onChanged: (
		listener: (changed: MissionChanged) => void,
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
	reportFailure: (notice: NoticeMessage) => void
	joinedSpaceId: () => string | null
	watchJoinedSpace: (listener: () => void) => () => void
	now?: () => number
}

type LiveMissionRun = {
	call: MissionRunCall
	scope: RuntimeScope
	deadline: ReturnType<typeof setTimeout>
}

const CAUSE_OF_STATE: Partial<Record<MissionState, MissionRunCause>> = {
	done: "done",
	failed: "failed",
}

const STATUS_CAUSE: MissionRunCause = "status"

const isClosingRun = ({ call }: LiveMissionRun) => call.cause !== STATUS_CAUSE

const isTakenState = (state: MissionState) =>
	isSummonedMissionState(state) || Boolean(CAUSE_OF_STATE[state])

const detailOf = (thrown: unknown) =>
	thrown instanceof Error ? thrown.message : String(thrown)

const reporting = (command: string) => (reason: unknown) => {
	console.error(`mission run driver: ${command} failed`, reason)
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
	joinedSpaceId,
	watchJoinedSpace,
	now = () => Date.now(),
}: MissionRunDriverOptions): (() => void) => {
	const live = new Map<string, LiveMissionRun>()
	const kept = new Map<string, MissionChanged>()
	const missionIdOfThread = new Map<string, string>()
	const holding = new Set<string>()
	const seqs = createMissionSeqs()
	let isStopped = false

	const raiseFailure = (reason: unknown) => {
		console.error("mission run driver: the run failed", reason)
		reportFailure({
			title: i18n.t("chat:missions.failure.run.title"),
			description: i18n.t("chat:missions.failure.run.description"),
		})
	}

	const isBusy = (missionId: string) =>
		holding.has(missionId) || live.has(missionId)

	const shutdownSession = (scope: RuntimeScope) => {
		void driver.shutdown(scope).catch(reporting("agent_shutdown"))
	}

	const takeAgain = (missionId: string) => {
		if (live.has(missionId)) {
			return
		}

		const changed = kept.get(missionId)
		kept.delete(missionId)

		if (changed && !isStopped) {
			void consider(changed)
		}
	}

	const release = (held: LiveMissionRun) => {
		clearTimeout(held.deadline)
		live.delete(held.call.mission.id)
	}

	const forget = (held: LiveMissionRun) => {
		release(held)
		takeAgain(held.call.mission.id)
	}

	const end = (held: LiveMissionRun) => {
		forget(held)
		shutdownSession(held.scope)
	}

	const refuse = async (held: LiveMissionRun, reason: string) => {
		const { scope } = held
		forget(held)
		await driver.cancelTurn(scope).catch(reporting("agent_cancel_turn"))
		shutdownSession(scope)
		raiseFailure(reason)
	}

	const expire = async (missionId: string) => {
		const held = live.get(missionId)

		if (!held) {
			return
		}

		await refuse(held, "the mission run outlived its deadline")
	}

	const rosterBlockOf = async ({ mission }: MissionRunCall) => {
		try {
			return await missions.rosterBlock(
				mission.originConversationId,
				mission.botId,
			)
		} catch (thrown) {
			reporting("conversation_roster_block")(thrown)
			return null
		}
	}

	const openScope = async (call: MissionRunCall) => {
		const opened = await store.openRuntimeSession(
			call.mission.originConversationId,
			call.mission.botId,
			now(),
			null,
			null,
		)
		return {
			conversationId: opened.conversationId,
			botId: opened.botId,
			runtimeSessionId: opened.id,
			epoch: opened.seq,
		}
	}

	const begin = async (call: MissionRunCall) => {
		const { id } = call.mission
		try {
			const scope = await openScope(call)
			live.set(id, {
				call,
				scope,
				deadline: setTimeout(() => void expire(id), RUN_DEADLINE_MS),
			})
			await driver.startOrResumeSession(
				scope,
				undefined,
				undefined,
				MISSION_RUN_OUTPUT_SCHEMA,
			)
			await driver.submitPrompt(scope, missionRunPromptFor(call))
		} catch (thrown) {
			const held = live.get(id)
			if (held) {
				end(held)
			}
			throw new Error(`the mission run could not start: ${detailOf(thrown)}`)
		}
	}

	const readMission = async (missionId: string) => {
		try {
			return await missions.detail(missionId)
		} catch (thrown) {
			throw new Error(`the mission could not be read: ${detailOf(thrown)}`)
		}
	}

	const isOnJoinedSpace = () => joinedSpaceId() !== null

	const readBot = async (botId: string) => {
		if (isOnJoinedSpace()) {
			return null
		}
		try {
			const seated = (await store.bots()).find(({ id }) => id === botId)

			if (!seated) {
				throw new Error(`no bot answers ${botId}`)
			}

			return seated
		} catch (thrown) {
			throw new Error(`the mission bot could not be read: ${detailOf(thrown)}`)
		}
	}

	const carriesNoMessage = (thread: ConversationController) =>
		thread.getState().messages.length === 0

	const isSummonsDue = (
		state: SummonedMissionState,
		thread: ConversationController,
	) => state === "waiting_bot" || carriesNoMessage(thread)

	const summon = async (mission: Mission, state: SummonedMissionState) => {
		const bot = await readBot(mission.botId)
		if (!bot) {
			return false
		}
		const thread = runtimes.runtimeFor(mission.threadConversationId)
		await thread.open(toMissionConversation({ mission, bot }))

		if (isSummonsDue(state, thread)) {
			await thread.send(missionSummonsFor(state))
		}
		return true
	}

	const answerWhenAsked = async (mission: Mission) => {
		if (mission.state !== "waiting_bot") {
			return
		}

		try {
			await missions.answered(mission.id, mission.stateSeq)
		} catch (thrown) {
			raiseFailure(`the answer could not be recorded: ${detailOf(thrown)}`)
		}
	}

	const rememberThread = (mission: Mission) => {
		missionIdOfThread.set(mission.threadConversationId, mission.id)
	}

	const run = async (call: MissionRunCall) => {
		const rosterBlock = await rosterBlockOf(call)

		if (isOnJoinedSpace()) {
			return false
		}

		await begin({ ...call, rosterBlock })
		return true
	}

	const take = async ({
		mission,
		events,
	}: MissionDetail): Promise<MissionState | null> => {
		if (isSummonedMissionState(mission.state)) {
			if (!(await summon(mission, mission.state))) {
				return null
			}
			await answerWhenAsked(mission)
			return mission.state
		}

		const cause = CAUSE_OF_STATE[mission.state]

		if (!cause) {
			return null
		}

		return (await run({ cause, mission, events })) ? mission.state : null
	}

	const consider = async (changed: MissionChanged) => {
		if (isOnJoinedSpace()) {
			return
		}

		if (isBusy(changed.missionId)) {
			kept.set(changed.missionId, changed)
			return
		}

		if (seqs.handled(changed.missionId, changed.stateSeq)) {
			return
		}

		if (!isTakenState(changed.state)) {
			seqs.remember(changed.missionId, changed.stateSeq)
			return
		}

		holding.add(changed.missionId)
		try {
			const detail = await readMission(changed.missionId)
			rememberThread(detail.mission)

			if (await take(detail)) {
				seqs.remember(changed.missionId, detail.mission.stateSeq)
			}
		} catch (thrown) {
			raiseFailure(detailOf(thrown))
		} finally {
			holding.delete(changed.missionId)
			takeAgain(changed.missionId)
		}
	}

	const mainChatIdOf = (botId: string) =>
		store
			.mainChat(botId)
			.then(({ id }) => id)
			.catch((reason) => {
				reporting("conversation_main_chat")(reason)
				return null
			})

	const reporterOf = async (conversationId: string, botId: string) => {
		const mainChatId = await mainChatIdOf(botId)

		return mainChatId === conversationId
			? chat
			: runtimes.runtimeFor(conversationId)
	}

	const writeReport = async ({ call, scope }: LiveMissionRun, text: string) => {
		const { mission } = call
		const conversationId = mission.originConversationId
		const reporter = await reporterOf(conversationId, mission.botId)

		return reporter.reportRun({
			conversationId,
			botId: mission.botId,
			runtimeSessionId: scope.runtimeSessionId,
			text,
			routineTitle: mission.ticket.externalId,
			triggerSourceId: MISSION_TRIGGER_SOURCE,
		})
	}

	const readSettledMission = async (missionId: string) => {
		try {
			const { mission } = await readMission(missionId)
			return mission
		} catch (thrown) {
			raiseFailure(detailOf(thrown))
			return null
		}
	}

	const isClosed = (settled: Mission | null): settled is Mission =>
		settled !== null && settled.closedAt !== null

	const recordReport = async (
		missionId: string,
		reportedTurnId: string | null,
	) => {
		if (isOnJoinedSpace()) {
			return
		}

		try {
			await missions.reported(missionId, reportedTurnId)
		} catch (thrown) {
			raiseFailure(`the report could not be recorded: ${detailOf(thrown)}`)
		}
	}

	const recordWhenOwed = async (
		settled: Mission | null,
		reportedTurnId: string | null,
	) => {
		if (!isClosed(settled)) {
			return
		}

		await recordReport(settled.id, reportedTurnId)
	}

	const settleNothingReported = async (
		held: LiveMissionRun,
		settled: Mission | null,
	) => {
		if (!isClosingRun(held)) {
			return raiseFailure("the status mission run reported nothing")
		}

		if (!isClosed(settled)) {
			return
		}

		raiseFailure("the closing mission run reported nothing")
		await recordReport(settled.id, null)
	}

	const endOn = async (held: LiveMissionRun) => {
		const { id } = held.call.mission
		release(held)
		holding.add(id)
		shutdownSession(held.scope)

		const settled = isClosingRun(held) ? await readSettledMission(id) : null

		if (isClosed(settled)) {
			seqs.remember(settled.id, settled.stateSeq)
		}

		holding.delete(id)
		takeAgain(id)
		return settled
	}

	const settle = async (held: LiveMissionRun, ended: TurnEnded) => {
		const settled = await endOn(held)

		if (ended.outcome !== "completed") {
			return raiseFailure(`the mission run's turn was ${ended.outcome}`)
		}

		const report = readRunReport(ended.structuredOutput)

		if (!report) {
			raiseFailure("the mission run ended with no structured output")
			return recordWhenOwed(settled, null)
		}

		if (report.outcome === "nothing") {
			return settleNothingReported(held, settled)
		}

		if (isOnJoinedSpace()) {
			return
		}

		try {
			const reportedTurnId = await writeReport(held, report.text)
			await recordWhenOwed(settled, reportedTurnId)
		} catch (thrown) {
			raiseFailure(`the report could not be written: ${detailOf(thrown)}`)
		}
	}

	const fail = (held: LiveMissionRun, error: TransportError) => {
		if (!needsFreshSession(error)) {
			return
		}
		end(held)
		raiseFailure(`the mission run's session failed with ${error.kind}`)
	}

	const openStatusRun = async (threadConversationId: string) => {
		const missionId = missionIdOfThread.get(threadConversationId)

		if (
			missionId === undefined ||
			isStopped ||
			isOnJoinedSpace() ||
			isBusy(missionId)
		) {
			return
		}

		holding.add(missionId)
		try {
			const { mission, events } = await readMission(missionId)

			if (isClosed(mission)) {
				return
			}

			await run({ cause: STATUS_CAUSE, mission, events })
		} catch (thrown) {
			raiseFailure(detailOf(thrown))
		} finally {
			holding.delete(missionId)
			takeAgain(missionId)
		}
	}

	const runAt = (scope: RuntimeScope | null) =>
		[...live.values()].find((held) => isSameRuntimeScope(scope, held.scope))

	const route = ({ scope, event }: ScopedEvent) => {
		const held = runAt(scope)

		if (!held) {
			if (scope && event.type === "turnEnded") {
				void openStatusRun(scope.conversationId)
			}
			return
		}

		switch (event.type) {
			case "turnEnded":
				return void settle(held, event.ended)
			case "failed":
				return fail(held, event.error)
			case "questionRequested":
				return void refuse(held, "a mission run cannot be asked a question")
			case "permissionRequested":
				return void refuse(held, "a mission run cannot be asked a permission")
			default:
				return
		}
	}

	const startRunsFor = (caughtUp: Pick<MissionOnBoard, "mission">[]) => {
		if (isStopped) {
			return
		}

		for (const { mission } of caughtUp) {
			void consider({
				missionId: mission.id,
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
		}

		startRunsFor(onBoard.filter(({ mission }) => isTakenState(mission.state)))
	}

	const catchUpOnUnreportedMissions = async () => {
		startRunsFor(await missions.unreported())
	}

	const catchUp = () => {
		if (isOnJoinedSpace()) {
			return
		}

		void catchUpOnOpenMissions().catch((reason) => {
			console.error(
				"mission run driver: the open missions could not be read",
				reason,
			)
		})
		void catchUpOnUnreportedMissions().catch(reporting("mission_unreported"))
	}

	const interrupt = (held: LiveMissionRun) => {
		seqs.forget(held.call.mission.id)
		end(held)
	}

	let wasOnJoinedSpace = isOnJoinedSpace()

	const followJoinedSpace = () => {
		const isJoinedNow = isOnJoinedSpace()

		if (isJoinedNow === wasOnJoinedSpace) {
			return
		}

		wasOnJoinedSpace = isJoinedNow

		if (!isJoinedNow) {
			return catchUp()
		}

		for (const held of [...live.values()]) {
			interrupt(held)
		}
	}

	const changes = listening(
		missions.onChanged((changed) => void consider(changed)),
		"mission run driver: mission changes could not be listened to",
	)
	const events = listening(
		driver.subscribe(route),
		"mission run driver: agent events could not be listened to",
	)
	const stopWatchingJoinedSpace = watchJoinedSpace(followJoinedSpace)

	catchUp()

	return () => {
		isStopped = true
		stopWatchingJoinedSpace()

		for (const held of [...live.values()]) {
			end(held)
		}
		void changes.then((stop) => stop())
		void events.then((stop) => stop())
	}
}
