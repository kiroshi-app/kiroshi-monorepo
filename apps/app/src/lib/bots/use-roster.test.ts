// @vitest-environment happy-dom

import { cleanup } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import { raiseFailureNotice } from "@workspace/ui/components/notice-surface"

import { newBotIdentity } from "./bot-settings"
import { mountRoster } from "./mounted-roster"

import { createFakeTranscriptStore } from "../conversations/fake-transcript-store"

vi.mock("@tauri-apps/api/event", () => ({
	listen: vi.fn(async () => () => undefined),
}))

vi.mock("@workspace/ui/components/notice-surface", async (importOriginal) => ({
	...(await importOriginal()),
	raiseFailureNotice: vi.fn(() => "notice-1"),
}))

afterEach(() => {
	cleanup()
	vi.mocked(raiseFailureNotice).mockClear()
})

const LOCAL = { spaceRowId: "personal", spaceId: "personal" }

const JOINED = { spaceRowId: "joined:garage", spaceId: "garage" }

it("raises a failure notice for the previews it could not read and keeps the roster", async () => {
	const store = createFakeTranscriptStore()
	vi.spyOn(store, "loadPage").mockRejectedValue(new Error("no record"))
	const roster = mountRoster(store)

	await roster.load({
		spaces: [LOCAL],
		spaceRowId: "personal",
		lastRowId: null,
	})

	await vi.waitFor(() =>
		expect(raiseFailureNotice).toHaveBeenCalledWith(
			expect.objectContaining({
				title: "Couldn’t load the latest messages. Restart Kiroshi to retry.",
			}),
		),
	)
	expect(roster.getState().bots.map((bot) => bot.id)).toEqual(["default"])
	expect(roster.getState().previews.personal).toEqual({ default: undefined })
})

it("shows no row of the local space once a joined space opens and while its roster loads", async () => {
	const store = createFakeTranscriptStore()
	const garage = await store.createSpace("Garage")
	await store.createBot(newBotIdentity([]), garage.id)
	const roster = mountRoster({
		...store,
		bots: (spaceId) => store.bots(spaceId === "garage" ? garage.id : spaceId),
		conversations: (spaceId) =>
			store.conversations(spaceId === "garage" ? garage.id : spaceId),
	})
	await roster.load({
		spaces: [LOCAL],
		spaceRowId: "personal",
		lastRowId: null,
	})
	let release: () => void = () => undefined
	const held = new Promise<void>((resolve) => {
		release = resolve
	})
	vi.spyOn(store, "bots").mockImplementationOnce(async (spaceId) => {
		await held
		return createFakeTranscriptStore().bots(spaceId)
	})

	const opening = roster.load({
		spaces: [JOINED],
		spaceRowId: JOINED.spaceRowId,
		lastRowId: null,
	})

	expect(roster.getState().rosters).toEqual({ [JOINED.spaceRowId]: [] })
	expect(roster.getState().bots).toEqual([])
	release()
	await opening
	expect(Object.keys(roster.getState().rosters)).toEqual([JOINED.spaceRowId])
})
