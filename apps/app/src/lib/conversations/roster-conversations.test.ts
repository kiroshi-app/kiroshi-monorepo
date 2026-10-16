import { describe, expect, it } from "vitest"

import type { ActivityIndicatorKind } from "@workspace/ui/components/activity-indicator"
import { BLANK_BOT_PERMISSIONS } from "@workspace/ui/components/bot-settings"

import type {
	ConversationRosterActivity,
	ConversationWorker,
} from "./roster-conversations"
import {
	conversationName,
	mentionableBots,
	toConversationBots,
	toConversationSettingsValue,
	toRosterConversations,
	unseatedBots,
} from "./roster-conversations"
import type { Bot, Conversation, Participant } from "./store-contract"

const participant = (fields: Partial<Participant> = {}): Participant => ({
	botId: "b-1",
	role: "assistant",
	joinedAt: 1,
	leftAt: null,
	name: "Chef",
	avatarBlot: "cyan",
	avatarImagePath: null,
	isDeleted: false,
	...fields,
})

const conversation = (fields: Partial<Conversation> = {}): Conversation => ({
	id: "c-1",
	spaceId: "personal",
	sectionId: null,
	pinPosition: null,
	title: "Launch",
	instructions: "",
	icon: null,
	color: null,
	createdAt: 1,
	updatedAt: 1,
	participants: [participant()],
	...fields,
})

const NOW = Date.UTC(2025, 0, 2, 12, 0, 0)

const A_MINUTE_AGO = NOW - 60 * 1000

const working = (
	botId: string,
	kind: ActivityIndicatorKind,
): ConversationWorker => ({
	botId,
	kind,
})

const atRest = (
	previews: ConversationRosterActivity["previews"] = {},
): ConversationRosterActivity => ({ working: {}, previews })

describe("toRosterConversations", () => {
	it("draws a row carrying the title, the pin, the section and the participants in join order", () => {
		const rows = toRosterConversations(
			[
				conversation({
					sectionId: "n-1",
					pinPosition: 2,
					participants: [
						participant({ botId: "b-1", role: "lead", name: "Chef" }),
						participant({ botId: "b-2", name: "Sous-chef" }),
					],
				}),
			],
			atRest(),
			NOW,
		)

		expect(rows).toEqual([
			{
				id: "c-1",
				name: "Launch",
				sectionId: "n-1",
				pinPosition: 2,
				participants: [
					{
						id: "b-1",
						name: "Chef",
						blot: "cyan",
						image: undefined,
						status: "idle",
					},
					{
						id: "b-2",
						name: "Sous-chef",
						blot: "cyan",
						image: undefined,
						status: "idle",
					},
				],
				lastMessage: undefined,
				lastSpeaker: undefined,
				timestamp: undefined,
				lastActivityAt: 1,
				status: "idle",
			},
		])
	})

	it("leaves out a participant that has left the room", () => {
		const rows = toRosterConversations(
			[
				conversation({
					participants: [
						participant({ botId: "b-1" }),
						participant({ botId: "b-2", leftAt: 4 }),
					],
				}),
			],
			atRest(),
			NOW,
		)

		expect(rows[0].participants.map((held) => held.id)).toEqual(["b-1"])
	})

	it("previews the last word of the room and how long ago it was said", () => {
		const [row] = toRosterConversations(
			[conversation()],
			atRest({ "c-1": { text: "Menu is set.", at: A_MINUTE_AGO } }),
			NOW,
		)

		expect(row.lastMessage).toBe("Menu is set.")
		expect(row.timestamp).toBe("1m")
	})

	const speakerAfter = (
		participants: Participant[],
		authorBotId?: string,
	): string | undefined =>
		toRosterConversations(
			[conversation({ participants })],
			atRest({
				"c-1": { text: "Menu is set.", at: A_MINUTE_AGO, authorBotId },
			}),
			NOW,
		)[0].lastSpeaker

	it("names the companion still seated that said the last word", () => {
		expect(speakerAfter([participant({ botId: "b-1" })], "b-1")).toBe("Chef")
	})

	it("names nobody when the reader said the last word", () => {
		expect(speakerAfter([participant()])).toBeUndefined()
	})

	it("names nobody when the companion that spoke has left the room", () => {
		expect(speakerAfter([participant({ leftAt: 4 })], "b-1")).toBeUndefined()
	})

	it("names nobody when the companion that spoke no longer exists", () => {
		expect(
			speakerAfter([participant({ isDeleted: true })], "b-1"),
		).toBeUndefined()
	})

	it("keeps the last word of a deleted companion and drops it from the seats", () => {
		const [row] = toRosterConversations(
			[
				conversation({
					participants: [
						participant({ botId: "b-1", isDeleted: true }),
						participant({ botId: "b-2", name: "Sous-chef" }),
					],
				}),
			],
			atRest({
				"c-1": { text: "Menu is set.", at: A_MINUTE_AGO, authorBotId: "b-1" },
			}),
			NOW,
		)

		expect(row.participants.map((seat) => seat.id)).toEqual(["b-2"])
		expect(row.lastMessage).toBe("Menu is set.")
		expect(row.lastSpeaker).toBeUndefined()
	})

	it("leaves the preview and the time of a room nothing was said in blank", () => {
		const [row] = toRosterConversations([conversation()], atRest(), NOW)

		expect(row.lastMessage).toBeUndefined()
		expect(row.timestamp).toBeUndefined()
	})

	it("draws the room of the most recent word first", () => {
		const rows = toRosterConversations(
			[
				conversation({ id: "c-1" }),
				conversation({ id: "c-2" }),
				conversation({ id: "c-3" }),
			],
			atRest({
				"c-1": { text: "Older.", at: A_MINUTE_AGO - 1000 },
				"c-3": { text: "Newer.", at: A_MINUTE_AGO },
			}),
			NOW,
		)

		expect(rows.map((row) => row.id)).toEqual(["c-3", "c-1", "c-2"])
	})

	it("draws the room and the companion answering in it as working", () => {
		const [row] = toRosterConversations(
			[
				conversation({
					participants: [
						participant({ botId: "b-1" }),
						participant({ botId: "b-2", name: "Sous-chef" }),
					],
				}),
			],
			{ working: { "c-1": [working("b-2", "searching")] }, previews: {} },
			NOW,
		)

		expect(row.status).toBe("working")
		expect(row.participants.map((seat) => seat.status)).toEqual([
			"idle",
			"working",
		])
		expect(row.participants.map((seat) => seat.pose)).toEqual([
			undefined,
			"searching",
		])
	})

	it("draws the room of a companion waiting its turn as working", () => {
		const [row] = toRosterConversations(
			[conversation()],
			{ working: { "c-1": [working("b-1", "waiting")] }, previews: {} },
			NOW,
		)

		expect(row.status).toBe("working")
	})

	it("draws a room nobody is answering in at rest", () => {
		const [row] = toRosterConversations(
			[conversation()],
			{ working: { "c-1": [] }, previews: {} },
			NOW,
		)

		expect(row.status).toBe("idle")
		expect(row.participants.map((seat) => seat.status)).toEqual(["idle"])
	})

	it("dates a room nothing was said in by the day it was opened", () => {
		const rows = toRosterConversations(
			[
				conversation({ id: "c-1", createdAt: A_MINUTE_AGO }),
				conversation({ id: "c-2", createdAt: NOW }),
			],
			atRest(),
			NOW,
		)

		expect(rows.map((row) => row.id)).toEqual(["c-2", "c-1"])
	})
})

const bot = (fields: Partial<Bot> = {}): Bot => ({
	id: "b-1",
	name: "Chef",
	title: "",
	model: "sonnet",
	avatarBlot: "cyan",
	avatarImagePath: null,
	instructions: "",
	deniedTools: [],
	permissions: BLANK_BOT_PERMISSIONS,
	outputStyle: "",
	effort: null,
	createdAt: 1,
	changesNothing: false,
	memory: "",
	sectionId: null,
	pinPosition: null,
	...fields,
})

describe("unseatedBots", () => {
	it("offers only the companions of the space that hold no seat", () => {
		const offered = unseatedBots(
			[bot({ id: "b-1" }), bot({ id: "b-2", name: "Sous-chef" })],
			conversation({ participants: [participant({ botId: "b-1" })] }),
		)

		expect(offered).toEqual([
			{
				id: "b-2",
				name: "Sous-chef",
				blot: "cyan",
				image: undefined,
			},
		])
	})

	it("offers a dismissed companion again", () => {
		const offered = unseatedBots(
			[bot({ id: "b-1" })],
			conversation({
				participants: [participant({ botId: "b-1", leftAt: 4 })],
			}),
		)

		expect(offered.map((held) => held.id)).toEqual(["b-1"])
	})
})

describe("toConversationBots", () => {
	it("puts the title of the companion's Bot record on its row", () => {
		const [row] = toConversationBots(
			[participant({ botId: "b-1" })],
			[bot({ id: "b-1", title: "Head chef" })],
		)

		expect(row?.title).toBe("Head chef")
	})

	it("puts no title on the row of an untitled companion", () => {
		const [row] = toConversationBots(
			[participant({ botId: "b-1" })],
			[bot({ id: "b-1", title: "" })],
		)

		expect(row?.title).toBeUndefined()
	})
})

describe("mentionableBots", () => {
	const seatedChef = participant({ botId: "b-1" })

	it("puts each title on a seated row and on an outside row", () => {
		const rows = mentionableBots(
			[
				bot({ id: "b-1", title: "Head chef" }),
				bot({ id: "b-2", name: "Sous-chef", title: "Saucier" }),
			],
			conversation({ participants: [seatedChef] }),
		)

		expect(rows.map(({ id, title }) => ({ id, title }))).toEqual([
			{ id: "b-1", title: "Head chef" },
			{ id: "b-2", title: "Saucier" },
		])
	})

	it("puts no title on the rows of untitled companions", () => {
		const rows = mentionableBots(
			[bot({ id: "b-1" }), bot({ id: "b-2", name: "Sous-chef" })],
			conversation({ participants: [seatedChef] }),
		)

		expect(rows.map((row) => row.title)).toEqual([undefined, undefined])
	})
})

describe("toConversationSettingsValue", () => {
	it("reads the name and the instructions the conversation carries", () => {
		expect(
			toConversationSettingsValue(
				conversation({ title: "Launch", instructions: "Stay short." }),
			),
		).toEqual({ name: "Launch", instructions: "Stay short." })
	})
})

describe("conversationName", () => {
	it("calls a nameless conversation by the names of the companions seated in it", () => {
		expect(
			conversationName(
				conversation({
					title: "",
					participants: [
						participant({ botId: "b-1", name: "Chef" }),
						participant({ botId: "b-2", name: "Sous-chef" }),
					],
				}),
			),
		).toBe("Chef, Sous-chef")
	})

	it("leaves out of the name a companion that has left the conversation", () => {
		expect(
			conversationName(
				conversation({
					title: "",
					participants: [
						participant({ botId: "b-1", name: "Chef" }),
						participant({ botId: "b-2", name: "Sous-chef", leftAt: 4 }),
					],
				}),
			),
		).toBe("Chef")
	})

	it("falls back on the untitled copy when no companion is seated", () => {
		expect(
			conversationName(conversation({ title: "", participants: [] })),
		).toBe("Untitled conversation")
	})

	it("keeps the name a conversation carries", () => {
		expect(conversationName(conversation())).toBe("Launch")
	})
})
