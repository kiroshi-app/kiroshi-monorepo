import { afterAll, afterEach, describe, expect, it } from "bun:test"
import {
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import conversationIcons from "@workspace/shared/conversation-icons.json"

import { type AttachScope, companionTools } from "./companion-tools"

import type { SessionFrame } from "../provider"
import {
	closeHostChannel,
	type HostError,
	openHostChannel,
	settleHostAnswer,
} from "../../host"

const SESSION = "k1"

const HOME = realpathSync(mkdtempSync(join(tmpdir(), "kiroshi-attach-")))

const SCOPE: AttachScope = {
	cwd: HOME,
	floor: { home: HOME, platform: "darwin", pluginPaths: [], writablePaths: [] },
}

const SHOWN = join(HOME, "shown.png")

const SECRET = join(HOME, ".ssh", "key.png")

const DISGUISED = join(HOME, "disguised.png")

mkdirSync(join(HOME, ".ssh"))
writeFileSync(SHOWN, "image")
writeFileSync(SECRET, "secret")
symlinkSync(SECRET, DISGUISED)

const NAMES_A_MOMENT = /\b(before|once)\b/

const A_SUGGESTION = {
	id: "writer",
	name: "Quill",
	job: "a writing partner",
	description: "Help me draft, tighten and polish what I write.",
	blurb: "Drafts, edits and keeps your voice.",
}

const A_DRAFT = {
	name: "Quill",
	job: "a writing partner",
	description: "Help me draft, tighten and polish what I write.",
}

const A_REFUSAL = {
	kind: "conversationWithoutSpace",
	conversationId: "c1",
}

type Asked = { subtype: string; operation: string; payload: unknown }

type Served = { result?: unknown; error?: HostError }

const calls: [string, Record<string, unknown>, string][] = [
	["companion_suggestions", {}, "suggestions"],
	["companion_create", A_DRAFT, "create"],
	["companion_first_run_done", {}, "firstRunDone"],
	["companion_invite", { companion: "Quill" }, "invite"],
	["companion_invite", { companion: "Quill", conversation: "c2" }, "invite"],
	[
		"conversation_open",
		{ title: "Trip", icon: "Rocket", with: ["Quill"], message: "Where to?" },
		"conversationOpen",
	],
	[
		"conversation_say",
		{ conversation: "c3", message: "Where to?" },
		"conversationSay",
	],
	[
		"conversation_describe",
		{ conversation: "c3", icon: "Rocket", colour: null },
		"conversationDescribe",
	],
]

const answers: Record<string, unknown> = {
	suggestions: [A_SUGGESTION],
	create: { id: "b2", name: "Quill" },
	firstRunDone: null,
	invite: { id: "b2", name: "Quill", alreadySeated: false },
	conversationOpen: {
		conversationId: "c3",
		title: "Trip",
		companions: [
			{ id: "b1", name: "Shoto" },
			{ id: "b2", name: "Quill" },
		],
	},
	conversationSay: { conversationId: "c3", title: "Trip" },
	conversationDescribe: {
		conversationId: "c3",
		title: "Trip",
		icon: "Rocket",
		colour: null,
	},
}

const NAMES_A_SEQUENCE = /\b(then|after|first|next|once|until)\b/i

const aHost = (served: (asked: Asked) => Served) => {
	const asked: Asked[] = []
	openHostChannel(SESSION, (frame: SessionFrame) => {
		const { requestId, request } = frame as {
			requestId: string
			request: Asked
		}
		asked.push(request)
		settleHostAnswer(SESSION, { requestId, ...served(request) })
	})
	return asked
}

const anAnsweringHost = () =>
	aHost((asked) => ({ result: answers[asked.operation] }))

const aRefusingHost = () => aHost(() => ({ error: A_REFUSAL }))

const toolNamed = (session: string | undefined, name: string) => {
	const found = companionTools(session, SCOPE).find(
		(held) => held.name === name,
	)
	if (!found) {
		throw new Error(`the server carries no tool named ${name}`)
	}
	return found
}

const called = async (
	name: string,
	input: Record<string, unknown>,
	session: string | undefined = SESSION,
) => toolNamed(session, name).handler(input, undefined)

const spoken = (result: Awaited<ReturnType<typeof called>>) =>
	JSON.parse((result.content[0] as { text: string }).text) as unknown

afterEach(() => {
	closeHostChannel(SESSION)
})

afterAll(() => {
	rmSync(HOME, { recursive: true, force: true })
})

describe("companionTools", () => {
	it("takes neither a conversation id nor a space id from the agent", () => {
		for (const held of companionTools(SESSION, SCOPE)) {
			expect(Object.keys(held.inputSchema)).not.toContain("conversationId")
			expect(Object.keys(held.inputSchema)).not.toContain("spaceId")
		}
	})

	it("describes each tool in one sentence naming when to call it", () => {
		for (const held of companionTools(SESSION, SCOPE)) {
			expect(held.description.split(". ")).toHaveLength(1)
			expect(held.description).toMatch(NAMES_A_MOMENT)
		}
	})

	it("takes the companion to invite and an optional room and names no sequence of work", () => {
		const invite = toolNamed(SESSION, "companion_invite")

		expect(Object.keys(invite.inputSchema)).toEqual([
			"companion",
			"conversation",
		])
		expect(invite.description).toMatch(/\bbefore\b/)
		expect(invite.description).not.toMatch(NAMES_A_SEQUENCE)
	})

	it("takes the title, the icon, the companions and the message of the room it opens", () => {
		const open = toolNamed(SESSION, "conversation_open")

		expect(Object.keys(open.inputSchema)).toEqual([
			"title",
			"icon",
			"with",
			"message",
		])
	})

	it("requires the icon of the room it opens, described with a listed example and the list file", () => {
		const { icon } = toolNamed(SESSION, "conversation_open").inputSchema
		const example = icon?.description?.match(/such as (\w+)/)?.[1] ?? ""

		expect(icon?.safeParse(undefined).success).toBe(false)
		expect(icon?.safeParse("Rocket").success).toBe(true)
		expect(conversationIcons).toContain(example)
		expect(icon?.description).toContain(
			"packages/shared/conversation-icons.json",
		)
	})

	it("takes the room it speaks in and the message it says there, naming no sequence of work", () => {
		const say = toolNamed(SESSION, "conversation_say")

		expect(Object.keys(say.inputSchema)).toEqual(["conversation", "message"])
		for (const described of [
			say.description,
			...Object.values(say.inputSchema).map((held) => held.description),
		]) {
			expect(described).not.toMatch(NAMES_A_SEQUENCE)
		}
	})

	it("takes the room it describes, an optional icon and an optional colour naming the eight", () => {
		const describe = toolNamed(SESSION, "conversation_describe")
		const { icon, colour } = describe.inputSchema

		expect(Object.keys(describe.inputSchema)).toEqual([
			"conversation",
			"icon",
			"colour",
		])
		expect(icon?.safeParse(undefined).success).toBe(true)
		expect(colour?.safeParse(null).success).toBe(true)
		expect(colour?.safeParse(undefined).success).toBe(true)
		for (const name of [
			"red",
			"yellow",
			"green",
			"cyan",
			"blue",
			"purple",
			"pink",
			"orange",
		]) {
			expect(colour?.description).toContain(name)
		}
	})

	it("describes the icon with a listed example and the file the list is read from", () => {
		const { icon } = toolNamed(SESSION, "conversation_describe").inputSchema
		const example = icon?.description?.match(/such as (\w+)/)?.[1] ?? ""

		expect(conversationIcons).toContain(example)
		expect(icon?.description).toContain(
			"packages/shared/conversation-icons.json",
		)
	})

	it("hands each call to the host of its session and speaks the answer back", async () => {
		for (const [name, input, operation] of calls) {
			const asked = anAnsweringHost()

			const result = await called(name, input)

			expect(asked).toEqual([
				{ subtype: "companion", operation, payload: input },
			])
			expect(spoken(result)).toEqual(answers[operation])
			expect(result.isError).toBeUndefined()
			closeHostChannel(SESSION)
		}
	})

	it("speaks a refusal back as the result of the call and ends nothing", async () => {
		for (const [name, input] of calls) {
			aRefusingHost()

			const result = await called(name, input)

			expect(spoken(result)).toEqual(A_REFUSAL)
			expect(result.isError).toBe(true)
			closeHostChannel(SESSION)
		}
	})

	it("refuses a call carried by a session that holds no channel", async () => {
		const result = await called("companion_suggestions", {}, undefined)

		expect(spoken(result)).toMatchObject({ kind: "undeliverable" })
		expect(result.isError).toBe(true)
	})

	it("hands the host the resolved path of the image, with its caption", async () => {
		const asked = aHost(() => ({
			result: { path: "/stored.png", conversationId: "c1" },
		}))

		const result = await called("conversation_attach", {
			path: "shown.png",
			caption: "The chart",
		})

		expect(asked).toEqual([
			{
				subtype: "companion",
				operation: "conversationAttach",
				payload: { path: SHOWN, caption: "The chart" },
			},
		])
		expect(result.isError).toBeUndefined()
	})

	it("refuses a path the floor denies, symlinks resolved, without asking the host", async () => {
		for (const path of [SECRET, DISGUISED]) {
			const asked = anAnsweringHost()

			const result = await called("conversation_attach", { path })

			expect(asked).toEqual([])
			expect(spoken(result)).toEqual({ kind: "deniedPath", path })
			expect(result.isError).toBe(true)
			closeHostChannel(SESSION)
		}
	})

	it("refuses a missing file naming its path without asking the host", async () => {
		const asked = anAnsweringHost()

		const result = await called("conversation_attach", { path: "gone.png" })

		expect(asked).toEqual([])
		expect(spoken(result)).toMatchObject({
			kind: "unreadableFile",
			path: "gone.png",
		})
		expect(result.isError).toBe(true)
	})
})
