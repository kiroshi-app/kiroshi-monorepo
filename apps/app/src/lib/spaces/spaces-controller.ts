import {
	type NoticeMessage,
	raiseTransientNotice,
} from "@workspace/ui/components/notice-surface"
import type { SpaceSettingsValue } from "@workspace/ui/components/space-settings"
import { i18n } from "@workspace/ui/lib/i18n"

import {
	type ArchivePickers,
	archiveFileNameOf,
	nativeArchivePickers,
} from "./archive-pickers"
import { newSpaceName } from "./space-settings"

import { failureReporterIn } from "../failure-report"
import { createQueue } from "../queue"
import { createStore } from "../store"
import { createWriteLoop } from "../write-loop"
import type { Space, SpaceError } from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"

export type SpacesState = {
	spaces: Space[]
	selectedSpaceId: string | null
	isSettingsOpen: boolean
	hasFailedToLoad: boolean
	hasFailedToCreate: boolean
}

export type SpacesController = {
	getState: () => SpacesState
	subscribe: (listener: () => void) => () => void
	load: (lastSpaceId: string | null) => Promise<void>
	select: (id: string) => void
	create: () => Promise<void>
	setSettingsOpen: (isSettingsOpen: boolean) => void
	describe: (id: string, value: SpaceSettingsValue) => void
	reorder: (ids: string[]) => Promise<void>
	remove: (id: string) => Promise<void>
	exportSpace: (id: string) => Promise<void>
	importSpace: () => Promise<void>
}

export type SpacesControllerOptions = {
	pickers?: ArchivePickers
	reportSuccess?: (notice: NoticeMessage) => void
	reportFailure?: (notice: NoticeMessage) => void
}

const repositioned = (spaces: Space[], ids: string[]) =>
	ids.flatMap((id, position) => {
		const held = spaces.find((space) => space.id === id)
		return held ? [{ ...held, position }] : []
	})

const isSameOrder = (spaces: Space[], ids: string[]) =>
	spaces.length === ids.length &&
	spaces.every((space, position) => space.id === ids[position])

const isSpaceError = (refusal: unknown): refusal is SpaceError =>
	typeof refusal === "object" && refusal !== null && "kind" in refusal

const unsupportedArchiveReasonOf = (found: number | null, supported: number) =>
	found === null
		? i18n.t("settings:space.transfer.reason.unversionedArchive", { supported })
		: i18n.t("settings:space.transfer.reason.unsupportedArchive", {
				found,
				supported,
			})

const transferRefusalReasonOf = (refusal: unknown) => {
	if (!isSpaceError(refusal)) {
		return i18n.t("settings:space.transfer.reason.generic")
	}
	switch (refusal.kind) {
		case "unsupportedArchive":
			return unsupportedArchiveReasonOf(refusal.found, refusal.supported)
		case "unreadableArchive":
			return i18n.t("settings:space.transfer.reason.unreadableArchive")
		case "unwritableArchive":
			return i18n.t("settings:space.transfer.reason.unwritableArchive")
		default:
			return i18n.t("settings:space.transfer.reason.generic")
	}
}

const initialSpacesState: SpacesState = {
	spaces: [],
	selectedSpaceId: null,
	isSettingsOpen: false,
	hasFailedToLoad: false,
	hasFailedToCreate: false,
}

export const createSpacesController = (
	store: TranscriptStore,
	{
		pickers = nativeArchivePickers,
		reportSuccess = raiseTransientNotice,
		reportFailure = failureReporterIn("spaces-controller"),
	}: SpacesControllerOptions = {},
): SpacesController => {
	const stateStore = createStore(initialSpacesState)
	const current = stateStore.getState

	const enqueue = createQueue()

	const set = (fields: Partial<SpacesState>) =>
		stateStore.setState({ ...current(), ...fields })

	const apply = (written: Space) =>
		set({
			spaces: current().spaces.map((space) =>
				space.id === written.id ? written : space,
			),
		})

	const read = async (lastSpaceId: string | null) => {
		const spaces = await store.spaces()
		const stillHeld = spaces.find(
			(space) => space.id === current().selectedSpaceId,
		)?.id
		const remembered = spaces.find((space) => space.id === lastSpaceId)?.id
		set({
			spaces,
			selectedSpaceId: stillHeld ?? remembered ?? spaces[0]?.id ?? null,
			hasFailedToLoad: false,
			hasFailedToCreate: false,
		})
	}

	const noteFailedLoad = () => set({ hasFailedToLoad: true })

	const reload = () => {
		void enqueue(() => read(null)).catch(noteFailedLoad)
	}

	const noteRefusedCreate = () => {
		set({ hasFailedToCreate: true })
		return enqueue(async () => set({ spaces: await store.spaces() })).catch(
			noteFailedLoad,
		)
	}

	const writes = createWriteLoop<SpaceSettingsValue, Space>({
		enqueue,
		write: (id, value) => store.updateSpace(id, value.name, value.colour),
		apply: (_id, written) => apply(written),
		onRefused: reload,
	})

	let isTransferring = false

	const transfer = async (run: () => Promise<void>) => {
		if (isTransferring) {
			return
		}
		isTransferring = true
		try {
			await run()
		} finally {
			isTransferring = false
		}
	}

	const reportTransferFailure = (
		title: string,
		refusal: unknown,
		retry: () => Promise<void>,
	) =>
		reportFailure({
			title,
			description: transferRefusalReasonOf(refusal),
			action: {
				label: i18n.t("settings:space.transfer.retry"),
				onPress: () => {
					void retry()
				},
			},
		})

	const exportSpace = (id: string): Promise<void> =>
		transfer(async () => {
			const space = current().spaces.find((held) => held.id === id)
			if (!space) {
				return
			}
			try {
				const path = await pickers.pickExportPath(archiveFileNameOf(space.name))
				if (!path) {
					return
				}
				await enqueue(() => store.exportSpace(id, path))
				reportSuccess({
					title: i18n.t("settings:space.transfer.exported", {
						name: space.name,
					}),
				})
			} catch (refusal) {
				reportTransferFailure(
					i18n.t("settings:space.transfer.exportFailed", { name: space.name }),
					refusal,
					() => exportSpace(id),
				)
			}
		})

	const importSpace = (): Promise<void> =>
		transfer(async () => {
			try {
				const path = await pickers.pickImportPath()
				if (!path) {
					return
				}
				const imported = await enqueue(() => store.importSpace(path))
				set({
					spaces: [...current().spaces, imported],
					selectedSpaceId: imported.id,
				})
				reportSuccess({
					title: i18n.t("settings:space.transfer.imported", {
						name: imported.name,
					}),
				})
			} catch (refusal) {
				reportTransferFailure(
					i18n.t("settings:space.transfer.importFailed"),
					refusal,
					importSpace,
				)
			}
		})

	return {
		getState: current,

		subscribe: stateStore.subscribe,

		load: (lastSpaceId: string | null) =>
			enqueue(() => read(lastSpaceId)).catch(noteFailedLoad),

		select: (id: string) => {
			if (id !== current().selectedSpaceId) {
				set({ selectedSpaceId: id })
			}
		},

		create: () =>
			enqueue(async () => {
				const created = await store.createSpace(newSpaceName())
				set({
					spaces: [...current().spaces, created],
					selectedSpaceId: created.id,
					hasFailedToCreate: false,
				})
			}).catch(noteRefusedCreate),

		setSettingsOpen: (isSettingsOpen: boolean) => set({ isSettingsOpen }),

		describe: (id: string, value: SpaceSettingsValue) => {
			const held = current().spaces.find((space) => space.id === id)
			if (!held) {
				return
			}
			apply({ ...held, name: value.name, colour: value.colour ?? null })
			writes.push(id, value)
		},

		reorder: (ids: string[]) => {
			const { spaces } = current()
			if (isSameOrder(spaces, ids)) {
				return Promise.resolve()
			}
			set({ spaces: repositioned(spaces, ids) })
			return enqueue(() => store.reorderSpaces(ids)).catch(reload)
		},

		remove: (id: string) =>
			enqueue(async () => {
				await store.deleteSpace(id)
				writes.drop(id)
				const spaces = current().spaces.filter((space) => space.id !== id)
				set({
					spaces,
					selectedSpaceId: spaces[0]?.id ?? null,
					isSettingsOpen: false,
				})
			}).catch(reload),

		exportSpace,

		importSpace,
	}
}
