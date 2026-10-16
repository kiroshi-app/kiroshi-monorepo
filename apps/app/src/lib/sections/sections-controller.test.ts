// @vitest-environment happy-dom

import { cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { raiseFailureNotice } from "@workspace/ui/components/notice-surface"

import {
	type BotSections,
	createSectionsController,
	type SectionsController,
	sectionsIn,
	spaceOfSection,
} from "./sections-controller"
import { useSectionReads } from "./use-sections"

import { useControllerState } from "../use-controller"
import { createFakeTranscriptStore } from "../conversations/fake-transcript-store"
import type { TranscriptStore } from "../conversations/store-port"
import { createQueryTestWrapper } from "../query/query-test-wrapper"

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

const silentBots: BotSections = {
	move: () => undefined,
	clear: () => undefined,
	pin: () => undefined,
	hostSpaceIdOf: (spaceRowId) => spaceRowId,
	reload: async () => undefined,
}

const atTop = (id: string) => ({ id, sectionId: null })

const entered = async (
	store: TranscriptStore,
	spaceId = "personal",
	bots: BotSections = silentBots,
) => {
	const { queryClient, wrapper } = createQueryTestWrapper()
	const controller = createSectionsController(store, bots, { queryClient })
	renderHook(
		() => useSectionReads(controller, useControllerState(controller)),
		{
			wrapper,
		},
	)
	await controller.enter(spaceId)
	return controller
}

const names = (controller: SectionsController, spaceId = "personal") =>
	sectionsIn(controller.getState(), spaceId).map((section) => section.name)

describe("createSectionsController", () => {
	it("holds the sections of a space it enters, ordered by position", async () => {
		const store = createFakeTranscriptStore()
		const writers = await store.createSection("personal", "Writers")
		const readers = await store.createSection("personal", "Readers")
		await store.pinRoster("personal", [atTop(readers.id), atTop(writers.id)])

		const controller = await entered(store)

		expect(names(controller)).toEqual(["Readers", "Writers"])
	})

	it("holds the sections of a space beside the ones it already holds", async () => {
		const store = createFakeTranscriptStore()
		const elsewhere = await store.createSpace("Vocca")
		await store.createSection("personal", "Writers")
		await store.createSection(elsewhere.id, "Callers")

		const controller = await entered(store)
		await controller.enter(elsewhere.id)

		expect(names(controller)).toEqual(["Writers"])
		expect(names(controller, elsewhere.id)).toEqual(["Callers"])
	})

	it("answers with nothing for a space it has not read", async () => {
		const store = createFakeTranscriptStore()
		await store.createSection("personal", "Writers")

		const controller = await entered(store)

		expect(names(controller, "vacances")).toEqual([])
	})

	it("drops the sections of a space the roster no longer carries", async () => {
		const store = createFakeTranscriptStore()
		const elsewhere = await store.createSpace("Vocca")
		await store.createSection("personal", "Writers")
		await store.createSection(elsewhere.id, "Callers")
		const controller = await entered(store)
		await controller.enter(elsewhere.id)

		controller.keep([elsewhere.id])

		expect(names(controller)).toEqual([])
		expect(names(controller, elsewhere.id)).toEqual(["Callers"])
	})

	it("holds a created section last without reading the space again", async () => {
		const store = createFakeTranscriptStore()
		await store.createSection("personal", "Writers")
		const controller = await entered(store)
		const listed = vi.spyOn(store, "sections")

		await controller.create("personal", "Readers")

		expect(names(controller)).toEqual(["Writers", "Readers"])
		expect(listed).not.toHaveBeenCalled()
	})

	it("holds the named companion in the section it creates", async () => {
		const store = createFakeTranscriptStore()
		const moves: [string, string | null][] = []
		const controller = await entered(store, "personal", {
			...silentBots,
			move: (botId, sectionId) => moves.push([botId, sectionId]),
		})

		await controller.create("personal", "Writers", "default")

		const [created] = sectionsIn(controller.getState(), "personal")
		expect(moves).toEqual([["default", created.id]])
		expect((await store.bots("personal"))[0].sectionId).toBe(created.id)
	})

	it("moves no companion when a section is created with none named", async () => {
		const store = createFakeTranscriptStore()
		const moves: string[] = []
		const controller = await entered(store, "personal", {
			...silentBots,
			move: (botId) => moves.push(botId),
		})

		await controller.create("personal", "Writers")

		expect(moves).toEqual([])
		expect((await store.bots("personal"))[0].sectionId).toBeNull()
	})

	it("moves no companion when the record refuses the section", async () => {
		const store = createFakeTranscriptStore()
		const moves: string[] = []
		const controller = await entered(store, "personal", {
			...silentBots,
			move: (botId) => moves.push(botId),
		})
		vi.spyOn(store, "createSection").mockRejectedValue({
			kind: "unknownSpace",
			id: "personal",
		})

		await controller.create("personal", "Writers", "default")

		expect(moves).toEqual([])
		expect((await store.bots("personal"))[0].sectionId).toBeNull()
	})

	it("holds the name a section is renamed to", async () => {
		const store = createFakeTranscriptStore()
		const written = await store.createSection("personal", "Writers")
		const controller = await entered(store)

		controller.rename(written.id, "Readers")

		expect(names(controller)).toEqual(["Readers"])
		await vi.waitFor(async () =>
			expect((await store.sections("personal"))[0].name).toBe("Readers"),
		)
	})

	it("holds the order the sections are moved into", async () => {
		const store = createFakeTranscriptStore()
		const writers = await store.createSection("personal", "Writers")
		const readers = await store.createSection("personal", "Readers")
		const controller = await entered(store)

		await controller.pin("personal", [atTop(readers.id), atTop(writers.id)])

		expect(names(controller)).toEqual(["Readers", "Writers"])
		expect((await store.sections("personal")).map((one) => one.name)).toEqual([
			"Readers",
			"Writers",
		])
	})

	it("drops a deleted section and reports the companions it held", async () => {
		const store = createFakeTranscriptStore()
		const written = await store.createSection("personal", "Writers")
		const cleared: string[] = []
		const controller = await entered(store, "personal", {
			...silentBots,
			clear: (sectionId) => cleared.push(sectionId),
		})

		await controller.remove(written.id)

		expect(names(controller)).toEqual([])
		expect(cleared).toEqual([written.id])
	})

	it("reports the section a companion is moved into", async () => {
		const store = createFakeTranscriptStore()
		const written = await store.createSection("personal", "Writers")
		const moves: (string | null)[] = []
		const controller = await entered(store, "personal", {
			...silentBots,
			move: (_botId, sectionId) => moves.push(sectionId),
		})

		await controller.moveBot("default", written.id)
		await controller.moveBot("default", null)

		expect(moves).toEqual([written.id, null])
		expect((await store.bots("personal"))[0].sectionId).toBeNull()
	})

	it("reports nothing when the record refuses a companion move", async () => {
		const store = createFakeTranscriptStore()
		const moves: string[] = []
		const controller = await entered(store, "personal", {
			...silentBots,
			move: (botId) => moves.push(botId),
		})

		await controller.moveBot("default", "gone")

		expect(moves).toEqual([])
	})

	it("reads the roster again when the record refuses a companion move", async () => {
		const store = createFakeTranscriptStore()
		const reload = vi.fn(async () => undefined)
		const controller = await entered(store, "personal", {
			...silentBots,
			reload,
		})

		await controller.moveBot("default", "gone")

		expect(reload).toHaveBeenCalledOnce()
	})

	it("raises a failure notice and holds no section when a space cannot be read", async () => {
		const store = createFakeTranscriptStore()
		await store.createSection("personal", "Writers")
		vi.spyOn(store, "sections").mockRejectedValue(new Error("no record"))

		const controller = await entered(store)

		expect(names(controller)).toEqual([])
		await vi.waitFor(() =>
			expect(raiseFailureNotice).toHaveBeenCalledWith(
				expect.objectContaining({
					title:
						"Couldn’t load the sections of this space. Restart Kiroshi to retry.",
				}),
			),
		)
	})

	it("restores the sections it held when a rename is refused", async () => {
		const store = createFakeTranscriptStore()
		const written = await store.createSection("personal", "Writers")
		const controller = await entered(store)
		vi.spyOn(store, "renameSection").mockRejectedValue({
			kind: "unknownSection",
			id: written.id,
		})

		controller.rename(written.id, "Readers")

		await vi.waitFor(() => expect(names(controller)).toEqual(["Writers"]))
	})

	it("restores the sections it held when a pin is refused", async () => {
		const store = createFakeTranscriptStore()
		const writers = await store.createSection("personal", "Writers")
		const readers = await store.createSection("personal", "Readers")
		const controller = await entered(store)
		vi.spyOn(store, "pinRoster").mockRejectedValue({
			kind: "foreignSection",
			id: readers.id,
		})

		await controller.pin("personal", [atTop(readers.id), atTop(writers.id)])

		await vi.waitFor(() =>
			expect(names(controller)).toEqual(["Writers", "Readers"]),
		)
	})

	it("keeps the section a delete could not drop", async () => {
		const store = createFakeTranscriptStore()
		const written = await store.createSection("personal", "Writers")
		const controller = await entered(store)
		vi.spyOn(store, "deleteSection").mockRejectedValue({
			kind: "unknownSection",
			id: written.id,
		})

		await controller.remove(written.id)

		await vi.waitFor(() => expect(names(controller)).toEqual(["Writers"]))
	})
})

describe("spaceOfSection", () => {
	it("names the space holding the section", async () => {
		const store = createFakeTranscriptStore()
		const elsewhere = await store.createSpace("Vocca")
		const callers = await store.createSection(elsewhere.id, "Callers")
		await store.createSection("personal", "Writers")

		const controller = await entered(store)
		await controller.enter(elsewhere.id)

		expect(spaceOfSection(controller.getState(), callers.id)).toBe(elsewhere.id)
	})

	it("names no space for a section it does not hold", async () => {
		const store = createFakeTranscriptStore()
		const controller = await entered(store)

		expect(spaceOfSection(controller.getState(), "gone")).toBeUndefined()
	})
})
