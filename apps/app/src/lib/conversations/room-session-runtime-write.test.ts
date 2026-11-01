import { expect, it } from "vitest"

import { createConversationRuntimes } from "./conversation-runtimes"
import { withFakeHostWrites } from "./fake-host-writes"
import { createFakeTranscriptStore } from "./fake-transcript-store"
import { createScriptedDriver } from "./scripted-driver"
import type { Bot } from "./store-contract"
import type { TranscriptStore } from "./store-port"
import { botIdentity, seatBots } from "./transcript-fixtures"

import { createQueue } from "../queue"
import { createWriteLoop } from "../write-loop"
import type { ChatDriver } from "../chat/driver"
import { withSettledSettings } from "../chat/with-settled-settings"

const SPACE = "personal"

type OpenedRuntime = Partial<Pick<Bot, "model" | "effort">>

const settled = async () => {
	for (let round = 0; round < 20; round += 1) {
		await Promise.resolve()
	}
}

it("opens a room speaker's session only once the runtime write picked for it lands, on the picked model and effort", async () => {
	const store = createFakeTranscriptStore()
	const [ada] = await seatBots(store, SPACE, ["Ada"])
	const room = await store.createConversation({
		spaceId: SPACE,
		sectionId: null,
		title: "Walls",
		botIds: [ada.id],
	})
	const landing = Promise.withResolvers<void>()
	const pickedWrite = landing.promise.then(() =>
		store.updateBot(
			ada.id,
			botIdentity({ name: "Ada", model: "sonnet", effort: "high" }),
		),
	)
	const settingsSettled = async () => {
		await pickedWrite
	}
	const opened: OpenedRuntime[] = []
	const scripted = createScriptedDriver()
	const recording: ChatDriver = {
		...scripted,
		startOrResumeSession: async (scope, ...opening) => {
			const bots = await store.bots(SPACE)
			const bot = bots.find(({ id }) => id === scope.botId)
			opened.push({ model: bot?.model, effort: bot?.effort })
			return scripted.startOrResumeSession(scope, ...opening)
		},
	}
	const runtimes = createConversationRuntimes(
		withSettledSettings(withFakeHostWrites(recording, store), settingsSettled),
		store,
	)
	const runtime = runtimes.runtimeFor(room.id)
	runtime.subscribe(() => undefined)
	await runtime.open(room)

	await runtime.send("which model answers now")
	await settled()

	expect(opened).toEqual([])

	landing.resolve()
	await settled()

	expect(opened).toEqual([{ model: "sonnet", effort: "high" }])
})

it("opens a room speaker's session once on the stored model and effort when the runtime write picked for it is refused", async () => {
	const base = createFakeTranscriptStore()
	const store: TranscriptStore = {
		...base,
		updateBot: () => Promise.reject({ kind: "storage" }),
	}
	const [ada] = await seatBots(store, SPACE, ["Ada"])
	const room = await store.createConversation({
		spaceId: SPACE,
		sectionId: null,
		title: "Walls",
		botIds: [ada.id],
	})
	const landing = Promise.withResolvers<void>()
	const refusals: string[] = []
	const writes = createWriteLoop<OpenedRuntime, Bot>({
		enqueue: createQueue(),
		write: async (id, picked) => {
			await landing.promise
			return store.updateBot(id, botIdentity({ name: "Ada", ...picked }))
		},
		apply: () => undefined,
		onRefused: (id) => {
			refusals.push(id)
		},
	})
	writes.push(ada.id, { model: "sonnet", effort: "high" })
	const opened: OpenedRuntime[] = []
	const scripted = createScriptedDriver()
	const recording: ChatDriver = {
		...scripted,
		startOrResumeSession: async (scope, ...opening) => {
			const bots = await store.bots(SPACE)
			const bot = bots.find(({ id }) => id === scope.botId)
			opened.push({ model: bot?.model, effort: bot?.effort })
			return scripted.startOrResumeSession(scope, ...opening)
		},
	}
	const runtimes = createConversationRuntimes(
		withSettledSettings(withFakeHostWrites(recording, store), writes.settled),
		store,
	)
	const runtime = runtimes.runtimeFor(room.id)
	runtime.subscribe(() => undefined)
	await runtime.open(room)

	const sending = runtime.send("which model answers now")
	await settled()

	expect(opened).toEqual([])

	landing.resolve()
	await sending
	await settled()

	expect(refusals).toEqual([ada.id])
	expect(opened).toEqual([{ model: "opus", effort: null }])
	expect(scripted.submissions.map(({ scope }) => scope.botId)).toEqual([ada.id])
})
