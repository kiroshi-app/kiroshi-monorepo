import { describe, expect, it } from "vitest"

import { aMission } from "./mission-fixtures"
import {
	missionsPageStatusOf,
	toMissionsPageMissions,
} from "./missions-page-model"

import type { Conversation } from "@/lib/conversations/store-contract"

const ADA = { id: "bot-1", name: "Ada", blot: 4, image: "/ada.png" }

const DESK = { id: "desk", icon: "Rocket" } as Conversation

describe("the missions the Missions page lists", () => {
	it("reads ticket, state, conversation, agent, last move and pull request", () => {
		const [row] = toMissionsPageMissions({
			entries: [
				{
					mission: aMission({
						liveness: "needs_you",
						lastActivityAt: 40,
						pullRequestUrl: "https://github.com/kiroshi/app/pull/12",
					}),
					conversationId: "desk",
					conversationTitle: "Desk",
				},
			],
			faceOf: (botId) => (botId === ADA.id ? ADA : undefined),
			conversations: [DESK],
		})

		expect(row).toMatchObject({
			identifier: aMission().ticket.externalId,
			title: aMission().ticket.title,
			state: "waiting_human",
			conversation: { title: "Desk", icon: "Rocket" },
			agent: { id: "bot-1", name: "Ada", hue: 4, image: "/ada.png" },
			updatedAt: 40,
			pullRequest: { number: 12 },
		})
	})

	it("titles a mission with no ticket title by its objective", () => {
		const [row] = toMissionsPageMissions({
			entries: [
				{
					mission: aMission({
						ticket: { ...aMission().ticket, title: "" },
					}),
					conversationId: "gone",
					conversationTitle: "Gone",
				},
			],
			faceOf: () => undefined,
			conversations: [],
		})

		expect(row?.title).toBe(aMission().objective)
		expect(row?.conversation.icon).toBe("MessageSquare")
		expect(row?.pullRequest).toBeUndefined()
	})
})

describe("the state of the Missions page", () => {
	it.each([
		{ isPending: true, hasFailed: false, status: "loading" },
		{ isPending: false, hasFailed: true, status: "failed" },
		{ isPending: false, hasFailed: false, status: "loaded" },
	])("reads $status from the feed", ({ status, ...feed }) => {
		expect(missionsPageStatusOf(feed)).toBe(status)
	})
})
