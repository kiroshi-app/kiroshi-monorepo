import { QueryObserver } from "@tanstack/react-query"
import { describe, expect, it, vi } from "vitest"

import type { NoticeMessage } from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import type { ArchivePickers } from "./archive-pickers"
import {
	createSpacesController,
	type SpacesController,
} from "./spaces-controller"

import { createFakeTranscriptStore } from "../conversations/fake-transcript-store"
import type { TranscriptStore } from "../conversations/store-port"
import { createQueryTestWrapper } from "../query/query-test-wrapper"

const listed = async (
	store: TranscriptStore,
	lastSpaceId: string | null = null,
) => {
	const { queryClient } = createQueryTestWrapper()
	const controller = createSpacesController(store, { queryClient })
	new QueryObserver(queryClient, controller.listQuery).subscribe(
		() => undefined,
	)
	await controller.load(lastSpaceId)
	const refetch = () =>
		queryClient.invalidateQueries({ queryKey: controller.listQuery.queryKey })
	return { controller, refetch }
}

const loaded = async (
	store: TranscriptStore,
	lastSpaceId: string | null = null,
) => (await listed(store, lastSpaceId)).controller

const names = async (store: TranscriptStore) =>
	(await store.spaces()).map((space) => space.name)

const held = (controller: SpacesController) =>
	controller.getState().spaces.map((space) => space.name)

describe("createSpacesController", () => {
	it("opens on the space the record remembers", async () => {
		const store = createFakeTranscriptStore()
		const elsewhere = await store.createSpace("Vocca")

		const controller = await loaded(store, elsewhere.id)

		expect(controller.getState().selectedSpaceId).toBe(elsewhere.id)
	})

	it("reports a listing it could not read instead of holding an empty roster", async () => {
		const store = createFakeTranscriptStore()
		vi.spyOn(store, "spaces").mockRejectedValue(new Error("no record"))

		const controller = await loaded(store)

		expect(controller.getState().hasFailedToLoad).toBe(true)
	})

	it("clears the reported failure once the listing reads again", async () => {
		const store = createFakeTranscriptStore()
		const listing = vi
			.spyOn(store, "spaces")
			.mockRejectedValueOnce(new Error("no record"))
		const controller = await loaded(store)

		await controller.load(null)

		expect(listing).toHaveBeenCalledTimes(2)
		expect(controller.getState().hasFailedToLoad).toBe(false)
	})

	it("opens on the first space when the record remembers none", async () => {
		const store = createFakeTranscriptStore()
		await store.createSpace("Vocca")

		const controller = await loaded(store)

		expect(controller.getState().selectedSpaceId).toBe("personal")
	})

	it("opens on the first space when the one it remembers is gone", async () => {
		const store = createFakeTranscriptStore()

		const controller = await loaded(store, "vacances")

		expect(controller.getState().selectedSpaceId).toBe("personal")
	})

	it("creates a space, selects it and leaves the roster of the others behind", async () => {
		const store = createFakeTranscriptStore()
		const controller = await loaded(store)

		await controller.create()

		const state = controller.getState()
		expect(state.spaces).toHaveLength(2)
		expect(state.selectedSpaceId).toBe(state.spaces[1].id)
		expect(await store.bots(state.selectedSpaceId)).toEqual([])
	})

	it("writes the name and the colour a space is given", async () => {
		const store = createFakeTranscriptStore()
		const controller = await loaded(store)

		controller.describe("personal", { name: "Vocca", colour: 186 })

		expect(controller.getState().spaces[0]).toMatchObject({
			name: "Vocca",
			colour: 186,
		})
		await vi.waitFor(async () =>
			expect((await store.spaces())[0]).toMatchObject({
				name: "Vocca",
				colour: 186,
			}),
		)
	})

	it("keeps a hue outside the presets when the space is renamed and its colour left alone", async () => {
		const store = createFakeTranscriptStore()
		await store.updateSpace("personal", "Perso", 210)
		const controller = await loaded(store)

		controller.describe("personal", { name: "Vocca", colour: 210 })

		expect(controller.getState().spaces[0]).toMatchObject({
			name: "Vocca",
			colour: 210,
		})
		await vi.waitFor(async () =>
			expect((await store.spaces())[0]).toMatchObject({
				name: "Vocca",
				colour: 210,
			}),
		)
		expect((await loaded(store)).getState().spaces[0].colour).toBe(210)
	})

	it("replaces a hue outside the presets with the preset picked in its place", async () => {
		const store = createFakeTranscriptStore()
		await store.updateSpace("personal", "Perso", 210)
		const controller = await loaded(store)

		controller.describe("personal", { name: "Perso", colour: 257 })

		await vi.waitFor(async () =>
			expect((await store.spaces())[0].colour).toBe(257),
		)
	})

	it("writes a space stripped of its colour", async () => {
		const store = createFakeTranscriptStore()
		const controller = await loaded(store)

		controller.describe("personal", { name: "Perso" })

		expect(controller.getState().spaces[0]).toMatchObject({
			name: "Perso",
			colour: null,
		})
		await vi.waitFor(async () =>
			expect((await store.spaces())[0]).toMatchObject({
				name: "Perso",
				colour: null,
			}),
		)
	})

	it("falls back to the first space that remains after a delete", async () => {
		const store = createFakeTranscriptStore()
		const controller = await loaded(store)
		await controller.create()
		const created = controller.getState().selectedSpaceId ?? ""

		await controller.remove(created)

		expect(controller.getState().selectedSpaceId).toBe("personal")
		expect(await names(store)).toEqual(["Personal"])
	})

	it("stays on the space it is in when the record refuses the delete", async () => {
		const store = createFakeTranscriptStore()
		const controller = await loaded(store)

		await controller.remove("personal")

		expect(controller.getState().selectedSpaceId).toBe("personal")
		expect(await names(store)).toEqual(["Personal"])
	})

	it("holds the new order before the record has taken it", async () => {
		const store = createFakeTranscriptStore()
		const vocca = await store.createSpace("Vocca")
		const controller = await loaded(store)
		const record = Promise.withResolvers<void>()
		vi.spyOn(store, "reorderSpaces").mockReturnValue(record.promise)

		const written = controller.reorder([vocca.id, "personal"])

		expect(held(controller)).toEqual(["Vocca", "Personal"])
		record.resolve()
		await written
	})

	it("stays on the space it is in when its rank changes", async () => {
		const store = createFakeTranscriptStore()
		const vocca = await store.createSpace("Vocca")
		const controller = await loaded(store, vocca.id)

		await controller.reorder([vocca.id, "personal"])

		expect(controller.getState().selectedSpaceId).toBe(vocca.id)
		expect(await names(store)).toEqual(["Vocca", "Personal"])
	})

	it("restores the order it held when a reorder is refused", async () => {
		const store = createFakeTranscriptStore()
		const vocca = await store.createSpace("Vocca")
		const controller = await loaded(store)
		vi.spyOn(store, "reorderSpaces").mockRejectedValue({
			kind: "unknownSpace",
			id: vocca.id,
		})

		await controller.reorder([vocca.id, "personal"])

		await vi.waitFor(() =>
			expect(held(controller)).toEqual(["Personal", "Vocca"]),
		)
	})

	it("leaves the record alone when the order it is given is the one it holds", async () => {
		const store = createFakeTranscriptStore()
		const vocca = await store.createSpace("Vocca")
		const controller = await loaded(store)
		const reorder = vi.spyOn(store, "reorderSpaces")

		await controller.reorder(["personal", vocca.id])

		expect(reorder).not.toHaveBeenCalled()
	})

	it("reports the refused create apart from a listing it could not read", async () => {
		const store = createFakeTranscriptStore()
		await store.createSpace("Vocca")
		const controller = await loaded(store)
		vi.spyOn(store, "createSpace").mockRejectedValue(new Error("no record"))

		await controller.create()

		expect(controller.getState().hasFailedToCreate).toBe(true)
		expect(controller.getState().hasFailedToLoad).toBe(false)
		expect(held(controller)).toEqual(await names(store))
	})

	it("raises a failure notice when the create is refused", async () => {
		const store = createFakeTranscriptStore()
		vi.spyOn(store, "createSpace").mockRejectedValue(new Error("no record"))
		const reportFailure = vi.fn()
		const controller = createSpacesController(store, {
			queryClient: createQueryTestWrapper().queryClient,
			reportFailure,
		})
		await controller.load(null)

		await controller.create()

		expect(reportFailure).toHaveBeenCalledExactlyOnceWith({
			title: i18n.t("chat:screen.notice.failed"),
		})
	})

	it("clears the refused create once a create lands", async () => {
		const store = createFakeTranscriptStore()
		const create = vi
			.spyOn(store, "createSpace")
			.mockRejectedValueOnce(new Error("no record"))
		const controller = await loaded(store)
		await controller.create()

		await controller.create()

		expect(create).toHaveBeenCalledTimes(2)
		expect(controller.getState().hasFailedToCreate).toBe(false)
	})

	it("clears the refused create once the listing reads again", async () => {
		const store = createFakeTranscriptStore()
		vi.spyOn(store, "createSpace").mockRejectedValue(new Error("no record"))
		const controller = await loaded(store)
		await controller.create()

		await controller.load(null)

		expect(controller.getState().hasFailedToCreate).toBe(false)
	})

	it("reports the listing it could not read while re-reading after a refused create", async () => {
		const store = createFakeTranscriptStore()
		const controller = await loaded(store)
		vi.spyOn(store, "createSpace").mockRejectedValue(new Error("no record"))
		vi.spyOn(store, "spaces").mockRejectedValue(new Error("no record"))

		await controller.create()

		expect(controller.getState().hasFailedToCreate).toBe(true)
		expect(controller.getState().hasFailedToLoad).toBe(true)
	})

	it("stays on the space it is in when a create is refused", async () => {
		const store = createFakeTranscriptStore()
		vi.spyOn(store, "createSpace").mockRejectedValue(new Error("no record"))
		const controller = await loaded(store)

		await controller.create()

		expect(controller.getState().selectedSpaceId).toBe("personal")
		expect(controller.getState().spaces).toHaveLength(1)
	})
})

const ARCHIVE_PATH = "/archives/personal.kiroshi"

type TransferRigOptions = {
	exportPath?: string | null
	importPath?: string | null
}

const transferRig = async ({
	exportPath = ARCHIVE_PATH,
	importPath = ARCHIVE_PATH,
}: TransferRigOptions = {}) => {
	const store = createFakeTranscriptStore()
	const pickers: ArchivePickers = {
		pickExportPath: vi.fn(() => Promise.resolve(exportPath)),
		pickImportPath: vi.fn(() => Promise.resolve(importPath)),
	}
	const successes: NoticeMessage[] = []
	const failures: NoticeMessage[] = []
	const controller = createSpacesController(store, {
		queryClient: createQueryTestWrapper().queryClient,
		pickers,
		reportSuccess: (notice) => successes.push(notice),
		reportFailure: (notice) => failures.push(notice),
	})
	await controller.load(null)
	return { store, pickers, successes, failures, controller }
}

describe("a refetch of the space list", () => {
	it("selects the remembered space once the chosen one is dropped", async () => {
		const store = createFakeTranscriptStore()
		const remembered = await store.createSpace("Vocca")
		const chosen = await store.createSpace("Garage")
		const { controller, refetch } = await listed(store, remembered.id)
		controller.select(chosen.id)
		await store.deleteSpace(chosen.id)

		await refetch()

		expect(controller.getState().selectedSpaceId).toBe(remembered.id)
	})

	it("selects the first space once the chosen one is dropped and none is remembered", async () => {
		const store = createFakeTranscriptStore()
		const chosen = await store.createSpace("Garage")
		const { controller, refetch } = await listed(store)
		controller.select(chosen.id)
		await store.deleteSpace(chosen.id)

		await refetch()

		expect(controller.getState().selectedSpaceId).toBe("personal")
	})

	it("keeps a chosen space the list never held, as a joined space", async () => {
		const store = createFakeTranscriptStore()
		const { controller, refetch } = await listed(store)
		controller.select("garage")

		await refetch()

		expect(controller.getState().selectedSpaceId).toBe("garage")
	})
})

describe("space transfer", () => {
	it("exports the selected space to the chosen archive and names it in the notice", async () => {
		const { store, pickers, successes, controller } = await transferRig()
		const exporting = vi.spyOn(store, "exportSpace")

		await controller.exportSpace("personal")

		expect(pickers.pickExportPath).toHaveBeenCalledWith("Personal.kiroshi")
		expect(exporting).toHaveBeenCalledWith("personal", ARCHIVE_PATH)
		expect(successes.map((notice) => notice.title)).toEqual([
			"Personal exported",
		])
	})

	it("appends the imported space, selects it and names it in the notice", async () => {
		const { store, successes, controller } = await transferRig()
		await store.exportSpace("personal", ARCHIVE_PATH)

		await controller.importSpace()

		const { spaces, selectedSpaceId } = controller.getState()
		expect(spaces).toHaveLength(2)
		expect(selectedSpaceId).toBe(spaces[1]?.id)
		expect(spaces[1]?.name).toBe("Personal")
		expect(successes.map((notice) => notice.title)).toEqual([
			"Personal imported",
		])
	})

	it("calls no command and raises no notice when the save picker is dismissed", async () => {
		const { store, successes, failures, controller } = await transferRig({
			exportPath: null,
		})
		const exporting = vi.spyOn(store, "exportSpace")

		await controller.exportSpace("personal")

		expect(exporting).not.toHaveBeenCalled()
		expect([...successes, ...failures]).toEqual([])
	})

	it("calls no command and raises no notice when the open picker is dismissed", async () => {
		const { store, successes, failures, controller } = await transferRig({
			importPath: null,
		})
		const importing = vi.spyOn(store, "importSpace")

		await controller.importSpace()

		expect(importing).not.toHaveBeenCalled()
		expect([...successes, ...failures]).toEqual([])
		expect(controller.getState().spaces).toHaveLength(1)
	})

	it.each([
		[
			{ kind: "unsupportedArchive", found: 3, supported: 1 },
			"This archive is format version 3, this app reads version 1.",
		],
		[
			{ kind: "unsupportedArchive", found: null, supported: 1 },
			"This archive carries no format version, this app reads version 1.",
		],
		[
			{ kind: "unreadableArchive", detail: "truncated" },
			"The archive couldn’t be read.",
		],
		[{ kind: "lastSpace" }, "Something went wrong, nothing was changed."],
		[new Error("host gone"), "Something went wrong, nothing was changed."],
	])(
		"names what failed when an import is refused with %o",
		async (refusal, description) => {
			const { store, successes, failures, controller } = await transferRig()
			vi.spyOn(store, "importSpace").mockRejectedValue(refusal)

			await controller.importSpace()

			expect(successes).toEqual([])
			expect(failures).toMatchObject([
				{ title: "Couldn’t import the space", description },
			])
			expect(controller.getState().spaces).toHaveLength(1)
		},
	)

	it("names the space and the unwritable archive when an export is refused", async () => {
		const { store, failures, controller } = await transferRig()
		vi.spyOn(store, "exportSpace").mockRejectedValue({
			kind: "unwritableArchive",
			detail: "read-only volume",
		})

		await controller.exportSpace("personal")

		expect(failures).toMatchObject([
			{
				title: "Couldn’t export Personal",
				description: "The archive couldn’t be written.",
			},
		])
	})

	it("reopens the save picker when the export failure is retried", async () => {
		const { store, pickers, failures, controller } = await transferRig()
		vi.spyOn(store, "exportSpace").mockRejectedValueOnce({
			kind: "unwritableArchive",
			detail: "read-only volume",
		})
		await controller.exportSpace("personal")

		expect(failures[0]?.action?.label).toBe("Try again")
		failures[0]?.action?.onPress()

		await vi.waitFor(() =>
			expect(pickers.pickExportPath).toHaveBeenCalledTimes(2),
		)
	})

	it("reopens the open picker when the import failure is retried", async () => {
		const { store, pickers, failures, controller } = await transferRig()
		vi.spyOn(store, "importSpace").mockRejectedValueOnce({
			kind: "unreadableArchive",
			detail: "truncated",
		})
		await controller.importSpace()

		failures[0]?.action?.onPress()

		await vi.waitFor(() =>
			expect(pickers.pickImportPath).toHaveBeenCalledTimes(2),
		)
	})

	it("ignores a second press of either entry while a transfer runs", async () => {
		const { store, pickers, controller } = await transferRig()
		await store.exportSpace("personal", ARCHIVE_PATH)

		await Promise.all([
			controller.importSpace(),
			controller.importSpace(),
			controller.exportSpace("personal"),
		])

		expect(pickers.pickImportPath).toHaveBeenCalledTimes(1)
		expect(pickers.pickExportPath).not.toHaveBeenCalled()
		expect(controller.getState().spaces).toHaveLength(2)
	})

	it("raises a failure notice instead of rejecting when a picker fails", async () => {
		const { pickers, failures, controller } = await transferRig()
		vi.mocked(pickers.pickImportPath).mockRejectedValue(new Error("no window"))

		await expect(controller.importSpace()).resolves.toBeUndefined()

		expect(failures).toHaveLength(1)
	})
})
