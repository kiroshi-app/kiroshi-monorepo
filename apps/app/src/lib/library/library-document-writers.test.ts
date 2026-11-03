import { describe, expect, it } from "vitest"

import {
	type AgentSeat,
	seatsAfter,
	writersOf,
} from "./library-document-writers"

import type { LibraryWriter } from "../bindings"
import type { Bot } from "../conversations/store-contract"

const MARKDOWN =
	"Intro\n\n## Rollout\n\nWe ship in May. Then we listen! Then we tune"

const OFFSETS: Record<string, number> = {
	start: MARKDOWN.indexOf("Then"),
	end: MARKDOWN.length,
	top: 2,
}

const document = {
	markdown: MARKDOWN,
	offsetOf: (caret: string) => OFFSETS[caret] ?? null,
}

const agentWriter = (id: string, caret: string): LibraryWriter => ({
	id,
	kind: "agent",
	name: "Atlas from the host",
	caret,
})

const seatOf = (startCaret: string, caret: string): AgentSeat => ({
	id: "bot-atlas",
	name: "Atlas from the host",
	startCaret,
	caret,
	firstSeenAt: 1_000,
	lastSeenAt: 31_000,
})

const ATLAS = {
	id: "bot-atlas",
	name: "Atlas",
	avatarBlot: 210,
	avatarImagePath: null,
} as Bot

describe("the agent seats of a Library document", () => {
	it("keeps where and when an agent started while its caret moves on", () => {
		const first = seatsAfter([], [agentWriter("bot-atlas", "start")], 1_000)
		const next = seatsAfter(first, [agentWriter("bot-atlas", "end")], 31_000)

		expect(next).toEqual([seatOf("start", "end")])
	})

	it("seats only agents, never the person or a member", () => {
		const seats = seatsAfter(
			[],
			[
				{ id: "main", kind: "person", name: "Shoto", caret: "top" },
				{ id: "account", kind: "member", name: "Ines", caret: "top" },
			],
			0,
		)

		expect(seats).toEqual([])
	})
})

describe("the writers drawn in a Library document", () => {
	it("spans the text an agent wrote, under the heading it writes in, with its roster face", () => {
		const [writer] = writersOf({
			seats: [seatOf("start", "end")],
			bots: [ATLAS],
			document,
			title: "Plan",
		})

		expect(writer).toEqual({
			agent: { id: "bot-atlas", name: "Atlas", hue: 210, image: undefined },
			start: OFFSETS.start,
			end: OFFSETS.end,
			elapsedSeconds: 30,
			sentenceCount: 2,
			section: "Rollout",
		})
	})

	it("falls back on the document title above the first heading, and on the host's name for an agent off the roster", () => {
		const [writer] = writersOf({
			seats: [seatOf("top", "top")],
			bots: [],
			document,
			title: "Plan",
		})

		expect(writer?.section).toBe("Plan")
		expect(writer?.agent.name).toBe("Atlas from the host")
	})

	it("leaves out an agent whose caret stands on text not arrived yet", () => {
		expect(
			writersOf({
				seats: [seatOf("start", "unknown")],
				bots: [ATLAS],
				document,
				title: "Plan",
			}),
		).toEqual([])
	})
})
