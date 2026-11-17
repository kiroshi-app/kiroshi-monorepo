import { describe, expect, it, vi } from "vitest"

import {
	type CollapsedSectionsController,
	collapsedIn,
	createCollapsedSectionsController,
} from "./collapsed-sections-controller"
import type { ReportFailure } from "./space-write-refusal"

import { createFakeTranscriptStore } from "../conversations/fake-transcript-store"
import type { TranscriptStore } from "../conversations/store-port"

const settled = () => new Promise((resolve) => setTimeout(resolve, 0))

type Entering = {
	isOnScreen?: () => boolean
	reportFailure?: ReportFailure
}

const entered = async (
	store: TranscriptStore,
	spaceId = "personal",
	{ isOnScreen = () => true, reportFailure = vi.fn() }: Entering = {},
) => {
	const controller = createCollapsedSectionsController(
		store,
		{ hostSpaceIdOf: (id) => id, isOnScreen },
		{ reportFailure },
	)
	await controller.enter(spaceId)
	return controller
}

const shutIn = (
	controller: CollapsedSectionsController,
	spaceId = "personal",
) => collapsedIn(controller.getState(), spaceId)

describe("createCollapsedSectionsController", () => {
	it("draws nothing collapsed for a space the reader never shut anything in", async () => {
		const store = createFakeTranscriptStore()
		await store.createSection("personal", "Writers")

		const controller = await entered(store)

		expect(shutIn(controller)).toEqual([])
	})

	it("shows a section shut the instant it is collapsed, before the write lands", async () => {
		const store = createFakeTranscriptStore()
		const writers = await store.createSection("personal", "Writers")
		const controller = await entered(store)

		controller.collapse("personal", writers.id, true)

		expect(shutIn(controller)).toEqual([writers.id])
	})

	it("records the section as no longer collapsed once it is expanded", async () => {
		const store = createFakeTranscriptStore()
		const writers = await store.createSection("personal", "Writers")
		const controller = await entered(store)

		controller.collapse("personal", writers.id, true)
		controller.collapse("personal", writers.id, false)
		await settled()

		expect(shutIn(controller)).toEqual([])
		expect(await store.spacePreferences("personal")).toEqual({
			collapsedSectionIds: [],
		})
	})

	it("hands a space back the sections it was left with", async () => {
		const store = createFakeTranscriptStore()
		const writers = await store.createSection("personal", "Writers")
		const collapsing = await entered(store)
		collapsing.collapse("personal", writers.id, true)
		await settled()

		const reopened = await entered(store)

		expect(shutIn(reopened)).toEqual([writers.id])
	})

	it("keeps each space on its own sections", async () => {
		const store = createFakeTranscriptStore()
		const elsewhere = await store.createSpace("Vocca")
		const writers = await store.createSection("personal", "Writers")
		const callers = await store.createSection(elsewhere.id, "Callers")
		const controller = await entered(store)
		await controller.enter(elsewhere.id)

		controller.collapse("personal", writers.id, true)
		await settled()

		expect(shutIn(controller)).toEqual([writers.id])
		expect(shutIn(controller, elsewhere.id)).toEqual([])
		expect(callers.id).not.toEqual(writers.id)
	})

	it("keeps only the last of the writes that follow each other for one space", async () => {
		const store = createFakeTranscriptStore()
		const writers = await store.createSection("personal", "Writers")
		const readers = await store.createSection("personal", "Readers")
		const setPreferences = vi.spyOn(store, "setSpacePreferences")
		const controller = await entered(store)

		controller.collapse("personal", writers.id, true)
		controller.collapse("personal", readers.id, true)
		controller.collapse("personal", writers.id, false)
		await settled()

		expect(setPreferences).toHaveBeenCalledTimes(1)
		expect(shutIn(controller)).toEqual([readers.id])
	})

	it("draws what the store holds when a write is refused", async () => {
		const store = createFakeTranscriptStore()
		const writers = await store.createSection("personal", "Writers")
		const controller = await entered(store)
		vi.spyOn(store, "setSpacePreferences").mockRejectedValue(
			new Error("refused"),
		)

		controller.collapse("personal", writers.id, true)
		await settled()

		expect(shutIn(controller)).toEqual([])
	})

	it("reports a collapse refused in the Space on screen", async () => {
		const store = createFakeTranscriptStore()
		const writers = await store.createSection("personal", "Writers")
		const reportFailure = vi.fn()
		const controller = await entered(store, "personal", { reportFailure })
		const refusal = { kind: "storage" }
		vi.spyOn(store, "setSpacePreferences").mockRejectedValue(refusal)

		controller.collapse("personal", writers.id, true)

		await vi.waitFor(() =>
			expect(reportFailure).toHaveBeenCalledWith(expect.anything(), {
				reason: refusal,
				space: "personal",
			}),
		)
	})

	it("logs a collapse refused in a Space not on screen and raises no notice", async () => {
		const warned = vi.spyOn(console, "warn").mockReturnValue(undefined)
		const store = createFakeTranscriptStore()
		const writers = await store.createSection("personal", "Writers")
		const reportFailure = vi.fn()
		const controller = await entered(store, "personal", {
			isOnScreen: () => false,
			reportFailure,
		})
		vi.spyOn(store, "setSpacePreferences").mockRejectedValue({
			kind: "storage",
		})

		controller.collapse("personal", writers.id, true)

		await vi.waitFor(() => expect(shutIn(controller)).toEqual([]))
		expect(reportFailure).not.toHaveBeenCalled()
		expect(warned).toHaveBeenCalledExactlyOnceWith(
			expect.stringContaining("space: personal"),
		)
	})

	it("drops the sections of a space the roster no longer carries", async () => {
		const store = createFakeTranscriptStore()
		const elsewhere = await store.createSpace("Vocca")
		const controller = await entered(store)
		await controller.enter(elsewhere.id)

		controller.keep(["personal"])

		expect(Object.keys(controller.getState().collapsedBySpaceId)).toEqual([
			"personal",
		])
	})
})
