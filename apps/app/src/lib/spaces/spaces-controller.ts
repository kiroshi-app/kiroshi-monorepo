import { type QueryClient, queryOptions } from "@tanstack/react-query"

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
import { spaceQueryKeys } from "./space-query-keys"
import { newSpaceName } from "./space-settings"

import { SPACE_DESCRIBED_EVENT } from "../bindings"
import { failureReporterIn } from "../failure-report"
import { joinedHosts, listenOnThisComputer } from "../host"
import { createQueue } from "../queue"
import { createStore } from "../store"
import { createWriteLoop } from "../write-loop"
import type { Space, SpaceError } from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"
import type { JoinedHosts } from "../host/joined-hosts"
import { memoizedOn, subscribeWithQueries } from "../query/cache-view"
import { runMutation } from "../query/run-mutation"

type SpaceDescription = Pick<Space, "name" | "colour">

export type SpacesState = {
	spaces: Space[]
	selectedSpaceId: string | null
	hasFailedToLoad: boolean
	hasFailedToCreate: boolean
}

export type SpacesController = {
	getState: () => SpacesState
	subscribe: (listener: () => void) => () => void
	listQuery: SpaceListQuery
	watch: () => () => void
	load: (lastSpaceId: string | null) => Promise<void>
	select: (id: string) => void
	create: () => Promise<void>
	describe: (id: string, value: SpaceSettingsValue) => void
	reorder: (ids: string[]) => Promise<void>
	remove: (id: string) => Promise<void>
	exportSpace: (id: string) => Promise<void>
	importSpace: () => Promise<void>
}

export type SpacesControllerOptions = {
	queryClient: QueryClient
	pickers?: ArchivePickers
	reportSuccess?: (notice: NoticeMessage) => void
	reportFailure?: (notice: NoticeMessage) => void
	hosts?: Pick<JoinedHosts, "activate">
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

type SpacesChoice = {
	chosenSpaceId: string | null
	isChosenListed: boolean
	rememberedSpaceId: string | null
	hasFailedToCreate: boolean
}

const initialSpacesChoice: SpacesChoice = {
	chosenSpaceId: null,
	isChosenListed: false,
	rememberedSpaceId: null,
	hasFailedToCreate: false,
}

const NO_SPACES: Space[] = []

const spaceListQueryOf = (read: () => Promise<Space[]>) =>
	queryOptions({
		queryKey: spaceQueryKeys.list(),
		queryFn: read,
		meta: { rendersErrorInline: true },
	})

type SpaceListQuery = ReturnType<typeof spaceListQueryOf>

const heldIdIn = (spaces: Space[], id: string | null) =>
	spaces.find((space) => space.id === id)?.id

const listedChoice = (id: string | null) => ({
	chosenSpaceId: id,
	isChosenListed: true,
})

const chosenIdIn = (spaces: Space[], choice: SpacesChoice) =>
	choice.isChosenListed
		? heldIdIn(spaces, choice.chosenSpaceId)
		: choice.chosenSpaceId

const spacesStateOf = (
	choice: SpacesChoice,
	spaces: Space[],
	hasFailedToLoad: boolean,
): SpacesState => ({
	spaces,
	selectedSpaceId:
		chosenIdIn(spaces, choice) ??
		heldIdIn(spaces, choice.rememberedSpaceId) ??
		spaces[0]?.id ??
		null,
	hasFailedToLoad,
	hasFailedToCreate: choice.hasFailedToCreate,
})

export const createSpacesController = (
	store: TranscriptStore,
	{
		queryClient,
		pickers = nativeArchivePickers,
		reportSuccess = raiseTransientNotice,
		reportFailure = failureReporterIn("spaces-controller"),
		hosts = joinedHosts,
	}: SpacesControllerOptions,
): SpacesController => {
	const choiceStore = createStore(initialSpacesChoice)
	const enqueue = createQueue()
	const listQuery = spaceListQueryOf(() => enqueue(() => store.spaces()))
	const listKey = listQuery.queryKey

	const current = memoizedOn(
		() => [
			choiceStore.getState(),
			queryClient.getQueryData<Space[]>(listKey) ?? NO_SPACES,
			queryClient.getQueryState(listKey)?.status === "error",
		],
		spacesStateOf,
	)

	const choose = (fields: Partial<SpacesChoice>) =>
		choiceStore.setState({ ...choiceStore.getState(), ...fields })

	const hold = (spaces: Space[]) => queryClient.setQueryData(listKey, spaces)

	const commit = <Result>(write: () => Promise<Result>) =>
		enqueue(() => runMutation(queryClient, write))

	const reload = () => queryClient.invalidateQueries({ queryKey: listKey })

	const apply = (written: Space) =>
		hold(
			current().spaces.map((space) =>
				space.id === written.id ? written : space,
			),
		)

	const noteRefusedCreate = () => {
		choose({ hasFailedToCreate: true })
		reportFailure({ title: i18n.t("chat:screen.notice.failed") })
		return reload()
	}

	const writes = createWriteLoop<SpaceDescription, Space>({
		enqueue,
		write: (id, { name, colour }) =>
			runMutation(queryClient, () =>
				store.updateSpace(id, name, colour ?? undefined),
			),
		apply: (_id, written) => apply(written),
		onRefused: () => {
			void reload()
		},
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
				await commit(() => store.exportSpace(id, path))
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
				const imported = await commit(async () => {
					const written = await store.importSpace(path)
					hold([...current().spaces, written])
					choose(listedChoice(written.id))
					return written
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

		subscribe: subscribeWithQueries(choiceStore, queryClient, listKey),

		listQuery,

		watch: () => {
			const detach = listenOnThisComputer(SPACE_DESCRIBED_EVENT, () => {
				void reload()
			}).catch(() => {
				reportFailure({ title: i18n.t("chat:screen.notice.failed") })
				return undefined
			})
			return () => {
				void detach.then((unlisten) => unlisten?.())
			}
		},

		load: (lastSpaceId: string | null) => {
			choose({ rememberedSpaceId: lastSpaceId, hasFailedToCreate: false })
			return queryClient.prefetchQuery({ ...listQuery, staleTime: 0 })
		},

		select: (id: string) => {
			if (id !== current().selectedSpaceId) {
				choose({
					chosenSpaceId: id,
					isChosenListed: heldIdIn(current().spaces, id) !== undefined,
				})
			}
		},

		create: () =>
			commit(async () => {
				const created = await store.createSpace(newSpaceName())
				hold([...current().spaces, created])
				void hosts.activate(null)
				choose({ ...listedChoice(created.id), hasFailedToCreate: false })
			}).catch(noteRefusedCreate),

		describe: (id: string, value: SpaceSettingsValue) => {
			const held = current().spaces.find((space) => space.id === id)
			if (!held) {
				return
			}
			const description: SpaceDescription = {
				name: value.name,
				colour: value.colour ?? null,
			}
			apply({ ...held, ...description })
			writes.push(id, description)
		},

		reorder: (ids: string[]) => {
			const { spaces } = current()
			if (isSameOrder(spaces, ids)) {
				return Promise.resolve()
			}
			hold(repositioned(spaces, ids))
			return commit(() => store.reorderSpaces(ids)).catch(reload)
		},

		remove: (id: string) =>
			commit(async () => {
				await store.deleteSpace(id)
				writes.drop(id)
				const spaces = current().spaces.filter((space) => space.id !== id)
				hold(spaces)
				choose(listedChoice(spaces[0]?.id ?? null))
			}).catch(reload),

		exportSpace,

		importSpace,
	}
}
