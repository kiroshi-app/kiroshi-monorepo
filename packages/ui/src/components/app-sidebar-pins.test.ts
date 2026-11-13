import { describe, expect, it } from "vitest"

import type {
	AppSidebarConversation,
	AppSidebarRowMission,
} from "@workspace/ui/components/app-sidebar-model"
import {
	conversationEntry,
	showsNeedsYou,
	waitingFirst,
} from "@workspace/ui/components/app-sidebar-pins"

const WAITING_MISSION: AppSidebarRowMission = {
	id: "mission",
	state: "waiting",
	ticket: { platform: "linear", externalId: "OPE-1", title: "Review" },
}

const roomOf = (
	id: string,
	held: Partial<AppSidebarConversation> = {},
): AppSidebarConversation => ({ id, name: id, participants: [], ...held })

const ENTRIES = [
	roomOf("quiet"),
	roomOf("asking", { pendingQuestion: "Ship it?" }),
	roomOf("flagged", { badge: "attention" }),
	roomOf("waiting", { missions: [WAITING_MISSION] }),
].map((room) => conversationEntry(room))

const idsOf = (entries: typeof ENTRIES) => entries.map(({ id }) => id)

describe("waitingFirst", () => {
	it("moves only the rows waiting on a mission ahead when nothing else leads", () => {
		expect(idsOf(waitingFirst(ENTRIES))).toEqual([
			"waiting",
			"quiet",
			"asking",
			"flagged",
		])
	})

	it("puts the rows that show Needs you ahead of the waiting ones when they lead", () => {
		expect(idsOf(waitingFirst(ENTRIES, showsNeedsYou))).toEqual([
			"asking",
			"flagged",
			"waiting",
			"quiet",
		])
	})
})
