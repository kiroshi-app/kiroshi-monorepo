import { afterEach, describe, expect, it } from "bun:test"

import { z } from "zod"

import { missionTools } from "./mission-tools"

import type { SessionFrame } from "../provider"
import {
	closeHostChannel,
	type HostError,
	openHostChannel,
	settleHostAnswer,
} from "../../host"

const SESSION = "k1"

const A_MISSION = {
	id: "m1",
	originConversationId: "c1",
	botId: "b1",
	threadConversationId: "t1",
	state: "working",
}

const A_REFUSAL = {
	kind: "missionOfAnotherBot",
	id: "m1",
	botId: "b1",
}

type Asked = { subtype: string; operation: string; payload: unknown }

type Served = { result?: unknown; error?: HostError }

const A_TICKET = {
	platform: "linear",
	externalId: "OPE-26",
	url: "https://linear.test/OPE-26",
	title: "Mission tools",
}

const calls: [string, Record<string, unknown>, string][] = [
	[
		"mission_open",
		{
			objective: "Ship the tools",
			ticket: A_TICKET,
			tools: ["gh"],
			workspacePath: "/tmp/kiroshi",
		},
		"open",
	],
	["mission_note", { id: "m1", line: "The host answers" }, "note"],
	["mission_status", { id: "m1", text: "Paused on the copy" }, "status"],
	[
		"mission_escalate",
		{ id: "m1", question: "Which platform?", reason: "The person decides" },
		"escalate",
	],
	[
		"mission_close",
		{ id: "m1", outcome: "done", summary: "The tools are served" },
		"close",
	],
	[
		"mission_watch",
		{
			id: "m1",
			branch: "feature/ope-37",
			repository: "shoto290/kiroshi-monorepo",
		},
		"watch",
	],
	["mission_list", {}, "list"],
	[
		"mission_list",
		{ conversation: "c2", space: true, state: "done", bot: "b2" },
		"list",
	],
	["mission_read", { id: "m1" }, "read"],
	["mission_reopen", { id: "m1" }, "reopen"],
	["mission_update", { id: "m1", objective: "Ship the tools twice" }, "update"],
	["mission_handoff", { id: "m1", companion: "Second" }, "handoff"],
]

const answers: Record<string, unknown> = {
	open: {
		mission: A_MISSION,
		reach: "no coding session reaches this mission",
		carriesOn:
			"the work of this mission carries on in the thread this answer names",
		acknowledge: "end the turn you are answering in with a single line",
	},
	note: A_MISSION,
	status: {
		...A_MISSION,
		status: { text: "Paused on the copy", writtenAt: 2 },
	},
	escalate: { ...A_MISSION, state: "waiting_human" },
	close: { ...A_MISSION, state: "done" },
	watch: {
		mission: A_MISSION,
		url: "http://127.0.0.1:7788/hooks/mission",
		key: "a-key",
		header: "x-kiroshi-key",
	},
	list: [
		{
			id: "m1",
			ticket: A_TICKET,
			state: "working",
			botId: "b1",
			botName: "First",
			originConversationId: "c1",
			threadConversationId: "t1",
			openedAt: 1,
			closedAt: null,
			status: null,
		},
	],
	read: {
		...A_MISSION,
		objective: "Ship the tools",
		ticket: A_TICKET,
		botName: "First",
		branch: "feature/ope-37",
		repository: "shoto290/kiroshi-monorepo",
		pullRequestUrl: null,
		openedAt: 1,
		closedAt: null,
		status: null,
		events: [],
	},
	reopen: A_MISSION,
	update: { ...A_MISSION, objective: "Ship the tools twice" },
	handoff: { ...A_MISSION, botId: "b2" },
}

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
	const found = missionTools(session).find((held) => held.name === name)
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

describe("missionTools", () => {
	it("serves the eleven mission tools under their own names", () => {
		expect(missionTools(SESSION).map((held) => held.name)).toEqual([
			"mission_open",
			"mission_note",
			"mission_status",
			"mission_escalate",
			"mission_close",
			"mission_watch",
			"mission_list",
			"mission_read",
			"mission_reopen",
			"mission_update",
			"mission_handoff",
		])
	})

	it("takes every field of mission_update but its id as optional", () => {
		const updated = z.toJSONSchema(
			z.object(toolNamed(SESSION, "mission_update").inputSchema),
		)

		expect(updated.required).toEqual(["id"])
		expect(Object.keys(updated.properties ?? {})).toEqual([
			"id",
			"objective",
			"ticket",
			"tools",
		])
	})

	it("names the companion a mission is handed to, never a bot id", () => {
		expect(
			Object.keys(toolNamed(SESSION, "mission_handoff").inputSchema),
		).toEqual(["id", "companion"])
	})

	it("tells the agent only a git checkout is taken as the workspace a mission opens on", () => {
		const opened = z.toJSONSchema(
			z.object(toolNamed(SESSION, "mission_open").inputSchema),
		)

		const said = JSON.stringify(opened.properties?.workspacePath)

		expect(said).toContain("git checkout")
		expect(said).toContain("linked worktree")
		expect(said).not.toMatch(/superset/i)
	})

	it("tells the agent the work of a mission carries on in the thread it opens", () => {
		const said = toolNamed(SESSION, "mission_open").description

		expect(said).toContain("carries on in the thread")
		expect(said).toContain("single line of acknowledgement")
	})

	it("takes no workspace path on mission_watch", () => {
		expect(
			Object.keys(toolNamed(SESSION, "mission_watch").inputSchema),
		).not.toContain("workspacePath")
	})

	it("describes each mission tool without naming another one as a step", () => {
		for (const held of missionTools(SESSION)) {
			const said = `${held.description} ${JSON.stringify(
				z.toJSONSchema(z.object(held.inputSchema)),
			)}`

			const named = said.match(/mission_[a-z]+/g) ?? []

			expect(named.filter((one) => one !== held.name)).toEqual([])
		}
	})

	it("words the mission tools of the objective and names no tool it runs with", () => {
		const NAMED_TOOLS =
			/\b(github|gitlab|linear|jira|slack|notion|gh\b|repository|repositories|branch|pull request|review|reviews|merge|merged)\b/i

		for (const name of [
			"mission_open",
			"mission_note",
			"mission_status",
			"mission_escalate",
			"mission_close",
			"mission_list",
		]) {
			const held = toolNamed(SESSION, name)
			const said = `${held.description} ${JSON.stringify(
				z.toJSONSchema(z.object(held.inputSchema)),
			)}`

			expect(said).not.toMatch(NAMED_TOOLS)
		}
	})

	it("tells the agent the status is written when it stops working, for a reader who saw none of the work", () => {
		const held = toolNamed(SESSION, "mission_status")
		const said = `${held.description} ${JSON.stringify(
			z.toJSONSchema(z.object(held.inputSchema)),
		)}`

		expect(held.description).toContain("every time you stop working on it")
		expect(held.description).toContain("the conversation the mission came from")
		expect(held.description).toContain("saw none of the work")
		expect(said).not.toMatch(/ticket|pull request|merge/i)
	})

	it("keeps mission_watch naming the branch and the repository it watches", () => {
		const held = toolNamed(SESSION, "mission_watch")
		const said = `${held.description} ${JSON.stringify(
			z.toJSONSchema(z.object(held.inputSchema)),
		)}`

		expect(said).toContain("branch")
		expect(said).toContain("repository")
	})

	it("lets mission_list narrow on a conversation, the space, a state and a companion, each optional", () => {
		const listed = z.toJSONSchema(
			z.object(toolNamed(SESSION, "mission_list").inputSchema),
		)

		expect(Object.keys(listed.properties ?? {})).toEqual([
			"conversation",
			"space",
			"state",
			"bot",
		])
		expect(listed.required ?? []).toEqual([])
		expect(JSON.stringify(listed.properties?.state)).toContain("ready_to_merge")
	})

	it("tells the agent mission_read answers the whole of one mission, its lines included", () => {
		const said = toolNamed(SESSION, "mission_read").description

		expect(said).toContain("whoever carries it")
		expect(said).toContain("every line written on it")
	})

	it("tells the agent a failed outcome gives the objective up", () => {
		const closed = z.toJSONSchema(
			z.object(toolNamed(SESSION, "mission_close").inputSchema),
		)

		expect(JSON.stringify(closed.properties?.outcome)).toContain("given up")
	})

	it("takes neither a conversation nor a bot from the agent", () => {
		for (const held of missionTools(SESSION)) {
			expect(Object.keys(held.inputSchema)).not.toContain("conversationId")
			expect(Object.keys(held.inputSchema)).not.toContain("botId")
		}
	})

	it("hands each call to the host of its session and speaks the answer back", async () => {
		for (const [name, input, operation] of calls) {
			const asked = anAnsweringHost()

			const result = await called(name, input)

			expect(asked).toEqual([{ subtype: "mission", operation, payload: input }])
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
		const result = await called(
			"mission_note",
			{ id: "m1", line: "x" },
			undefined,
		)

		expect(spoken(result)).toMatchObject({ kind: "undeliverable" })
		expect(result.isError).toBe(true)
	})
})
