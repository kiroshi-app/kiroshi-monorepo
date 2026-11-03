import { describe, expect, it } from "vitest"

import type { NoticeMessage } from "@workspace/ui/components/notice-surface"

import { startReportRelay } from "./report-relay"
import { writeReportTurn } from "./run-report"

import type { ChatMessage, RuntimeScope } from "../agent/contract"
import { createConversationRuntimes } from "../conversations/conversation-runtimes"
import { createFakeTranscriptStore } from "../conversations/fake-transcript-store"
import {
	createScriptedDriver,
	type ScriptedDriver,
} from "../conversations/scripted-driver"
import type { Conversation } from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"
import { seatBots } from "../conversations/transcript-fixtures"

const SPACE = "personal"

const settled = async () => {
	for (let round = 0; round < 60; round += 1) {
		await Promise.resolve()
	}
}

const idOf = (conversation: Conversation, name: string) => {
	const seat = conversation.participants.find(
		(participant) => participant.name === name,
	)
	if (!seat) {
		throw new Error(`no seat for ${name}`)
	}
	return seat.botId
}

type Relaying = {
	driver: ScriptedDriver
	store: TranscriptStore
	conversation: Conversation
	notices: NoticeMessage[]
	relayed: RuntimeScope[]
	announce: (scope: RuntimeScope, text: string) => Promise<void>
	reload: () => Promise<void>
}

const createRelaying = async (
	store: TranscriptStore = createFakeTranscriptStore(),
): Promise<Relaying> => {
	const driver = createScriptedDriver()
	const bots = await seatBots(store, SPACE, ["Ada", "Nyx"])
	const conversation = await store.createConversation({
		spaceId: SPACE,
		sectionId: null,
		title: "Walls",
		botIds: bots.map((bot) => bot.id),
	})
	const notices: NoticeMessage[] = []
	const relayed: RuntimeScope[] = []
	const runtimes = createConversationRuntimes(driver, store)
	const countingRuntimes = {
		runtimeFor: (conversationId: string) => {
			const runtime = runtimes.runtimeFor(conversationId)
			return {
				...runtime,
				relayRunReport: (scope: RuntimeScope, message: ChatMessage) => {
					relayed.push(scope)
					return runtime.relayRunReport(scope, message)
				},
			}
		},
	}
	const start = () =>
		startReportRelay({
			driver,
			store,
			runtimes: countingRuntimes,
			reportFailure: (notice) => {
				notices.push(notice)
			},
		})
	let stop = start()
	await settled()

	const reload = async () => {
		stop()
		await settled()
		stop = start()
		await settled()
	}

	const announce = async (scope: RuntimeScope, text: string) => {
		const reported = await writeReportTurn({
			store,
			draft: { ...scope, text },
			newId: () => crypto.randomUUID(),
			now: () => 1,
		})
		driver.emit(scope, {
			type: "messageCompleted",
			message: {
				id: reported.id,
				role: "assistant",
				text,
				completion: "complete",
				timestamp: reported.createdAt,
			},
		})
		await settled()
	}

	return { driver, store, conversation, notices, relayed, announce, reload }
}

const runScopeOf = (conversationId: string, botId: string): RuntimeScope => ({
	conversationId,
	botId,
	runtimeSessionId: "rs-run",
	epoch: 1,
})

const endRun = (
	driver: ScriptedDriver,
	scope: RuntimeScope,
	hostId: string | null = null,
) =>
	driver.emit(
		scope,
		{
			type: "turnEnded",
			ended: {
				sessionId: "session",
				outcome: "completed",
				structuredOutput: { outcome: "report", report: "Walls are up." },
			},
		},
		hostId,
	)

const completeReport = (
	driver: ScriptedDriver,
	scope: RuntimeScope,
	hostId: string | null = null,
) =>
	driver.emit(
		scope,
		{
			type: "messageCompleted",
			message: {
				id: "foreign-report",
				role: "assistant",
				text: "Walls are up.",
				completion: "complete",
				timestamp: 1,
			},
		},
		hostId,
	)

const JOINED_HOST = "http://192.168.1.20:45367"

describe("a routine run report announced by the host", () => {
	it("summons the seated companion the report names", async () => {
		const { driver, conversation, announce } = await createRelaying()
		const ada = idOf(conversation, "Ada")
		const nyx = idOf(conversation, "Nyx")
		const scope = runScopeOf(conversation.id, ada)

		endRun(driver, scope)
		await announce(scope, `Walls are up. <@${nyx}>, read it.`)

		expect(driver.submissions.map(({ scope }) => scope.botId)).toEqual([nyx])
	})

	it("summons the companion the report names under a turn the store holds", async () => {
		const base = createFakeTranscriptStore()
		const startedTurnIds: string[] = []
		const { driver, conversation, announce } = await createRelaying({
			...base,
			startTurn: (turn) => {
				startedTurnIds.push(turn.id)
				return base.startTurn(turn)
			},
		})
		const ada = idOf(conversation, "Ada")
		const nyx = idOf(conversation, "Nyx")
		const scope = runScopeOf(conversation.id, ada)

		endRun(driver, scope)
		await announce(scope, `Walls are up. <@${nyx}>, read it.`)

		const [summons] = driver.submissions
		expect(startedTurnIds).toContain(summons.turn?.turnId)
	})

	it("summons once per ended run", async () => {
		const { driver, conversation, announce } = await createRelaying()
		const ada = idOf(conversation, "Ada")
		const nyx = idOf(conversation, "Nyx")
		const scope = runScopeOf(conversation.id, ada)

		endRun(driver, scope)
		await announce(scope, `Walls are up. <@${nyx}>, read it.`)
		await announce(scope, `Walls are up. <@${nyx}>, read it.`)

		expect(driver.submissions).toHaveLength(1)
	})

	it("summons nobody for a message no run ended before", async () => {
		const { driver, conversation, announce } = await createRelaying()
		const ada = idOf(conversation, "Ada")
		const nyx = idOf(conversation, "Nyx")

		await announce(
			runScopeOf(conversation.id, ada),
			`Walls are up. <@${nyx}>, read it.`,
		)

		expect(driver.submissions).toHaveLength(0)
	})

	it("summons nobody when the report names no seated companion", async () => {
		const { driver, conversation, announce } = await createRelaying()
		const scope = runScopeOf(conversation.id, idOf(conversation, "Ada"))

		endRun(driver, scope)
		await announce(scope, "Walls are up.")

		expect(driver.submissions).toHaveLength(0)
	})

	it("summons nobody for a report in a companion's main chat", async () => {
		const { driver, store, conversation, announce } = await createRelaying()
		const ada = idOf(conversation, "Ada")
		const nyx = idOf(conversation, "Nyx")
		const mainChat = await store.mainChat(ada)
		const scope = runScopeOf(mainChat.id, ada)

		endRun(driver, scope)
		await announce(scope, `Walls are up. <@${nyx}>, read it.`)

		expect(driver.submissions).toHaveLength(0)
	})

	it("raises a notice when the seating of the conversation cannot be read", async () => {
		const base = createFakeTranscriptStore()
		const { driver, conversation, notices, announce } = await createRelaying({
			...base,
			spaces: () => Promise.reject(new Error("refused")),
		})
		const ada = idOf(conversation, "Ada")
		const nyx = idOf(conversation, "Nyx")
		const scope = runScopeOf(conversation.id, ada)

		endRun(driver, scope)
		await announce(scope, `Walls are up. <@${nyx}>, read it.`)

		expect(notices).toHaveLength(1)
		expect(driver.submissions).toHaveLength(0)
	})

	it("relays nothing and raises nothing for a report of an agent a joined host holds", async () => {
		const { driver, notices, relayed } = await createRelaying()
		const scope = runScopeOf("conversation-on-the-host", "agent-on-the-host")

		endRun(driver, scope, JOINED_HOST)
		completeReport(driver, scope, JOINED_HOST)
		await settled()

		expect(relayed).toHaveLength(0)
		expect(driver.submissions).toHaveLength(0)
		expect(notices).toHaveLength(0)
	})

	it("relays nothing and raises nothing when the host answers that it does not know the agent", async () => {
		const base = createFakeTranscriptStore()
		const { driver, conversation, notices, relayed, announce } =
			await createRelaying({
				...base,
				mainChat: () => Promise.reject({ kind: "unknownBot", id: "gone" }),
			})
		const ada = idOf(conversation, "Ada")
		const nyx = idOf(conversation, "Nyx")
		const scope = runScopeOf(conversation.id, ada)

		endRun(driver, scope)
		await announce(scope, `Walls are up. <@${nyx}>, read it.`)

		expect(relayed).toHaveLength(0)
		expect(notices).toHaveLength(0)
	})

	it("relays a report once across a reload of the window", async () => {
		const { driver, conversation, relayed, announce, reload } =
			await createRelaying()
		const ada = idOf(conversation, "Ada")
		const nyx = idOf(conversation, "Nyx")
		const scope = runScopeOf(conversation.id, ada)

		endRun(driver, scope)
		await announce(scope, `Walls are up. <@${nyx}>, read it.`)
		await reload()
		completeReport(driver, scope)
		await settled()

		expect(relayed).toHaveLength(1)
		expect(driver.submissions).toHaveLength(1)
	})
})
