import { describe, expect, it } from "vitest"

import type { LibraryCommentAgent } from "@workspace/ui/components/library-comment-author"

import { workingAgentOf } from "./library-comment-views"

import type { LibraryCommentAgentTurn, LibraryCommentThread } from "../bindings"

const ATLAS: LibraryCommentAgent = {
	kind: "agent",
	id: "bot-atlas",
	name: "Atlas",
	blot: 210,
}

const JUNIPER: LibraryCommentAgent = {
	kind: "agent",
	id: "bot-juniper",
	name: "Juniper",
	blot: 130,
}

const AGENTS = [ATLAS, JUNIPER]

const threadOf = (
	id: string,
	state: LibraryCommentThread["state"] = "open",
): LibraryCommentThread => ({
	id,
	spaceId: "space-on-screen",
	itemName: "plan.md",
	anchor: { kind: "block", blockId: "intro1" },
	state,
	comments: [],
	targetMissing: false,
	resolvedBy: null,
	resolvedAt: null,
	lastBoardPoint: null,
})

const JUNIPER_ON_INTRO: LibraryCommentAgentTurn = {
	threadId: "thread-intro",
	agentId: JUNIPER.id,
	state: { kind: "working" },
}

describe("workingAgentOf", () => {
	it("names the agent whose turn works on the thread", () => {
		expect(
			workingAgentOf(threadOf("thread-intro"), [JUNIPER_ON_INTRO], AGENTS),
		).toEqual(JUNIPER)
	})

	it("names nobody on a thread no turn works on", () => {
		expect(
			workingAgentOf(threadOf("thread-budget"), [JUNIPER_ON_INTRO], AGENTS),
		).toBeUndefined()
	})

	it("names nobody on a resolved thread", () => {
		expect(
			workingAgentOf(
				threadOf("thread-intro", "resolved"),
				[JUNIPER_ON_INTRO],
				AGENTS,
			),
		).toBeUndefined()
	})

	it("names nobody when the working agent left the Space", () => {
		expect(
			workingAgentOf(threadOf("thread-intro"), [JUNIPER_ON_INTRO], [ATLAS]),
		).toBeUndefined()
	})
})
