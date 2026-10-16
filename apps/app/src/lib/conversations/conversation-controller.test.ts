import { beforeEach, describe, expect, it, vi } from "vitest"

import {
	type ConversationController,
	createConversationController,
} from "./conversation-controller"
import { withFakeHostWrites } from "./fake-host-writes"
import { createFakeTranscriptStore } from "./fake-transcript-store"
import {
	createScriptedDriver,
	type ScriptedDriver,
	spoke,
} from "./scripted-driver"
import type { Conversation } from "./store-contract"
import type { TranscriptStore } from "./store-port"
import {
	type CompanionArrival,
	TRANSCRIPT_PAGE_SIZE,
	TRANSCRIPT_WINDOW_SIZE,
} from "./transcript-contract"
import { message, seatBots } from "./transcript-fixtures"

import type {
	ActivityStatus,
	AgentEvent,
	ConversationNaming,
	TransportError,
} from "../agent/contract"
import type { ChatDriver } from "../chat/driver"
import { attachmentBlock } from "../chat/message-attachments"
import type { ReportedRun } from "../routines/routine-contract"

const SPACE = "personal"

const SERVER_ENV_REJECTED: TransportError = {
	kind: "serverEnvRejected",
	detail: "PROJECT_TOKEN is undefined",
}

const SAID_NOTHING: AgentEvent[] = [
	{
		type: "messageStarted",
		message: {
			id: "msg-silent",
			role: "assistant",
			text: "",
			completion: "streaming",
			timestamp: 1,
		},
	},
	{ type: "turnEnded", ended: { sessionId: null, outcome: "completed" } },
]

const ATTACHMENT_BLOCK = `\n${attachmentBlock(
	["/root/attachments/c-1/0b7c6d1e-2f3a-4b5c-8d9e-0f1a2b3c4d5e.png"],
	new Date(0),
)}`

const TURN_ENDED: AgentEvent = {
	type: "turnEnded",
	ended: { sessionId: null, outcome: "completed" },
}

const completedAs = (id: string, text: string): AgentEvent => ({
	type: "messageCompleted",
	message: {
		id,
		role: "assistant",
		text,
		completion: "complete",
		timestamp: 1,
	},
})

type Harness = {
	driver: ScriptedDriver
	contexts: [string, string][]
	store: TranscriptStore
	controller: ConversationController
	conversation: Conversation
	named: [string, ConversationNaming][]
	detach: () => void
	settled: () => Promise<void>
	refuseNextWrite: () => void
}

const settled = async () => {
	for (let round = 0; round < 20; round += 1) {
		await Promise.resolve()
	}
}

type Naming = {
	title: string
	namingFor: () => Promise<ConversationNaming | null>
}

const createHarness = async (
	names: string[],
	naming?: Partial<Naming>,
): Promise<Harness> => {
	const scripted = createScriptedDriver()
	const driver: ScriptedDriver = naming?.namingFor
		? { ...scripted, namingFor: naming.namingFor }
		: scripted
	const contexts: [string, string][] = []
	const base = createFakeTranscriptStore()
	let isRefusingNextWrite = false
	const store: TranscriptStore = {
		...base,
		sendUserMessage: (message, summoned) => {
			if (!isRefusingNextWrite) {
				return base.sendUserMessage(message, summoned)
			}
			isRefusingNextWrite = false
			return Promise.reject(new Error("refused"))
		},
		boundedContext: (
			conversationId,
			botId,
			runtimeSessionId,
			promptMessageId,
		) => {
			contexts.push([botId, promptMessageId])
			return base.boundedContext(
				conversationId,
				botId,
				runtimeSessionId,
				promptMessageId,
			)
		},
	}
	const refuseNextWrite = () => {
		isRefusingNextWrite = true
	}
	const bots = await seatBots(store, SPACE, names)
	const conversation = await store.createConversation({
		spaceId: SPACE,
		sectionId: null,
		title: naming?.title ?? "Walls",
		botIds: bots.map((bot) => bot.id),
	})
	const named: [string, ConversationNaming][] = []
	let minted = 0
	const controller = createConversationController(
		withFakeHostWrites(driver, store),
		store,
		{
			newId: () => {
				minted += 1
				return `id-${minted}`
			},
			now: () => minted,
			onNamed: (conversationId, naming) => named.push([conversationId, naming]),
		},
	)
	const detach = controller.attach()
	await controller.open(conversation)
	await settled()
	return {
		driver,
		contexts,
		store,
		controller,
		conversation,
		named,
		detach,
		settled,
		refuseNextWrite,
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

const refusingStore = (): TranscriptStore => ({
	...createFakeTranscriptStore(),
	pinMessage: () => Promise.reject(new Error("refused")),
})

const saidIn = async (harness: Harness) => {
	await harness.controller.send("and now?")
	await harness.settled()
	return harness.controller.getState().messages[0]
}

const spokenIn = (controller: ConversationController) =>
	controller
		.getState()
		.messages.map((message) => [message.authorBotId, message.content])

const runningIn = (controller: ConversationController) =>
	controller.getState().speakers.map(({ botId }) => botId)

const unpublishedIn = (controller: ConversationController) =>
	controller
		.getState()
		.speakers.filter(({ hasPublished }) => !hasPublished)
		.map(({ botId }) => botId)

const workIn = (controller: ConversationController) =>
	controller.getState().speakers[0]?.work ?? null

const submittedIn = ({ driver }: Pick<Harness, "driver">) =>
	driver.submissions.map(({ scope }) => scope.botId)

describe("createConversationController", () => {
	let harness: Harness

	beforeEach(async () => {
		harness = await createHarness(["Ada", "Nyx", "Iris"])
	})

	it("answers with the companion holding the lead when a message names nobody", async () => {
		await harness.controller.send("and now?")
		await harness.settled()

		expect(harness.driver.submissions).toHaveLength(1)
		expect(harness.driver.submissions[0].scope.botId).toBe(
			idOf(harness.conversation, "Ada"),
		)
	})

	it("stores the message carrying the tokens of the companions named", async () => {
		await harness.controller.send("@Nyx take the walls")
		await harness.settled()

		const nyx = idOf(harness.conversation, "Nyx")
		expect(spokenIn(harness.controller)).toContainEqual([
			null,
			`<@${nyx}> take the walls`,
		])
	})

	it("stores on the message sent the identifier of the message it answers", async () => {
		const said = await saidIn(harness)

		await harness.controller.send("and this?", said.id)
		await harness.settled()

		const answering = harness.controller.getState().messages.at(-1)
		expect(answering?.repliedToMessageId).toBe(said.id)

		const page = await harness.store.loadPage(harness.conversation.id, null)
		expect(
			page.messages.find((message) => message.id === answering?.id)
				?.repliedToMessageId,
		).toBe(said.id)
	})

	it("stores no identifier when the message sent answers nothing", async () => {
		const said = await saidIn(harness)

		expect(said.repliedToMessageId).toBeNull()
	})

	it("stores no identifier when the message answered sits in another conversation", async () => {
		const said = await saidIn(harness)
		const elsewhere = await harness.store.createConversation({
			spaceId: SPACE,
			sectionId: null,
			title: "Roofs",
			botIds: harness.conversation.participants.map(({ botId }) => botId),
		})
		await harness.controller.open(elsewhere)
		await harness.settled()

		await harness.controller.send("and this?", said.id)
		await harness.settled()

		const answering = harness.controller.getState().messages.at(-1)
		expect(answering?.repliedToMessageId).toBeNull()
	})

	describe("summoning the companion a reply answers", () => {
		const HELD_HISTORY = 200

		const pageOfHistory = (
			conversationId: string,
			beforeSeq: number | null,
			oldestAuthorBotId: string,
		) => {
			const shown = Array.from({ length: HELD_HISTORY }, (_, index) =>
				message({
					id: `m-${index + 1}`,
					conversationId,
					seq: index + 1,
					authorBotId:
						index === HELD_HISTORY - TRANSCRIPT_WINDOW_SIZE
							? oldestAuthorBotId
							: null,
				}),
			)
			const page = shown
				.filter((held) => held.seq < (beforeSeq ?? HELD_HISTORY + 1))
				.slice(-TRANSCRIPT_PAGE_SIZE)
			return {
				conversationId,
				messages: page,
				arrivals: [],
				hasMore: (page[0]?.seq ?? 1) > 1,
			}
		}

		const answeredBy = async (harness: Harness, botId: string) => {
			harness.driver.pushTo(botId, spoke(botId, "walls up"))
			await harness.settled()
			const spokenByBot = harness.controller
				.getState()
				.messages.find((message) => message.authorBotId === botId)
			if (!spokenByBot) {
				throw new Error(`no message from ${botId}`)
			}
			return spokenByBot
		}

		it("summons the companion whose message the reply answers", async () => {
			const nyx = idOf(harness.conversation, "Nyx")
			await harness.controller.send("@Nyx take the walls")
			await harness.settled()
			const answered = await answeredBy(harness, nyx)

			await harness.controller.send("and the gates?", answered.id)
			await harness.settled()

			expect(submittedIn(harness)).toEqual([nyx, nyx])
		})

		it("summons in one wave the companion answered first, then the companions the text names", async () => {
			const nyx = idOf(harness.conversation, "Nyx")
			const iris = idOf(harness.conversation, "Iris")
			await harness.controller.send("@Nyx take the walls")
			await harness.settled()
			const answered = await answeredBy(harness, nyx)

			await harness.controller.send("@Iris and @Nyx, again", answered.id)
			await harness.settled()

			expect(submittedIn(harness)).toEqual([nyx, nyx, iris])
			expect(runningIn(harness.controller)).toEqual([nyx, iris])
			expect(harness.controller.getState().waitingBotIds).toEqual([])
		})

		it("summons the companions the text names when the reply answers the reader", async () => {
			const ada = idOf(harness.conversation, "Ada")
			const iris = idOf(harness.conversation, "Iris")
			const said = await saidIn(harness)
			await answeredBy(harness, ada)

			await harness.controller.send("@Iris and this?", said.id)
			await harness.settled()

			expect(submittedIn(harness)).toEqual([ada, iris])
		})

		it("summons the lead alone when the reply answers the reader and names nobody", async () => {
			const ada = idOf(harness.conversation, "Ada")
			const said = await saidIn(harness)
			await answeredBy(harness, ada)

			await harness.controller.send("and this?", said.id)
			await harness.settled()

			expect(submittedIn(harness)).toEqual([ada, ada])
		})

		it("summons the lead alone when the companion answered has left the conversation", async () => {
			const ada = idOf(harness.conversation, "Ada")
			const nyx = idOf(harness.conversation, "Nyx")
			await harness.controller.send("@Nyx take the walls")
			await harness.settled()
			const answered = await answeredBy(harness, nyx)
			const without = await harness.store.removeConversationParticipant(
				harness.conversation.id,
				nyx,
			)
			await harness.controller.open(without)
			await harness.settled()

			await harness.controller.send("and the gates?", answered.id)
			await harness.settled()

			expect(runningIn(harness.controller)).toEqual([ada])
		})

		it("summons the lead alone when the message answered is out of the transcript", async () => {
			const ada = idOf(harness.conversation, "Ada")
			const nyx = idOf(harness.conversation, "Nyx")
			await harness.controller.send("@Nyx take the walls")
			await harness.settled()
			const answered = await answeredBy(harness, nyx)
			const elsewhere = await harness.store.createConversation({
				spaceId: SPACE,
				sectionId: null,
				title: "Roofs",
				botIds: harness.conversation.participants.map(({ botId }) => botId),
			})
			await harness.controller.open(elsewhere)
			await harness.settled()

			await harness.controller.send("and the gates?", answered.id)
			await harness.settled()

			expect(runningIn(harness.controller)).toEqual([ada])
		})

		it("summons the companion answered when the send drops it from the window", async () => {
			const nyx = idOf(harness.conversation, "Nyx")
			const answered = `m-${HELD_HISTORY - TRANSCRIPT_WINDOW_SIZE + 1}`
			vi.spyOn(harness.store, "loadPage").mockImplementation(
				(conversationId, cursor) =>
					Promise.resolve(
						pageOfHistory(conversationId, cursor?.beforeSeq ?? null, nyx),
					),
			)
			const paged = await harness.store.createConversation({
				spaceId: SPACE,
				sectionId: null,
				title: "Roofs",
				botIds: harness.conversation.participants.map(({ botId }) => botId),
			})
			await harness.controller.open(paged)
			await harness.controller.loadOlder()
			await harness.controller.loadOlder()
			await harness.settled()
			expect(harness.controller.getState().messages[0].id).toBe(answered)

			await harness.controller.send("and the gates?", answered)
			await harness.settled()

			const shown = harness.controller.getState().messages
			expect(shown.some((message) => message.id === answered)).toBe(false)
			expect(submittedIn(harness).at(-1)).toBe(nyx)
		})

		it("summons the companion answered when a refused reply is sent again", async () => {
			const nyx = idOf(harness.conversation, "Nyx")
			await harness.controller.send("@Nyx take the walls")
			await harness.settled()
			const answered = await answeredBy(harness, nyx)
			harness.refuseNextWrite()
			await harness.controller.send("and the gates?", answered.id)
			await harness.settled()
			const held = harness.controller.getState().refusedMessage

			await harness.controller.sendAgain(held?.id ?? "")
			await harness.settled()

			expect(submittedIn(harness)).toEqual([nyx, nyx])
		})
	})

	it("runs every companion named at the same time, ranked by first mention", async () => {
		const nyx = idOf(harness.conversation, "Nyx")
		const iris = idOf(harness.conversation, "Iris")
		await harness.controller.send("@Iris and @Nyx, both of you")
		await harness.settled()

		expect(submittedIn(harness)).toEqual([iris, nyx])
		expect(runningIn(harness.controller)).toEqual([iris, nyx])
		expect(harness.controller.getState().waitingBotIds).toEqual([])
	})

	it("keeps the rank of a companion whatever the order its wave mates answer in", async () => {
		const nyx = idOf(harness.conversation, "Nyx")
		const iris = idOf(harness.conversation, "Iris")
		await harness.controller.send("@Nyx then @Iris")
		await harness.settled()

		harness.driver.pushTo(iris, [
			{
				type: "messageStarted",
				message: {
					id: "msg-iris",
					role: "assistant",
					text: "",
					completion: "streaming",
					timestamp: 1,
				},
			},
			{ type: "messageDelta", id: "msg-iris", seq: 1, text: "gates first" },
		])
		await harness.settled()

		expect(runningIn(harness.controller)).toEqual([nyx, iris])
	})

	it("reads the bounded context of every companion of the wave at the message sent", async () => {
		const nyx = idOf(harness.conversation, "Nyx")
		const iris = idOf(harness.conversation, "Iris")
		await harness.controller.send("@Nyx then @Iris")
		await harness.settled()

		const said = harness.controller.getState().messages[0].id
		expect(harness.contexts).toEqual([
			[nyx, said],
			[iris, said],
		])
	})

	it("holds the companion a speaker names until its whole wave has stopped", async () => {
		const ada = idOf(harness.conversation, "Ada")
		const nyx = idOf(harness.conversation, "Nyx")
		const iris = idOf(harness.conversation, "Iris")
		await harness.controller.send("@Nyx then @Iris")
		await harness.settled()

		harness.driver.pushTo(nyx, spoke(nyx, `over to <@${ada}>`))
		await harness.settled()

		expect(submittedIn(harness)).toEqual([nyx, iris])
		expect(harness.controller.getState().waitingBotIds).toEqual([ada])

		harness.driver.pushTo(iris, spoke(iris, "gates up"))
		await harness.settled()

		expect(submittedIn(harness)).toEqual([nyx, iris, ada])
	})

	it("runs in a second wave the companion a wave mate named", async () => {
		const ada = idOf(harness.conversation, "Ada")
		const nyx = idOf(harness.conversation, "Nyx")
		await harness.controller.send("@Ada then @Nyx")
		await harness.settled()

		harness.driver.pushTo(ada, spoke(ada, `over to <@${nyx}>`))
		await harness.settled()

		expect(submittedIn(harness)).toEqual([ada, nyx])
		expect(harness.controller.getState().waitingBotIds).toEqual([nyx])

		harness.driver.pushTo(nyx, spoke(nyx, "walls up"))
		await harness.settled()

		expect(submittedIn(harness)).toEqual([ada, nyx, nyx])
		expect(runningIn(harness.controller)).toEqual([nyx])

		harness.driver.pushTo(nyx, spoke(nyx, "and the gates too"))
		await harness.settled()

		expect(runningIn(harness.controller)).toEqual([])
	})

	it("keeps the named order of the companions yet to publish while a wave mate publishes", async () => {
		const ada = idOf(harness.conversation, "Ada")
		const nyx = idOf(harness.conversation, "Nyx")
		const iris = idOf(harness.conversation, "Iris")
		await harness.controller.send("@Ada then @Nyx then @Iris")
		await harness.settled()

		harness.driver.pushTo(nyx, [
			{
				type: "messageStarted",
				message: {
					id: "msg-nyx",
					role: "assistant",
					text: "",
					completion: "streaming",
					timestamp: 1,
				},
			},
			{
				type: "messageDelta",
				id: "msg-nyx",
				seq: 1,
				text: "walls first\n\n",
			},
		])
		await harness.settled()

		expect(runningIn(harness.controller)).toEqual([ada, nyx, iris])
		expect(unpublishedIn(harness.controller)).toEqual([ada, iris])
	})

	it("holds one summons only for a companion two speakers of a wave name", async () => {
		const ada = idOf(harness.conversation, "Ada")
		const nyx = idOf(harness.conversation, "Nyx")
		const iris = idOf(harness.conversation, "Iris")
		await harness.controller.send("@Nyx then @Iris")
		await harness.settled()

		harness.driver.pushTo(nyx, spoke(nyx, `over to <@${ada}>`))
		harness.driver.pushTo(iris, spoke(iris, `and <@${ada}> too`))
		await harness.settled()

		expect(submittedIn(harness)).toEqual([nyx, iris, ada])
		expect(runningIn(harness.controller)).toEqual([ada])
	})

	it("drops an event carrying the scope of no running companion", async () => {
		const nyx = idOf(harness.conversation, "Nyx")
		await harness.controller.send("@Nyx take the walls")
		await harness.settled()
		harness.driver.pushTo(nyx, spoke(nyx, "walls up"))
		await harness.settled()

		harness.driver.pushTo(nyx, spoke(nyx, "and the gates"))
		await harness.settled()

		expect(spokenIn(harness.controller)).toEqual([
			[null, `<@${nyx}> take the walls`],
			[nyx, "walls up"],
		])
	})

	it("sends the message through the host with every companion it summons", async () => {
		const nyx = idOf(harness.conversation, "Nyx")
		const iris = idOf(harness.conversation, "Iris")
		const sent = vi.spyOn(harness.store, "sendUserMessage")
		const started = vi.spyOn(harness.store, "startTurn")

		await harness.controller.send("@Nyx then @Iris")
		await harness.settled()

		expect(sent).toHaveBeenCalledTimes(1)
		expect(sent).toHaveBeenCalledWith(expect.anything(), [nyx, iris])
		expect(started).not.toHaveBeenCalled()
	})

	it("leaves the turn for the host to close when the last companion of the wave stops", async () => {
		const nyx = idOf(harness.conversation, "Nyx")
		const iris = idOf(harness.conversation, "Iris")
		const completed = vi.spyOn(harness.store, "completeTurn")
		await harness.controller.send("@Nyx then @Iris")
		await harness.settled()

		harness.driver.pushTo(nyx, spoke(nyx, "walls up"))
		harness.driver.pushTo(iris, spoke(iris, "gates up"))
		await harness.settled()

		expect(runningIn(harness.controller)).toEqual([])
		expect(completed).not.toHaveBeenCalled()
	})

	it("leaves no message of a companion that ended its turn writing nothing", async () => {
		const ada = idOf(harness.conversation, "Ada")
		await harness.controller.send("and now?")
		await harness.settled()

		harness.driver.pushTo(ada, SAID_NOTHING)
		await harness.settled()

		expect(spokenIn(harness.controller)).toEqual([[null, "and now?"]])
		expect(runningIn(harness.controller)).toEqual([])
	})

	it("names the run it left behind when the same companion speaks again", async () => {
		const ada = idOf(harness.conversation, "Ada")
		const opened = vi.spyOn(harness.store, "openRuntimeSession")
		await harness.controller.send("and now?")
		await harness.settled()
		const first = harness.driver.submissions.at(-1)?.scope

		harness.driver.pushTo(ada, spoke(ada, "walls up"))
		await harness.settled()
		await harness.controller.send("and then?")
		await harness.settled()

		expect(opened.mock.calls.map((call) => call[3])).toEqual([
			null,
			first?.runtimeSessionId,
		])
	})

	it("puts the companion a speaker names at the end of the same turn", async () => {
		const ada = idOf(harness.conversation, "Ada")
		const nyx = idOf(harness.conversation, "Nyx")
		await harness.controller.send("and now?")
		await harness.settled()

		harness.driver.pushTo(ada, spoke(ada, `over to <@${nyx}>`))
		await harness.settled()

		expect(harness.driver.submissions.map(({ scope }) => scope.botId)).toEqual([
			ada,
			nyx,
		])
	})

	it("puts the companion a speaker names in plain words at the end of the same turn", async () => {
		const ada = idOf(harness.conversation, "Ada")
		const nyx = idOf(harness.conversation, "Nyx")
		await harness.controller.send("and now?")
		await harness.settled()

		harness.driver.pushTo(ada, spoke(ada, "over to @Nyx"))
		await harness.settled()

		expect(harness.driver.submissions.map(({ scope }) => scope.botId)).toEqual([
			ada,
			nyx,
		])
	})

	it("stores a settled reply with the name it wrote in token form", async () => {
		const ada = idOf(harness.conversation, "Ada")
		const nyx = idOf(harness.conversation, "Nyx")
		await harness.controller.send("and now?")
		await harness.settled()

		harness.driver.pushTo(ada, spoke(ada, "over to @Nyx"))
		await harness.settled()

		expect(spokenIn(harness.controller)).toContainEqual([
			ada,
			`over to <@${nyx}>`,
		])
		const page = await harness.store.loadPage(harness.conversation.id, null)
		expect(page.messages.map((message) => message.content)).toContain(
			`over to <@${nyx}>`,
		)
	})

	it("shows the attachment block a later completion adds to a settled reply", async () => {
		const ada = idOf(harness.conversation, "Ada")
		await harness.controller.send("and now?")
		await harness.settled()
		const [started, delta] = spoke(ada, "here it is")
		const id = `msg-${ada}-10`

		harness.driver.pushTo(ada, [
			started,
			delta,
			completedAs(id, "here it is"),
			completedAs(id, `here it is${ATTACHMENT_BLOCK}`),
			TURN_ENDED,
		])
		await harness.settled()

		expect(spokenIn(harness.controller)).toEqual([
			[null, "and now?"],
			[ada, `here it is${ATTACHMENT_BLOCK}`],
		])
	})

	it("keeps a single reply when a later completion repeats the settled text", async () => {
		const ada = idOf(harness.conversation, "Ada")
		await harness.controller.send("and now?")
		await harness.settled()
		const [started, delta] = spoke(ada, "here it is")
		const id = `msg-${ada}-10`
		harness.driver.pushTo(ada, [started, delta, completedAs(id, "here it is")])
		await harness.settled()
		const settledMessages = harness.controller.getState().messages

		harness.driver.pushTo(ada, [completedAs(id, "here it is"), TURN_ENDED])
		await harness.settled()

		expect(harness.controller.getState().messages).toBe(settledMessages)
		expect(spokenIn(harness.controller)).toEqual([
			[null, "and now?"],
			[ada, "here it is"],
		])
	})

	it("keeps a settled reply when a later ending carries no text", async () => {
		const ada = idOf(harness.conversation, "Ada")
		await harness.controller.send("and now?")
		await harness.settled()
		const [started, delta] = spoke(ada, "here it is")
		const id = `msg-${ada}-10`

		harness.driver.pushTo(ada, [
			started,
			delta,
			completedAs(id, "here it is"),
			completedAs(id, ""),
			TURN_ENDED,
		])
		await harness.settled()

		expect(spokenIn(harness.controller)).toEqual([
			[null, "and now?"],
			[ada, "here it is"],
		])
	})

	it("shows a reply carrying the attachment block alone", async () => {
		const ada = idOf(harness.conversation, "Ada")
		await harness.controller.send("and now?")
		await harness.settled()
		const [started] = spoke(ada, "")

		harness.driver.pushTo(ada, [
			started,
			completedAs(`msg-${ada}-0`, ATTACHMENT_BLOCK.trimStart()),
			TURN_ENDED,
		])
		await harness.settled()

		expect(spokenIn(harness.controller)).toEqual([
			[null, "and now?"],
			[ada, ATTACHMENT_BLOCK.trimStart()],
		])
	})

	it("leaves an arobase naming no seated companion as plain text", async () => {
		const ada = idOf(harness.conversation, "Ada")
		await harness.controller.send("and now?")
		await harness.settled()

		harness.driver.pushTo(ada, spoke(ada, "write to @nobody"))
		await harness.settled()

		expect(spokenIn(harness.controller)).toContainEqual([
			ada,
			"write to @nobody",
		])
		expect(harness.driver.submissions.map(({ scope }) => scope.botId)).toEqual([
			ada,
		])
	})

	it("points a companion pulled in by another at the message that named it", async () => {
		const ada = idOf(harness.conversation, "Ada")
		const nyx = idOf(harness.conversation, "Nyx")
		await harness.controller.send("and now?")
		await harness.settled()

		harness.driver.pushTo(ada, spoke(ada, `over to <@${nyx}>`))
		await harness.settled()

		const [said, named] = harness.controller.getState().messages
		expect(harness.contexts).toEqual([
			[ada, said.id],
			[nyx, named.id],
		])
	})

	it("drops the companions of the open wave when a message comes in", async () => {
		const nyx = idOf(harness.conversation, "Nyx")
		const iris = idOf(harness.conversation, "Iris")
		const ada = idOf(harness.conversation, "Ada")
		await harness.controller.send("@Nyx then @Iris")
		await harness.settled()

		await harness.controller.send("@Ada instead")
		await harness.settled()

		expect(runningIn(harness.controller)).toEqual([nyx, iris])
		expect(harness.controller.getState().waitingBotIds).toEqual([ada])

		harness.driver.pushTo(nyx, spoke(nyx, `over to <@${iris}>`))
		harness.driver.pushTo(iris, spoke(iris, "gates up"))
		await harness.settled()

		expect(submittedIn(harness)).toEqual([nyx, iris, ada])
		expect(runningIn(harness.controller)).toEqual([ada])
	})

	it("keeps relaying however many times two companions hand the turn over", async () => {
		const ada = idOf(harness.conversation, "Ada")
		const nyx = idOf(harness.conversation, "Nyx")
		await harness.controller.send("and now?")
		await harness.settled()

		harness.driver.pushTo(ada, spoke(ada, `one <@${nyx}>`))
		await harness.settled()
		harness.driver.pushTo(nyx, spoke(nyx, `two <@${ada}>`))
		await harness.settled()
		harness.driver.pushTo(ada, spoke(ada, `three <@${nyx}>`))
		await harness.settled()

		expect(runningIn(harness.controller)).toEqual([nyx])
	})

	it("leaves what the companion in flight wrote in place when the turn is stopped", async () => {
		const nyx = idOf(harness.conversation, "Nyx")
		const iris = idOf(harness.conversation, "Iris")
		await harness.controller.send("@Nyx then @Iris")
		await harness.settled()

		harness.driver.pushTo(nyx, [
			{
				type: "messageStarted",
				message: {
					id: "msg-half",
					role: "assistant",
					text: "",
					completion: "streaming",
					timestamp: 1,
				},
			},
			{ type: "messageDelta", id: "msg-half", seq: 1, text: "half a wall" },
		])
		await harness.settled()

		await harness.controller.stop()
		harness.driver.pushTo(nyx, [
			{ type: "turnEnded", ended: { sessionId: null, outcome: "cancelled" } },
		])
		await harness.settled()

		expect(harness.driver.cancelled).toEqual([nyx, iris])
		expect(spokenIn(harness.controller)).toContainEqual([nyx, "half a wall"])
		expect(harness.controller.getState().waitingBotIds).toEqual([])
	})

	it("cancels the companion alone whose row the reader stopped", async () => {
		const nyx = idOf(harness.conversation, "Nyx")
		const iris = idOf(harness.conversation, "Iris")
		await harness.controller.send("@Nyx then @Iris")
		await harness.settled()

		const stopped = harness.controller
			.getState()
			.speakers.find(({ botId }) => botId === iris)
		await stopped?.stop?.()
		harness.driver.pushTo(iris, [
			{ type: "turnEnded", ended: { sessionId: null, outcome: "cancelled" } },
		])
		await harness.settled()

		expect(harness.driver.cancelled).toEqual([iris])
		expect(runningIn(harness.controller)).toEqual([nyx])
	})

	it("cancels every companion and drops the summons held when the reader stops the conversation", async () => {
		const ada = idOf(harness.conversation, "Ada")
		const nyx = idOf(harness.conversation, "Nyx")
		const iris = idOf(harness.conversation, "Iris")
		await harness.controller.send("@Nyx then @Iris")
		await harness.settled()
		harness.driver.pushTo(nyx, spoke(nyx, `over to <@${ada}>`))
		await harness.settled()

		await harness.controller.stop()
		harness.driver.pushTo(iris, [
			{ type: "turnEnded", ended: { sessionId: null, outcome: "cancelled" } },
		])
		await harness.settled()

		expect(harness.driver.cancelled).toEqual([iris])
		expect(harness.controller.getState().waitingBotIds).toEqual([])
		expect(submittedIn(harness)).toEqual([nyx, iris])
	})

	it("shuts down the runtime of every companion of the open wave", async () => {
		const nyx = idOf(harness.conversation, "Nyx")
		const iris = idOf(harness.conversation, "Iris")
		await harness.controller.send("@Nyx then @Iris")
		await harness.settled()

		await harness.controller.shutdown()

		expect(harness.driver.shutdowns).toEqual([nyx, iris])
	})

	describe("releasing the scope a speaker held", () => {
		const spokenOnce = async (harness: Harness, text: string) => {
			const nyx = idOf(harness.conversation, "Nyx")
			await harness.controller.send("@Nyx take the walls")
			await harness.settled()
			harness.driver.pushTo(nyx, spoke(nyx, text))
			await harness.settled()
			return nyx
		}

		it("shuts the scope of a companion down once its turn ends", async () => {
			const nyx = await spokenOnce(harness, "walls are held")

			expect(harness.driver.shutdowns).toEqual([nyx])
		})

		it("settles the reply of a companion whose shutdown never answers", async () => {
			vi.spyOn(harness.driver, "shutdown").mockReturnValue(
				new Promise(() => undefined),
			)

			const nyx = await spokenOnce(harness, "walls are held")

			expect(spokenIn(harness.controller)).toContainEqual([
				nyx,
				"walls are held",
			])
			expect(harness.controller.getState().messages.at(-1)?.completion).toBe(
				"complete",
			)
		})

		it("leaves the companion removed when the release fails", async () => {
			const reported = vi
				.spyOn(console, "error")
				.mockImplementation(() => undefined)
			vi.spyOn(harness.driver, "shutdown").mockRejectedValue({
				kind: "transitionInProgress",
			})

			const nyx = await spokenOnce(harness, "walls are held")

			expect(runningIn(harness.controller)).toEqual([])
			expect(harness.controller.getState().latestError).toBeNull()
			expect(spokenIn(harness.controller)).toEqual([
				[null, `<@${nyx}> take the walls`],
				[nyx, "walls are held"],
			])
			expect(reported).toHaveBeenCalledWith(
				"conversation controller: agent_shutdown failed",
				{ kind: "transitionInProgress" },
			)
			reported.mockRestore()
		})

		it("releases the scopes left when one release rejects on shutdown", async () => {
			const reported = vi
				.spyOn(console, "error")
				.mockImplementation(() => undefined)
			const nyx = idOf(harness.conversation, "Nyx")
			const iris = idOf(harness.conversation, "Iris")
			await harness.controller.send("@Nyx then @Iris")
			await harness.settled()
			const released: string[] = []
			vi.spyOn(harness.driver, "shutdown").mockImplementation((scope) => {
				if (scope.botId === nyx) {
					return Promise.reject(new Error("refused"))
				}
				released.push(scope.botId)
				return Promise.resolve()
			})

			await harness.controller.shutdown()

			expect(released).toEqual([iris])
			expect(harness.controller.getState().latestError).toBeNull()
			reported.mockRestore()
		})

		it("resumes the next turn of a companion from the session its closed scope stored", async () => {
			const opened = vi.spyOn(harness.store, "openRuntimeSession")
			const nyx = await spokenOnce(harness, "walls are held")
			const first = harness.driver.submissions[0].scope.runtimeSessionId

			await harness.controller.send("@Nyx and the gates?")
			await harness.settled()

			expect(opened).toHaveBeenLastCalledWith(
				harness.conversation.id,
				nyx,
				expect.anything(),
				first,
				null,
			)
		})

		it("holds one open scope at most per companion over ten turns", async () => {
			const openRuntimeSession = harness.store.openRuntimeSession
			let live = 0
			let peak = 0
			vi.spyOn(harness.store, "openRuntimeSession").mockImplementation(
				async (...args) => {
					const session = await openRuntimeSession(...args)
					live += 1
					peak = Math.max(peak, live)
					return session
				},
			)
			vi.spyOn(harness.driver, "shutdown").mockImplementation(() => {
				live -= 1
				return Promise.resolve()
			})

			for (let turn = 0; turn < 10; turn += 1) {
				await spokenOnce(harness, "wall".repeat(turn + 1))
			}

			expect(peak).toBe(1)
			expect(live).toBe(0)
		})

		const refusedOn = async (refused: Partial<TranscriptStore>) => {
			const driver = createScriptedDriver()
			const controller = createConversationController(driver, {
				...harness.store,
				...refused,
			})
			const detach = controller.attach()
			await controller.open(harness.conversation)
			await controller.send("hold the walls")
			await settled()
			detach()
			return { driver, controller }
		}

		it("shuts nothing down for a companion that opened no scope", async () => {
			const { driver, controller } = await refusedOn({
				openRuntimeSession: () => Promise.reject(new Error("refused")),
			})

			expect(driver.shutdowns).toEqual([])
			expect(runningIn(controller)).toEqual([])
		})

		it("shuts the scope down of a companion whose prompt was refused", async () => {
			const { driver } = await refusedOn({
				boundedContext: () => Promise.reject(new Error("refused")),
			})

			expect(driver.shutdowns).toEqual([idOf(harness.conversation, "Ada")])
		})
	})

	describe("a companion asking the reader", () => {
		const askedIn = async (harness: Harness) => {
			const nyx = idOf(harness.conversation, "Nyx")
			await harness.controller.send("@Nyx hold the walls")
			await harness.settled()
			harness.driver.pushTo(nyx, [
				{
					type: "questionRequested",
					request: {
						id: "ask-1",
						questions: [
							{
								header: "Walls",
								question: "Which wall?",
								options: [],
								multiSelect: false,
							},
						],
					},
				},
			])
			await harness.settled()
			return nyx
		}

		const permittedIn = async (harness: Harness) => {
			const nyx = idOf(harness.conversation, "Nyx")
			await harness.controller.send("@Nyx hold the walls")
			await harness.settled()
			harness.driver.pushTo(nyx, [
				{
					type: "permissionRequested",
					request: {
						id: "let-1",
						toolName: "Bash",
						title: "Run the mason",
						detail: "mason --build",
					},
				},
			])
			await harness.settled()
			return nyx
		}

		it("holds a question with the companion that asked it", async () => {
			const nyx = await askedIn(harness)

			expect(harness.controller.getState().pendingPrompt).toEqual({
				kind: "question",
				botId: nyx,
				request: {
					id: "ask-1",
					questions: [
						{
							header: "Walls",
							question: "Which wall?",
							options: [],
							multiSelect: false,
						},
					],
				},
			})
		})

		it("holds a permission with the companion that asked it", async () => {
			const nyx = await permittedIn(harness)

			expect(harness.controller.getState().pendingPrompt).toMatchObject({
				kind: "permission",
				botId: nyx,
				request: { id: "let-1" },
			})
		})

		it("draws the companion that asked as waiting on its first question, not its header", async () => {
			await askedIn(harness)

			expect(workIn(harness.controller)).toEqual({
				kind: "waiting",
				label: "Which wall?",
			})
		})

		it("draws the companion that asked as waiting on the permission it wants", async () => {
			await permittedIn(harness)

			expect(workIn(harness.controller)).toEqual({
				kind: "waiting",
				label: "Run the mason",
			})
		})

		it("gives the companion back the work it was doing once the ask is answered", async () => {
			await askedIn(harness)

			await harness.controller.answer("ask-1", { "Which wall?": "the north" })
			await harness.settled()

			expect(workIn(harness.controller)).toEqual({
				kind: "thinking",
				startedAt: expect.any(Number),
			})
		})

		it("answers on the runtime of the companion that asked, then releases the ask", async () => {
			const nyx = await askedIn(harness)

			await harness.controller.answer("ask-1", { "Which wall?": "the north" })
			await harness.settled()

			expect(harness.driver.answered).toEqual([
				{
					botId: nyx,
					id: "ask-1",
					answers: { "Which wall?": "the north" },
				},
			])
			expect(harness.controller.getState().pendingPrompt).toBeNull()
		})

		it("writes the question into the transcript as a message of the companion", async () => {
			const nyx = await askedIn(harness)

			const asking = harness.controller
				.getState()
				.messages.find((message) => message.id === "question-ask-1")
			expect(asking).toMatchObject({
				authorBotId: nyx,
				role: "assistant",
				content: "### Which wall?",
			})
		})

		it("writes the answers into the transcript as a message of the reader", async () => {
			await askedIn(harness)

			await harness.controller.answer("ask-1", { "Which wall?": "the north" })
			await harness.settled()

			expect(spokenIn(harness.controller)).toContainEqual([null, "the north"])
		})

		it("points the answer at the question it replies to", async () => {
			await askedIn(harness)

			await harness.controller.answer("ask-1", { "Which wall?": "the north" })
			await harness.settled()

			const answering = harness.controller.getState().messages.at(-1)
			expect(answering?.repliedToMessageId).toBe("question-ask-1")

			const page = await harness.store.loadPage(harness.conversation.id, null)
			expect(
				page.messages.find((message) => message.id === answering?.id)
					?.repliedToMessageId,
			).toBe("question-ask-1")
		})

		it("decides on the runtime of the companion that asked, then releases the ask", async () => {
			const nyx = await permittedIn(harness)

			await harness.controller.respond("let-1", "allowOnce")
			await harness.settled()

			expect(harness.driver.decided).toEqual([
				{ botId: nyx, id: "let-1", decision: "allowOnce" },
			])
			expect(harness.controller.getState().pendingPrompt).toBeNull()
		})

		it("keeps the question and holds the failure of the companion when its runtime rejects the answer", async () => {
			const nyx = await askedIn(harness)
			vi.spyOn(harness.driver, "answerQuestion").mockRejectedValue(
				SERVER_ENV_REJECTED,
			)

			await harness.controller.answer("ask-1", { "Which wall?": "the north" })
			await harness.settled()

			const state = harness.controller.getState()
			expect(state.latestError).toMatchObject({
				botId: nyx,
				error: SERVER_ENV_REJECTED,
			})
			expect(state.pendingPrompt).toMatchObject({
				kind: "question",
				request: { id: "ask-1" },
			})
			const page = await harness.store.loadPage(harness.conversation.id, null)
			expect(
				page.messages.filter(
					(message) => message.repliedToMessageId === "question-ask-1",
				),
			).toEqual([])
		})

		it("releases the question and holds the failure when only the answer row is refused", async () => {
			await askedIn(harness)
			vi.spyOn(harness.store, "appendUserMessage").mockRejectedValue(
				new Error("refused"),
			)

			await harness.controller.answer("ask-1", { "Which wall?": "the north" })
			await harness.settled()

			const state = harness.controller.getState()
			expect(state.pendingPrompt).toBeNull()
			expect(state.latestError?.error).toEqual({
				kind: "readFailed",
				detail: "refused",
			})
		})

		it("keeps the permission and holds the failure of the companion when its runtime rejects the decision", async () => {
			const nyx = await permittedIn(harness)
			vi.spyOn(harness.driver, "respondToPermission").mockRejectedValue(
				SERVER_ENV_REJECTED,
			)

			await harness.controller.respond("let-1", "allowOnce")
			await harness.settled()

			const state = harness.controller.getState()
			expect(state.latestError).toMatchObject({
				botId: nyx,
				error: SERVER_ENV_REJECTED,
			})
			expect(state.pendingPrompt).toMatchObject({
				kind: "permission",
				request: { id: "let-1" },
			})
		})

		it("releases the ask when the turn of the companion ends", async () => {
			const nyx = await askedIn(harness)

			harness.driver.pushTo(nyx, [
				{ type: "turnEnded", ended: { sessionId: null, outcome: "completed" } },
			])
			await harness.settled()

			expect(harness.controller.getState().pendingPrompt).toBeNull()
		})

		it("denies the ask before cancelling the turn it is held in", async () => {
			const nyx = await askedIn(harness)

			await harness.controller.stop()
			await harness.settled()

			expect(harness.driver.decided).toEqual([
				{ botId: nyx, id: "ask-1", decision: "deny" },
			])
			expect(harness.controller.getState().pendingPrompt).toBeNull()
			expect(harness.driver.cancelled).toEqual([nyx])
		})
	})

	describe("two companions of a wave asking the reader", () => {
		const askedBoth = async (harness: Harness) => {
			const nyx = idOf(harness.conversation, "Nyx")
			const iris = idOf(harness.conversation, "Iris")
			await harness.controller.send("@Nyx then @Iris")
			await harness.settled()
			harness.driver.pushTo(nyx, [
				{
					type: "questionRequested",
					request: {
						id: "ask-1",
						questions: [
							{
								header: "Walls",
								question: "Which wall?",
								options: [],
								multiSelect: false,
							},
						],
					},
				},
			])
			harness.driver.pushTo(iris, [
				{
					type: "permissionRequested",
					request: {
						id: "let-1",
						toolName: "Bash",
						title: "Run the mason",
						detail: "mason --build",
					},
				},
			])
			await harness.settled()
			return { nyx, iris }
		}

		it("exposes the oldest ask alone", async () => {
			await askedBoth(harness)

			expect(harness.controller.getState().pendingPrompt).toMatchObject({
				kind: "question",
				request: { id: "ask-1" },
			})
		})

		it("gives each companion of the wave the work it is doing", async () => {
			await askedBoth(harness)

			expect(
				harness.controller.getState().speakers.map(({ work }) => work),
			).toEqual([
				{ kind: "waiting", label: "Which wall?" },
				{ kind: "waiting", label: "Run the mason" },
			])
		})

		it("exposes the next ask once the oldest is released", async () => {
			const { nyx } = await askedBoth(harness)

			await harness.controller.answer("ask-1", { "Which wall?": "the north" })
			await harness.settled()

			expect(harness.driver.answered).toEqual([
				{
					botId: nyx,
					id: "ask-1",
					answers: { "Which wall?": "the north" },
				},
			])
			expect(harness.controller.getState().pendingPrompt).toMatchObject({
				kind: "permission",
				request: { id: "let-1" },
			})
		})

		it("decides on the runtime of the companion holding the permission", async () => {
			const { iris } = await askedBoth(harness)

			await harness.controller.respond("let-1", "allowOnce")
			await harness.settled()

			expect(harness.driver.decided).toEqual([
				{ botId: iris, id: "let-1", decision: "allowOnce" },
			])
		})
	})

	it("writes every message with the companion that wrote it", async () => {
		const ada = idOf(harness.conversation, "Ada")
		await harness.controller.send("and now?")
		await harness.settled()

		harness.driver.pushTo(ada, spoke(ada, "walls up"))
		await harness.settled()

		expect(spokenIn(harness.controller)).toEqual([
			[null, "and now?"],
			[ada, "walls up"],
		])
	})
	it("records against the open conversation the pin the reader lays", async () => {
		const said = await saidIn(harness)

		await harness.controller.pin(said.id, 0)

		const pinned = await harness.store.pinnedMessages(harness.conversation.id)
		expect(pinned.map((pin) => [pin.message.id, pin.blockIndex])).toEqual([
			[said.id, 0],
		])
	})

	it("drops from the store the pin the reader takes back", async () => {
		const said = await saidIn(harness)
		await harness.controller.pin(said.id, 0)

		await harness.controller.unpin(said.id, 0)

		expect(await harness.controller.pins()).toEqual([])
	})

	it("hands back the pins the store holds for the open conversation", async () => {
		const said = await saidIn(harness)
		await harness.controller.pin(said.id, 1)

		const pinned = await harness.controller.pins()

		expect(pinned.map((pin) => [pin.message.id, pin.blockIndex])).toEqual([
			[said.id, 1],
		])
	})

	it("pins nothing and holds no pin while no conversation is open", async () => {
		const controller = createConversationController(
			createScriptedDriver(),
			refusingStore(),
		)

		await expect(controller.pin("msg-1", 0)).resolves.toBeUndefined()

		expect(await controller.pins()).toEqual([])
	})

	it("keeps the message the store refused, with the message it answers", async () => {
		const said = await saidIn(harness)
		harness.refuseNextWrite()

		await harness.controller.send("and this?", said.id)
		await harness.settled()

		expect(harness.controller.getState().refusedMessage).toMatchObject({
			text: "and this?",
			repliedToMessageId: said.id,
		})
	})

	it("stores the message sent again and lets the seated companions answer it", async () => {
		harness.refuseNextWrite()
		await harness.controller.send("@Nyx take the walls")
		await harness.settled()
		const held = harness.controller.getState().refusedMessage

		await harness.controller.sendAgain(held?.id ?? "")
		await harness.settled()

		const nyx = idOf(harness.conversation, "Nyx")
		expect(spokenIn(harness.controller)).toContainEqual([
			null,
			`<@${nyx}> take the walls`,
		])
		expect(harness.driver.submissions[0].scope.botId).toBe(nyx)
	})

	it("keeps no refused message once a message the reader sends is stored", async () => {
		harness.refuseNextWrite()
		await harness.controller.send("and now?")
		await harness.settled()

		await harness.controller.send("and this?")
		await harness.settled()

		expect(harness.controller.getState().refusedMessage).toBeNull()
	})

	it("keeps only the last message the store refused", async () => {
		harness.refuseNextWrite()
		await harness.controller.send("and now?")
		harness.refuseNextWrite()

		await harness.controller.send("and this?")
		await harness.settled()

		expect(harness.controller.getState().refusedMessage).toMatchObject({
			text: "and this?",
		})
	})

	it("keeps no refused message when the reader opens another conversation", async () => {
		harness.refuseNextWrite()
		await harness.controller.send("and now?")
		await harness.settled()
		const elsewhere = await harness.store.createConversation({
			spaceId: SPACE,
			sectionId: null,
			title: "Roofs",
			botIds: harness.conversation.participants.map(({ botId }) => botId),
		})

		await harness.controller.open(elsewhere)
		await harness.settled()

		expect(harness.controller.getState().refusedMessage).toBeNull()
	})

	it("stores nothing when the message to send again is not the one refused", async () => {
		harness.refuseNextWrite()
		await harness.controller.send("and now?")
		await harness.settled()

		await harness.controller.sendAgain("id-unknown")
		await harness.settled()

		expect(spokenIn(harness.controller)).toEqual([])
		expect(harness.driver.submissions).toHaveLength(0)
	})

	it("leaves the conversation as it stands when the store refuses a pin", async () => {
		const store = refusingStore()
		const bots = await seatBots(store, SPACE, ["Ada"])
		const conversation = await store.createConversation({
			spaceId: SPACE,
			sectionId: null,
			title: "Walls",
			botIds: bots.map((bot) => bot.id),
		})
		const controller = createConversationController(
			createScriptedDriver(),
			store,
		)
		await controller.open(conversation)
		const standing = controller.getState()

		await expect(controller.pin("msg-1", 0)).rejects.toThrow("refused")

		expect(controller.getState()).toBe(standing)
	})
})

describe("what a speaking companion is doing", () => {
	const ran = (
		id: string,
		title: string,
		status: ActivityStatus,
	): AgentEvent => ({
		type: "activity",
		activity: { id, title, kind: "tool", status },
	})

	let harness: Harness
	let ada: string

	beforeEach(async () => {
		harness = await createHarness(["Ada"])
		ada = idOf(harness.conversation, "Ada")
		await harness.controller.send("and now?")
		await harness.settled()
	})

	it("says a companion that has neither run a tool nor written is thinking", () => {
		expect(workIn(harness.controller)).toEqual({
			kind: "thinking",
			startedAt: expect.any(Number),
		})
	})

	it("names the work of the tool a companion runs", async () => {
		harness.driver.pushTo(ada, [ran("a-1", "Grep · walls", "running")])
		await harness.settled()

		expect(workIn(harness.controller)).toEqual({
			kind: "searching",
			label: "Grep · walls",
			startedAt: expect.any(Number),
		})
	})

	it("keeps the instant a seated companion went busy through its whole turn", async () => {
		const seated = workIn(harness.controller)?.startedAt

		harness.driver.pushTo(ada, [ran("a-1", "Grep · walls", "running")])
		await harness.settled()

		expect(seated).toEqual(expect.any(Number))
		expect(workIn(harness.controller)?.startedAt).toBe(seated)
	})

	const started: AgentEvent[] = [
		ran("a-1", "Grep · walls", "running"),
		ran("a-1", "Grep · walls", "succeeded"),
		{
			type: "messageStarted",
			message: {
				id: "msg-ada",
				role: "assistant",
				text: "",
				completion: "streaming",
				timestamp: 1,
			},
		},
	]

	it("keeps a companion thinking between its first token and its first block", async () => {
		harness.driver.pushTo(ada, [
			...started,
			{ type: "messageDelta", id: "msg-ada", seq: 1, text: "walls up" },
		])
		await harness.settled()

		expect(unpublishedIn(harness.controller)).toEqual([ada])
		expect(workIn(harness.controller)).toEqual({
			kind: "thinking",
			startedAt: expect.any(Number),
		})
	})

	it("says a companion is writing once it has published a block", async () => {
		harness.driver.pushTo(ada, [
			...started,
			{ type: "messageDelta", id: "msg-ada", seq: 1, text: "walls up\n\n" },
		])
		await harness.settled()

		expect(unpublishedIn(harness.controller)).toEqual([])
		expect(workIn(harness.controller)).toEqual({
			kind: "writing",
			startedAt: expect.any(Number),
		})
	})

	it("drops what a companion was doing when it stops answering", async () => {
		harness.driver.pushTo(ada, [
			ran("a-1", "Grep · walls", "running"),
			...spoke(ada, "walls up"),
		])
		await harness.settled()

		expect(workIn(harness.controller)).toBeNull()
	})
})

describe("naming a conversation from its first message", () => {
	const namelessWith = (namingFor: () => Promise<ConversationNaming | null>) =>
		createHarness(["Ada"], { title: "", namingFor })

	it("keeps the title and the icon the runtime reads in the first message", async () => {
		const harness = await namelessWith(() =>
			Promise.resolve({ title: "Holding the walls", icon: "Shield" }),
		)

		await harness.controller.send("how do we hold the walls?")
		await harness.settled()

		expect(harness.named).toEqual([
			[harness.conversation.id, { title: "Holding the walls", icon: "Shield" }],
		])
	})

	it("asks the runtime for a title once, on the first message alone", async () => {
		let asked = 0
		const harness = await namelessWith(() => {
			asked += 1
			return Promise.resolve({ title: "Holding the walls", icon: null })
		})

		await harness.controller.send("how do we hold the walls?")
		await harness.settled()
		await harness.controller.send("and the gates?")
		await harness.settled()

		expect(asked).toBe(1)
	})

	it("leaves the conversation without a name when the runtime returns none", async () => {
		const harness = await namelessWith(() => Promise.resolve(null))

		await harness.controller.send("how do we hold the walls?")
		await harness.settled()

		expect(harness.named).toEqual([])
	})

	it("leaves alone the name of a conversation that has one", async () => {
		const harness = await createHarness(["Ada"], {
			namingFor: () =>
				Promise.resolve({ title: "Holding the walls", icon: null }),
		})

		await harness.controller.send("how do we hold the walls?")
		await harness.settled()

		expect(harness.named).toEqual([])
	})
})

describe("failures the conversation carries to the screen", () => {
	const olderPageStore = (refusals: number): TranscriptStore => {
		const base = createFakeTranscriptStore()
		let refused = 0
		return {
			...base,
			loadPage: (conversationId, cursor) => {
				if (!cursor) {
					return Promise.resolve({
						conversationId,
						messages: [message({ id: "m-2", conversationId, seq: 2 })],
						arrivals: [],
						hasMore: true,
					})
				}
				if (refused < refusals) {
					refused += 1
					return Promise.reject(new Error("refused"))
				}
				return Promise.resolve({
					conversationId,
					messages: [message({ id: "m-1", conversationId, seq: 1 })],
					arrivals: [],
					hasMore: false,
				})
			},
		}
	}

	const openedOn = async (store: TranscriptStore) => {
		const conversation = await store.createConversation({
			spaceId: SPACE,
			sectionId: null,
			title: "Walls",
			botIds: [],
		})
		const controller = createConversationController(
			createScriptedDriver(),
			store,
		)
		const detach = controller.attach()
		await controller.open(conversation)
		return { controller, detach }
	}

	it("holds the failure and keeps the older page in reach when the store refuses it", async () => {
		const { controller, detach } = await openedOn(olderPageStore(1))

		await controller.loadOlder()

		const state = controller.getState()
		expect(state.latestError?.error.kind).toBe("readFailed")
		expect(state.hasOlder).toBe(true)
		expect(state.isLoadingOlder).toBe(false)
		detach()
	})

	it("forgets the failure once the older page comes through", async () => {
		const { controller, detach } = await openedOn(olderPageStore(1))

		await controller.loadOlder()
		await controller.loadOlder()

		expect(controller.getState().latestError).toBeNull()
		detach()
	})

	it("forgets the failure the reader dismissed", async () => {
		const { controller, detach } = await openedOn(olderPageStore(1))

		await controller.loadOlder()
		const held = controller.getState().latestError

		controller.dismissError(held?.id ?? "")

		expect(controller.getState().latestError).toBeNull()
		detach()
	})

	it("holds the failure of a transcript that would not load", async () => {
		const store = createFakeTranscriptStore()
		vi.spyOn(store, "loadPage").mockRejectedValue(new Error("refused"))

		const { controller, detach } = await openedOn(store)

		expect(controller.getState().latestError?.error).toEqual({
			kind: "readFailed",
			detail: "refused",
		})
		detach()
	})

	const seatedOn = async (driver: ChatDriver, names: string[] = ["Ada"]) => {
		const store = createFakeTranscriptStore()
		const bots = await seatBots(store, SPACE, names)
		const conversation = await store.createConversation({
			spaceId: SPACE,
			sectionId: null,
			title: "Walls",
			botIds: bots.map((bot) => bot.id),
		})
		const controller = createConversationController(driver, store)
		const detach = controller.attach()
		await controller.open(conversation)
		return { controller, detach, conversation }
	}

	const refusingSessions = (refusals: number): ChatDriver => {
		const scripted = createScriptedDriver()
		let refused = 0
		return {
			...scripted,
			startOrResumeSession: (scope) => {
				if (refused < refusals) {
					refused += 1
					return Promise.reject({ kind: "spawnFailed", detail: "no binary" })
				}
				return scripted.startOrResumeSession(scope)
			},
		}
	}

	it("holds the transport failure that kept a companion from taking the turn", async () => {
		const { controller, detach } = await seatedOn(refusingSessions(1))

		await controller.send("how do we hold the walls?")
		await settled()

		expect(controller.getState().latestError?.error).toEqual({
			kind: "spawnFailed",
			detail: "no binary",
		})
		detach()
	})

	const failingOnFirstStart = (): ChatDriver => {
		const scripted = createScriptedDriver()
		let isFirstStart = true
		return {
			...scripted,
			startOrResumeSession: (scope) => {
				if (isFirstStart) {
					isFirstStart = false
					scripted.emit(scope, { type: "failed", error: SERVER_ENV_REJECTED })
				}
				return scripted.startOrResumeSession(scope)
			},
		}
	}

	it("holds the failure a speaker met while its session was starting", async () => {
		const { controller, detach } = await seatedOn(failingOnFirstStart())

		await controller.send("how do we hold the walls?")
		await settled()

		expect(controller.getState().latestError?.error).toEqual(
			SERVER_ENV_REJECTED,
		)
		expect(runningIn(controller)).toHaveLength(1)
		detach()
	})

	it("holds the failure of one speaker when its neighbour of the wave starts", async () => {
		const { controller, detach } = await seatedOn(failingOnFirstStart(), [
			"Ada",
			"Nyx",
		])

		await controller.send("@Ada and @Nyx")
		await settled()

		expect(controller.getState().latestError?.error).toEqual(
			SERVER_ENV_REJECTED,
		)
		expect(runningIn(controller)).toHaveLength(2)
		detach()
	})

	it("forgets the failure once a companion takes the turn", async () => {
		const { controller, detach } = await seatedOn(refusingSessions(1))

		await controller.send("how do we hold the walls?")
		await settled()
		await controller.send("and the gates?")
		await settled()

		expect(controller.getState().latestError).toBeNull()
		detach()
	})
})

describe("a failure reaching a speaker", () => {
	const CRASHED: TransportError = {
		kind: "crashed",
		code: 1,
		detail: "sidecar is gone",
	}

	let harness: Harness
	let ada: string

	beforeEach(async () => {
		harness = await createHarness(["Ada"])
		ada = idOf(harness.conversation, "Ada")
		await harness.controller.send("how do we hold the walls?")
		await harness.settled()
	})

	const failWith = async (error: TransportError) => {
		harness.driver.pushTo(ada, [{ type: "failed", error }])
		await harness.settled()
	}

	it("keeps the speaker running and holds the failure the session survives", async () => {
		await failWith(SERVER_ENV_REJECTED)

		expect(runningIn(harness.controller)).toEqual([ada])
		expect(harness.controller.getState().latestError?.error).toEqual(
			SERVER_ENV_REJECTED,
		)
	})

	it("keeps the stop of a speaker kept alive in reach", async () => {
		await failWith(SERVER_ENV_REJECTED)

		harness.controller.getState().speakers[0].stop?.()
		await harness.settled()

		expect(harness.driver.cancelled).toEqual([ada])
	})

	it("closes a speaker kept alive on the completion its outcome maps to", async () => {
		await failWith(SERVER_ENV_REJECTED)
		harness.driver.pushTo(ada, spoke(ada, "walls are held"))
		await harness.settled()

		expect(runningIn(harness.controller)).toEqual([])
		expect(harness.controller.getState().messages.at(-1)?.completion).toBe(
			"complete",
		)
	})

	it("closes the speaker as failed and holds the failure ending its session", async () => {
		await failWith(CRASHED)

		expect(runningIn(harness.controller)).toEqual([])
		expect(harness.controller.getState().latestError?.error).toEqual(CRASHED)
	})
})

describe("the pages a conversation holds", () => {
	const PAGE = 20
	const HISTORY = 200

	const stored = (conversationId: string) =>
		Array.from({ length: HISTORY }, (_, index) =>
			message({ id: `m-${index + 1}`, conversationId, seq: index + 1 }),
		)

	const pagingStore = (): TranscriptStore => {
		const base = createFakeTranscriptStore()
		return {
			...base,
			loadPage: (conversationId, cursor) => {
				const before = cursor?.beforeSeq ?? HISTORY + 1
				const page = stored(conversationId)
					.filter((held) => held.seq < before)
					.slice(-PAGE)
				return Promise.resolve({
					conversationId,
					messages: page,
					arrivals: [],
					hasMore: (page[0]?.seq ?? 1) > 1,
				})
			},
		}
	}

	const openedOnHistory = async () => {
		const store = pagingStore()
		const conversation = await store.createConversation({
			spaceId: SPACE,
			sectionId: null,
			title: "Walls",
			botIds: [],
		})
		const controller = createConversationController(
			createScriptedDriver(),
			store,
		)
		const detach = controller.attach()
		await controller.open(conversation)
		return { controller, detach }
	}

	it("drops the pages loaded above the window when the reader leaves", async () => {
		const { controller, detach } = await openedOnHistory()
		await controller.loadOlder()
		await controller.loadOlder()
		await controller.loadOlder()
		expect(controller.getState().messages).toHaveLength(PAGE * 4)

		controller.leave()

		const state = controller.getState()
		expect(state.messages).toHaveLength(TRANSCRIPT_PAGE_SIZE)
		expect(state.messages.at(-1)?.id).toBe(`m-${HISTORY}`)
		expect(state.hasOlder).toBe(true)
		detach()
	})

	it("pages back into the store when the reader comes back", async () => {
		const { controller, detach } = await openedOnHistory()
		await controller.loadOlder()
		await controller.loadOlder()
		await controller.loadOlder()
		controller.leave()

		await controller.loadOlder()

		const state = controller.getState()
		expect(state.messages).toHaveLength(TRANSCRIPT_PAGE_SIZE + PAGE)
		expect(state.messages.at(0)?.id).toBe(
			`m-${HISTORY - TRANSCRIPT_PAGE_SIZE - PAGE + 1}`,
		)
		detach()
	})
})

describe("the routine causes a conversation holds", () => {
	const REPORTED_EARLIER = {
		turnId: "t-earlier",
		routineTitle: "Weekly digest",
		triggerSourceId: "schedule",
	}

	it("keeps the cause of a report that landed while the read was in flight", async () => {
		const store = createFakeTranscriptStore()
		const [bot] = await seatBots(store, SPACE, ["Ada"])
		const conversation = await store.createConversation({
			spaceId: SPACE,
			sectionId: null,
			title: "Walls",
			botIds: [bot.id],
		})
		let settleRead: (reported: ReportedRun[]) => void = () => undefined
		const controller = createConversationController(
			createScriptedDriver(),
			store,
			{
				readReportedRuns: () =>
					new Promise((resolve) => {
						settleRead = resolve
					}),
			},
		)
		const opening = controller.open(conversation)

		const turnId = await controller.reportRun({
			conversationId: conversation.id,
			botId: bot.id,
			runtimeSessionId: "rs-1",
			text: "Two tickets closed.",
			routineTitle: "Nightly report",
			triggerSourceId: "schedule",
		})
		settleRead([REPORTED_EARLIER])
		await opening

		const { reportedCauses } = controller.getState()

		expect(reportedCauses.get(turnId)).toEqual({
			turnId,
			routineTitle: "Nightly report",
			triggerSourceId: "schedule",
		})
		expect(reportedCauses.get(REPORTED_EARLIER.turnId)).toEqual(
			REPORTED_EARLIER,
		)
	})
})

describe("a run report relaying the companions it names", () => {
	const draftFor = (conversationId: string, botId: string, text: string) => ({
		conversationId,
		botId,
		runtimeSessionId: "rs-report",
		text,
		routineTitle: "Nightly report",
		triggerSourceId: "schedule",
	})

	type Reporting = {
		driver: ScriptedDriver
		store: TranscriptStore
		controller: ConversationController
		conversation: Conversation
	}

	const createReporting = async (
		store: TranscriptStore = createFakeTranscriptStore(),
	): Promise<Reporting> => {
		const driver = createScriptedDriver()
		const bots = await seatBots(store, SPACE, ["Ada", "Nyx"])
		const conversation = await store.createConversation({
			spaceId: SPACE,
			sectionId: null,
			title: "Walls",
			botIds: bots.map((bot) => bot.id),
		})
		const controller = createConversationController(
			withFakeHostWrites(driver, store),
			store,
		)
		controller.attach()
		return { driver, store, controller, conversation }
	}

	it("summons the companion a report names in a conversation it never opened", async () => {
		const { driver, controller, conversation } = await createReporting()
		const ada = idOf(conversation, "Ada")
		const nyx = idOf(conversation, "Nyx")

		await controller.reportRun(
			draftFor(conversation.id, ada, "Walls are up. @Nyx and @Ada, read it."),
		)
		await settled()

		expect(driver.submissions.map(({ scope }) => scope.botId)).toEqual([nyx])
		expect(driver.submissions[0].prompt).toContain(`<@${nyx}>`)
	})

	it("stores the answer of a summoned companion outside the turn of the report", async () => {
		const { driver, store, controller, conversation } = await createReporting()
		const ada = idOf(conversation, "Ada")
		const nyx = idOf(conversation, "Nyx")

		const reportTurnId = await controller.reportRun(
			draftFor(conversation.id, ada, "Walls are up. @Nyx, read it."),
		)
		await settled()
		driver.pushTo(nyx, spoke(nyx, "read and noted"))
		await settled()

		const page = await store.loadPage(conversation.id, null)
		const answer = page.messages.find(({ authorBotId }) => authorBotId === nyx)
		expect(answer?.content).toBe("read and noted")
		expect(answer?.turnId).not.toBe(reportTurnId)
	})

	it("summons the companion a report names under a turn it stored and writes its answer there", async () => {
		const base = createFakeTranscriptStore()
		const startedTurnIds: string[] = []
		const { driver, store, controller, conversation } = await createReporting({
			...base,
			startTurn: (turn) => {
				startedTurnIds.push(turn.id)
				return base.startTurn(turn)
			},
		})
		const ada = idOf(conversation, "Ada")
		const nyx = idOf(conversation, "Nyx")

		await controller.reportRun(
			draftFor(conversation.id, ada, "Walls are up. @Nyx, read it."),
		)
		await settled()
		driver.pushTo(nyx, spoke(nyx, "read and noted"))
		await settled()

		const summonedTurnId = driver.submissions[0].turn?.turnId
		const page = await store.loadPage(conversation.id, null)
		const answer = page.messages.find(({ authorBotId }) => authorBotId === nyx)
		expect(startedTurnIds).toContain(summonedTurnId)
		expect(answer?.turnId).toBe(summonedTurnId)
	})

	it("summons nobody and shows the failure when the turn of the summons cannot be stored", async () => {
		const base = createFakeTranscriptStore()
		let starts = 0
		const { driver, controller, conversation } = await createReporting({
			...base,
			startTurn: (turn) => {
				starts += 1
				return starts === 1
					? base.startTurn(turn)
					: Promise.reject(new Error("refused"))
			},
		})
		const ada = idOf(conversation, "Ada")

		await controller.reportRun(
			draftFor(conversation.id, ada, "Walls are up. @Nyx, read it."),
		)
		await settled()

		expect(driver.submissions).toHaveLength(0)
		expect(controller.getState().latestError).not.toBe(null)
	})

	it("stores the report carrying the tokens of the companions it names", async () => {
		const { store, controller, conversation } = await createReporting()
		const ada = idOf(conversation, "Ada")
		const nyx = idOf(conversation, "Nyx")

		await controller.reportRun(
			draftFor(conversation.id, ada, "Walls are up. @Nyx, read it."),
		)
		await settled()

		const page = await store.loadPage(conversation.id, null)
		expect(page.messages.map(({ content }) => content)).toContain(
			`Walls are up. <@${nyx}>, read it.`,
		)
	})

	it("writes the report and summons nobody when the conversation cannot be read", async () => {
		const base = createFakeTranscriptStore()
		const { driver, store, controller, conversation } = await createReporting({
			...base,
			spaces: () => Promise.reject(new Error("refused")),
		})
		const ada = idOf(conversation, "Ada")

		await controller.reportRun(
			draftFor(conversation.id, ada, "Walls are up. @Nyx, read it."),
		)
		await settled()

		const page = await store.loadPage(conversation.id, null)
		expect(page.messages.map(({ content }) => content)).toContain(
			"Walls are up. @Nyx, read it.",
		)
		expect(driver.submissions).toHaveLength(0)
	})

	it("leaves the queue untouched when a report names no seated companion", async () => {
		const { driver, controller, conversation } = await createReporting()
		const ada = idOf(conversation, "Ada")

		await controller.reportRun(draftFor(conversation.id, ada, "Walls are up."))
		await settled()

		expect(driver.submissions).toHaveLength(0)
		expect(controller.getState().waitingBotIds).toEqual([])
	})

	it("keeps the turn of a send that lands while the turn of the summons is stored", async () => {
		const base = createFakeTranscriptStore()
		let releaseReport = () => {}
		const { driver, controller, conversation } = await createReporting({
			...base,
			completeTurn: (id, completedAt) =>
				new Promise((resolve) => {
					releaseReport = () => resolve(base.completeTurn(id, completedAt))
				}),
		})
		const ada = idOf(conversation, "Ada")
		const nyx = idOf(conversation, "Nyx")
		await controller.open(conversation)

		const reporting = controller.reportRun(
			draftFor(conversation.id, ada, "Walls are up. @Nyx, read it."),
		)
		await settled()
		const sending = controller.send("@Ada take the walls")
		await settled()
		releaseReport()
		await Promise.all([reporting, sending])
		await settled()
		driver.pushTo(ada, spoke(ada, "walls done"))
		await settled()

		const sent = controller
			.getState()
			.messages.find(({ role }) => role === "user")
		expect(
			driver.submissions.map(({ scope, turn }) => [scope.botId, turn?.turnId]),
		).toEqual([
			[ada, sent?.turnId],
			[nyx, sent?.turnId],
		])
	})

	it("holds the summons of a report for the wave after the one running", async () => {
		const { driver, controller, conversation } = await createReporting()
		const ada = idOf(conversation, "Ada")
		const nyx = idOf(conversation, "Nyx")
		await controller.open(conversation)
		await controller.send("@Ada take the walls")
		await settled()

		await controller.reportRun(
			draftFor(conversation.id, ada, "Walls are up. @Nyx, read it."),
		)
		await settled()

		expect(runningIn(controller)).toEqual([ada])
		expect(controller.getState().waitingBotIds).toEqual([nyx])

		driver.pushTo(ada, spoke(ada, "walls done"))
		await settled()

		expect(driver.submissions.map(({ scope }) => scope.botId)).toEqual([
			ada,
			nyx,
		])
	})
})
describe("a conversation landed away from its newest end", () => {
	const LANDED_SEQ = 40

	const MESSAGES = 80

	const writeLines = async (store: TranscriptStore, conversationId: string) => {
		for (let line = 1; line <= MESSAGES; line += 1) {
			await store.appendUserMessage({
				id: `m-${line}`,
				conversationId,
				turnId: `t-${line}`,
				authorBotId: null,
				repliedToMessageId: null,
				content: `line ${line}`,
				createdAt: line,
			})
		}
	}

	const landedOn = async (store: TranscriptStore) => {
		const conversation = await store.createConversation({
			spaceId: SPACE,
			sectionId: null,
			title: "Walls",
			botIds: [],
		})
		await writeLines(store, conversation.id)
		const controller = createConversationController(
			createScriptedDriver(),
			store,
		)
		const detach = controller.attach()
		await controller.open(conversation)
		await controller.landOn(LANDED_SEQ)
		return { controller, detach }
	}

	const refusingLatest = (): TranscriptStore => {
		const base = createFakeTranscriptStore()
		let hasOpened = false
		return {
			...base,
			loadPage: (conversationId, cursor) => {
				if (cursor) {
					return base.loadPage(conversationId, cursor)
				}
				if (hasOpened) {
					return Promise.reject(new Error("refused"))
				}
				hasOpened = true
				return base.loadPage(conversationId, null)
			},
		}
	}

	const refusingOlder = (): TranscriptStore => {
		const base = createFakeTranscriptStore()
		return {
			...base,
			loadPage: (conversationId, cursor) =>
				cursor
					? Promise.reject(new Error("refused"))
					: base.loadPage(conversationId, null),
		}
	}

	it("leaves a prompt unwritten and keeps its text when the newest page is refused", async () => {
		const { controller, detach } = await landedOn(refusingLatest())
		expect(controller.getState().hasNewer).toBe(true)

		await controller.send("hold the line")
		await settled()

		const state = controller.getState()
		expect(state.refusedMessage?.text).toBe("hold the line")
		expect(
			state.messages.some((held) => held.content === "hold the line"),
		).toBe(false)
		detach()
	})

	it("leaves a notice already on screen in place when it reads the newest page", async () => {
		const { controller, detach } = await landedOn(refusingOlder())

		await controller.loadOlder()
		const held = controller.getState().latestError
		expect(held?.error.kind).toBe("readFailed")

		await controller.send("hold the line")
		await settled()

		const state = controller.getState()
		expect(state.latestError).toBe(held)
		expect(
			state.messages.some((said) => said.content === "hold the line"),
		).toBe(true)
		detach()
	})
	const ASK: AgentEvent = {
		type: "questionRequested",
		request: {
			id: "ask-1",
			questions: [
				{
					header: "Walls",
					question: "Which wall?",
					options: [],
					multiSelect: false,
				},
			],
		},
	}

	const askedOn = async (store: TranscriptStore) => {
		const bots = await seatBots(store, SPACE, ["Nyx"])
		const conversation = await store.createConversation({
			spaceId: SPACE,
			sectionId: null,
			title: "Walls",
			botIds: bots.map((bot) => bot.id),
		})
		await writeLines(store, conversation.id)
		const driver = createScriptedDriver()
		const controller = createConversationController(driver, store)
		const detach = controller.attach()
		await controller.open(conversation)
		await controller.send("@Nyx hold the walls")
		await settled()
		driver.pushTo(bots[0].id, [ASK])
		await settled()
		await controller.landOn(LANDED_SEQ)
		return { controller, conversation, detach, driver }
	}

	const gatingLatest = () => {
		const base = createFakeTranscriptStore()
		let release: () => void = () => undefined
		const gate = new Promise<void>((resolve) => {
			release = resolve
		})
		let newestReads = 0
		const store: TranscriptStore = {
			...base,
			loadPage: async (conversationId, cursor) => {
				if (cursor) {
					return base.loadPage(conversationId, cursor)
				}
				newestReads += 1
				if (newestReads > 1) {
					await gate
				}
				return base.loadPage(conversationId, null)
			},
		}
		return { store, release }
	}

	it("leaves a question unanswered when the newest page is refused", async () => {
		const { controller, detach, driver } = await askedOn(refusingLatest())
		expect(controller.getState().hasNewer).toBe(true)

		await controller.answer("ask-1", { "Which wall?": "the north" })
		await settled()

		const state = controller.getState()
		expect(state.pendingPrompt).toMatchObject({ kind: "question" })
		expect(driver.answered).toEqual([])
		expect(state.messages.some((said) => said.content === "the north")).toBe(
			false,
		)
		detach()
	})

	it("answers on the newest page once it is read", async () => {
		const { controller, detach, driver } = await askedOn(
			createFakeTranscriptStore(),
		)

		await controller.answer("ask-1", { "Which wall?": "the north" })
		await settled()

		const state = controller.getState()
		expect(state.hasNewer).toBe(false)
		expect(driver.answered).toHaveLength(1)
		expect(state.messages.some((said) => said.content === "the north")).toBe(
			true,
		)
		detach()
	})
	it("writes no answer when the reader moved on before the newest page came", async () => {
		const { store, release } = gatingLatest()
		const { controller, conversation, detach, driver } = await askedOn(store)
		const elsewhere = await store.createConversation({
			spaceId: SPACE,
			sectionId: null,
			title: "Roof",
			botIds: [],
		})

		const answering = controller.answer("ask-1", { "Which wall?": "the north" })
		void controller.open(elsewhere)
		release()
		await answering
		await settled()

		expect(driver.answered).toEqual([])

		await controller.open(conversation)
		await settled()

		expect(
			controller
				.getState()
				.messages.some((said) => said.content === "the north"),
		).toBe(false)
		detach()
	})
})

describe("the arrivals a conversation hears announced", () => {
	const arrivalOf = (conversationId: string, id: string): CompanionArrival => ({
		id,
		conversationId,
		botId: "bot-2",
		invitedByBotId: null,
		lastMessageSeq: 0,
		createdAt: 0,
	})

	const openedHearingArrivals = async () => {
		const store = createFakeTranscriptStore()
		const conversation = await store.createConversation({
			spaceId: SPACE,
			sectionId: null,
			title: "Walls",
			botIds: [],
		})
		const listeners: ((arrival: CompanionArrival) => void)[] = []
		const unlisten = vi.fn()
		const controller = createConversationController(
			createScriptedDriver(),
			store,
			{
				onCompanionArrived: async (listener) => {
					listeners.push(listener)
					return unlisten
				},
			},
		)
		const detach = controller.attach()
		await controller.open(conversation)
		await settled()
		const announce = (arrival: CompanionArrival) => {
			for (const listener of listeners) {
				listener(arrival)
			}
		}
		return { controller, conversation, detach, unlisten, announce }
	}

	it("holds an arrival announced on the open conversation", async () => {
		const { controller, conversation, detach, announce } =
			await openedHearingArrivals()
		const arrival = arrivalOf(conversation.id, "a-1")

		announce(arrival)

		expect(controller.getState().arrivals).toEqual([arrival])
		detach()
	})

	it("ignores an arrival announced on another conversation", async () => {
		const { controller, detach, announce } = await openedHearingArrivals()

		announce(arrivalOf("c-elsewhere", "a-1"))

		expect(controller.getState().arrivals).toEqual([])
		detach()
	})

	it("stops listening for announced arrivals when it detaches", async () => {
		const { detach, unlisten } = await openedHearingArrivals()

		detach()
		await settled()

		expect(unlisten).toHaveBeenCalledTimes(1)
	})
})

describe("the mentions a finished turn carries", () => {
	const arrivalFor = (
		conversationId: string,
		botId: string,
	): CompanionArrival => ({
		id: `a-${botId}`,
		conversationId,
		botId,
		invitedByBotId: null,
		lastMessageSeq: 0,
		createdAt: 0,
	})

	const roomSeating = async () => {
		const store = createFakeTranscriptStore()
		const driver = createScriptedDriver()
		const [ada, iris] = await seatBots(store, SPACE, ["Ada", "Iris"])
		const conversation = await store.createConversation({
			spaceId: SPACE,
			sectionId: null,
			title: "Walls",
			botIds: [ada.id],
		})
		const listeners: ((arrival: CompanionArrival) => void)[] = []
		const controller = createConversationController(
			withFakeHostWrites(driver, store),
			store,
			{
				onCompanionArrived: async (listener) => {
					listeners.push(listener)
					return () => undefined
				},
			},
		)
		const detach = controller.attach()
		await controller.open(conversation)
		await settled()
		return {
			store,
			driver,
			controller,
			conversation,
			ada: ada.id,
			iris: iris.id,
			detach,
			seat: (botId: string) =>
				store.addConversationParticipant(conversation.id, botId),
			unseat: (botId: string) =>
				store.removeConversationParticipant(conversation.id, botId),
			announce: (botId: string) => {
				for (const listener of listeners) {
					listener(arrivalFor(conversation.id, botId))
				}
			},
			spoken: async (botId: string, text: string) => {
				driver.pushTo(botId, spoke(botId, text))
				await settled()
			},
			sent: async (text: string) => {
				await controller.send(text)
				await settled()
			},
		}
	}

	it("summons the companion seated during the turn the arrival announced", async () => {
		const room = await roomSeating()
		await room.sent("@Ada take the walls")
		await room.seat(room.iris)
		room.announce(room.iris)
		const read = vi.spyOn(room.store, "spaces")

		await room.spoken(room.ada, `over to <@${room.iris}>`)

		expect(submittedIn(room)).toEqual([room.ada, room.iris])
		expect(read).not.toHaveBeenCalled()
		room.detach()
	})

	it("reads the conversation once and summons the companion the store shows seated", async () => {
		const room = await roomSeating()
		await room.sent("@Ada take the walls")
		await room.seat(room.iris)

		await room.spoken(room.ada, `over to <@${room.iris}>`)

		expect(submittedIn(room)).toEqual([room.ada, room.iris])
		expect(room.controller.getState().unresolvedMentions).toEqual([])
		room.detach()
	})

	it("keeps the token no seat and no read answers, and names it raw", async () => {
		const room = await roomSeating()
		await room.sent("@Ada take the walls")

		await room.spoken(room.ada, "over to <@ghost>")

		expect(room.controller.getState().unresolvedMentions).toEqual([
			{ botId: "ghost", name: null },
		])
		room.detach()
	})

	it("names the companion the read knows but no longer shows seated", async () => {
		const room = await roomSeating()
		await room.seat(room.iris)
		await room.unseat(room.iris)
		await room.sent("@Ada take the walls")

		await room.spoken(room.ada, `over to <@${room.iris}>`)

		expect(room.controller.getState().unresolvedMentions).toEqual([
			{ botId: room.iris, name: "Iris" },
		])
		expect(submittedIn(room)).toEqual([room.ada])
		room.detach()
	})

	it("forgets an unresolved token when another conversation is opened", async () => {
		const room = await roomSeating()
		await room.sent("@Ada take the walls")
		await room.spoken(room.ada, "over to <@ghost>")
		const elsewhere = await room.store.createConversation({
			spaceId: SPACE,
			sectionId: null,
			title: "Gates",
			botIds: [room.ada],
		})

		await room.controller.open(elsewhere)
		await settled()

		expect(room.controller.getState().unresolvedMentions).toEqual([])
		room.detach()
	})

	it("forgets an arrival when another conversation is opened", async () => {
		const room = await roomSeating()
		await room.seat(room.iris)
		room.announce(room.iris)
		const elsewhere = await room.store.createConversation({
			spaceId: SPACE,
			sectionId: null,
			title: "Gates",
			botIds: [room.ada],
		})
		await room.controller.open(elsewhere)
		await room.controller.open(room.conversation)
		await settled()
		await room.sent("@Ada take the walls")
		const read = vi.spyOn(room.store, "spaces")

		await room.spoken(room.ada, `over to <@${room.iris}>`)

		expect(read).toHaveBeenCalled()
		room.detach()
	})

	it("drops the notice of the unresolved tokens the reader closes", async () => {
		const room = await roomSeating()
		await room.sent("@Ada take the walls")
		await room.spoken(room.ada, "over to <@ghost>")

		room.controller.dismissUnresolvedMentions()

		expect(room.controller.getState().unresolvedMentions).toEqual([])
		room.detach()
	})

	it("opens no turn for a relayed report naming only companions nobody answers", async () => {
		const room = await roomSeating()
		const started = vi.spyOn(room.store, "startTurn")

		await room.controller.relaySpoken({
			conversationId: room.conversation.id,
			authorBotId: room.ada,
			text: "Walls are up. <@ghost>, read it.",
		})
		await settled()

		expect(started).toHaveBeenCalledTimes(1)
		expect(submittedIn(room)).toEqual([])
		room.detach()
	})

	it("replaces the name of an unresolved token once a read answers one", async () => {
		const room = await roomSeating()
		await room.sent("@Ada take the walls")
		await room.spoken(room.ada, `over to <@${room.iris}>`)

		expect(room.controller.getState().unresolvedMentions).toEqual([
			{ botId: room.iris, name: null },
		])

		await room.seat(room.iris)
		await room.unseat(room.iris)
		await room.sent("@Ada again")
		await room.spoken(room.ada, `still <@${room.iris}>`)

		expect(room.controller.getState().unresolvedMentions).toEqual([
			{ botId: room.iris, name: "Iris" },
		])
		room.detach()
	})

	it("summons through the store read the companion a relayed report names", async () => {
		const room = await roomSeating()
		await room.seat(room.iris)

		await room.controller.relaySpoken({
			conversationId: room.conversation.id,
			authorBotId: room.ada,
			text: `Walls are up. <@${room.iris}>, read it.`,
		})
		await settled()

		expect(submittedIn(room)).toEqual([room.iris])
		room.detach()
	})
})
