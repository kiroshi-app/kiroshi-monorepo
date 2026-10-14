import { invoke } from "@tauri-apps/api/core"
import { beforeEach, expect, it, vi } from "vitest"

import type { Catalogue, CatalogueChat } from "./catalogue-contract"
import { catalogueTransport } from "./catalogue-transport"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))

const hostInvoke = vi.mocked(invoke)

const A_CHAT: CatalogueChat = {
	conversationId: "c-1",
	kind: "main",
	title: "Amélie",
	botId: "b-1",
	participants: [],
	spaceId: "personal",
}

const A_CATALOGUE: Catalogue = {
	chats: [A_CHAT],
	missions: [
		{
			id: "m-1",
			threadConversationId: "c-2",
			objective: "Fix the crash on open",
			ticketPlatform: "github",
			ticketExternalId: "OPE-42",
			ticketTitle: "Crash on open",
			state: "working",
			botId: "b-1",
			spaceId: "personal",
		},
	],
	routines: [
		{
			id: "r-1",
			conversationId: "c-1",
			botId: "b-1",
			title: "Nightly report",
			triggerSourceId: "schedule",
			isEnabled: true,
			expression: "0 9 * * *",
			spaceId: "personal",
		},
	],
}

beforeEach(() => {
	hostInvoke.mockReset()
})

it("searches the catalogue of one space from the host", async () => {
	hostInvoke.mockResolvedValueOnce(A_CATALOGUE)

	await expect(
		catalogueTransport.search({ query: "crash", spaceId: "personal" }),
	).resolves.toEqual(A_CATALOGUE)

	expect(hostInvoke).toHaveBeenCalledWith("search_catalogue", {
		query: "crash",
		spaceId: "personal",
	})
})

it("reads the recent chats of a space from the host", async () => {
	hostInvoke.mockResolvedValueOnce([A_CHAT])

	await expect(
		catalogueTransport.recent({ spaceId: "personal" }),
	).resolves.toEqual([A_CHAT])

	expect(hostInvoke).toHaveBeenCalledWith("search_recent", {
		spaceId: "personal",
	})
})

it("lets the error of a query over the limit reach the caller", async () => {
	hostInvoke.mockRejectedValueOnce({ kind: "queryTooLong", limit: 200 })

	await expect(
		catalogueTransport.search({
			query: "a".repeat(201),
			spaceId: "personal",
		}),
	).rejects.toEqual({ kind: "queryTooLong", limit: 200 })
})
