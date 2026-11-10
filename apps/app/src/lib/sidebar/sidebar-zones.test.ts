import { describe, expect, it } from "vitest"

import type { AppSidebarConversation } from "@workspace/ui/components/app-sidebar-model"

import { sidebarZonesOf } from "./sidebar-zones"

const conversationOf = (
	id: string,
	pin: Pick<AppSidebarConversation, "pinPosition" | "sectionId"> = {},
): AppSidebarConversation => ({ id, name: id, participants: [], ...pin })

const CLIENTS = { id: "clients", name: "Clients", position: 1 }

const REVIEW = { id: "review", name: "Review", position: 3 }

const shapeOf = (zones: ReturnType<typeof sidebarZonesOf>) =>
	zones.map(({ name, conversations }) => ({
		name,
		ids: conversations.map(({ id }) => id),
	}))

describe("sidebarZonesOf", () => {
	it("lays the pinned runs, each section and then the unpinned conversations out in the pinned order", () => {
		const zones = sidebarZonesOf({
			conversations: [
				conversationOf("hiring"),
				conversationOf("design", { pinPosition: 0 }),
				conversationOf("billing", { pinPosition: 0, sectionId: "clients" }),
				conversationOf("roadmap", { pinPosition: 2 }),
				conversationOf("launch", { pinPosition: 4 }),
				conversationOf("pricing"),
			],
			sections: [REVIEW, CLIENTS],
		})

		expect(shapeOf(zones)).toEqual([
			{ name: undefined, ids: ["design"] },
			{ name: "Clients", ids: ["billing"] },
			{ name: undefined, ids: ["roadmap"] },
			{ name: "Review", ids: [] },
			{ name: undefined, ids: ["launch"] },
			{ name: undefined, ids: ["hiring", "pricing"] },
		])
	})

	it("keeps every conversation in one unnamed zone when nothing is pinned", () => {
		const zones = sidebarZonesOf({
			conversations: [conversationOf("hiring"), conversationOf("pricing")],
			sections: [],
		})

		expect(shapeOf(zones)).toEqual([
			{ name: undefined, ids: ["hiring", "pricing"] },
		])
	})

	it("leaves one empty zone when the Space holds no conversation", () => {
		expect(
			shapeOf(sidebarZonesOf({ conversations: [], sections: [] })),
		).toEqual([{ name: undefined, ids: [] }])
	})
})
