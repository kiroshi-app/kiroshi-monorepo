import { readBotPermissionMode } from "@workspace/ui/components/bot-settings"

import { type MissionRunBook, reporting } from "./mission-run-book"
import type { MissionRunDriverOptions } from "./mission-run-driver"
import { MISSION_RUN_OUTPUT_SCHEMA } from "./mission-run-output"
import { type MissionRunCall, missionRunPromptFor } from "./mission-run-prompt"

import type {
	UnattendedPermissionMode,
	UnattendedStart,
} from "../agent/contract"

export const RUN_DEADLINE_MS = 30 * 60_000

const MODES_THAT_NEVER_PROMPT: UnattendedPermissionMode[] = ["auto", "dontAsk"]

const unattendedStartIn = (declaredMode: string): UnattendedStart => ({
	deniedTools: ["AskUserQuestion"],
	permissionMode:
		MODES_THAT_NEVER_PROMPT.find(
			(mode) => mode === readBotPermissionMode(declaredMode),
		) ?? "dontAsk",
})

const PROMPTLESS_START = unattendedStartIn("dontAsk")

const failedStart = (thrown: unknown) =>
	new Error("the mission run could not start", { cause: thrown })

const logAlreadyRunning = (missionId: string) => {
	console.info(
		`mission run driver: another window runs the mission | mission: ${missionId}`,
	)
}

type MissionRunBeginOptions = Pick<
	MissionRunDriverOptions,
	"driver" | "store" | "missions"
> & {
	book: MissionRunBook
	now: () => number
}

export const createMissionRunBegin = ({
	driver,
	store,
	missions,
	book,
	now,
}: MissionRunBeginOptions) => {
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

	const unattendedStartOf = async ({ mission }: MissionRunCall) => {
		try {
			const bot = (await store.bots()).find(({ id }) => id === mission.botId)
			return bot
				? unattendedStartIn(bot.permissions.defaultMode)
				: PROMPTLESS_START
		} catch (thrown) {
			reporting("bots")(thrown)
			return PROMPTLESS_START
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

	const claimRun = async (missionId: string) => {
		try {
			return await missions.claimRun(missionId)
		} catch (thrown) {
			throw new Error("the mission run could not be claimed", {
				cause: thrown,
			})
		}
	}

	const tokenOf = async (missionId: string) => {
		const claim = await claimRun(missionId)

		if (claim.kind === "claimed") {
			return claim.token
		}

		logAlreadyRunning(missionId)
		return null
	}

	const openClaimedScope = async (call: MissionRunCall, token: string) => {
		try {
			return await openScope(call)
		} catch (thrown) {
			void book.releaseClaim(call.mission.id, token)
			throw failedStart(thrown)
		}
	}

	const begin = async (
		call: MissionRunCall,
		token: string,
		unattended: UnattendedStart,
	) => {
		const { id } = call.mission
		const scope = await openClaimedScope(call, token)
		const held = {
			call,
			scope,
			token,
			deadline: setTimeout(() => void book.expire(id), RUN_DEADLINE_MS),
		}
		book.live.set(id, held)

		if (book.isStopped()) {
			return book.end(held)
		}

		try {
			await driver.startOrResumeSession(
				scope,
				undefined,
				undefined,
				MISSION_RUN_OUTPUT_SCHEMA,
				unattended,
			)
			await driver.submitPrompt(scope, missionRunPromptFor(call))
		} catch (thrown) {
			if (book.live.get(id) === held) {
				book.end(held)
			}
			throw failedStart(thrown)
		}
	}

	return async (call: MissionRunCall) => {
		const token = await tokenOf(call.mission.id)

		if (token === null) {
			return
		}

		const [rosterBlock, unattended] = await Promise.all([
			rosterBlockOf(call),
			unattendedStartOf(call),
		])
		await begin({ ...call, rosterBlock }, token, unattended)
	}
}
