import { type QueryClient, queryOptions } from "@tanstack/react-query"

import { i18n } from "@workspace/ui/lib/i18n"

import { sectionQueryKeys } from "./section-query-keys"

import { createQueue } from "../queue"
import { createStore } from "../store"
import { createWriteLoop } from "../write-loop"
import type { RosterPin, Section } from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"
import { memoizedOn, subscribeWithQueries } from "../query/cache-view"
import { runMutation } from "../query/run-mutation"

export type BotSections = {
	move: (botId: string, sectionId: string | null) => void
	clear: (sectionId: string) => void
	pin: (pins: RosterPin[]) => void
	hostSpaceIdOf: (spaceRowId: string) => string
	reload: () => Promise<void>
}

export type SectionsState = {
	sections: Record<string, Section[]>
}

export type SectionsController = {
	getState: () => SectionsState
	subscribe: (listener: () => void) => () => void
	listQuery: (spaceId: string) => SectionListQuery
	enter: (spaceId: string) => Promise<void>
	keep: (spaceIds: string[]) => void
	create: (
		spaceId: string,
		name: string,
		botId?: string | null,
	) => Promise<Section | undefined>
	rename: (id: string, name: string) => void
	pin: (spaceId: string, pins: RosterPin[]) => Promise<void>
	remove: (id: string) => Promise<void>
	moveBot: (botId: string, sectionId: string | null) => Promise<void>
}

type SectionsChoice = { spaceIds: string[] }

const initialSectionsChoice: SectionsChoice = { spaceIds: [] }

const NO_SECTIONS: Section[] = []

const sectionListQueryOf = (
	spaceRowId: string,
	spaceId: string,
	read: () => Promise<Section[]>,
) =>
	queryOptions({
		queryKey: sectionQueryKeys.list(spaceRowId, spaceId),
		queryFn: read,
		meta: {
			failureNotice: () => ({
				title: i18n.t("bots:roster.section.unreadable"),
			}),
			raisedIn: "use-sections",
		},
	})

type SectionListQuery = ReturnType<typeof sectionListQueryOf>

const sectionsStateOf = (
	spaceIds: string[],
	reads: (Section[] | undefined)[],
): SectionsState => ({
	sections: Object.fromEntries(
		spaceIds.map((spaceId, index) => [spaceId, reads[index] ?? NO_SECTIONS]),
	),
})

type SectionsControllerOptions = {
	queryClient: QueryClient
}

export const sectionsIn = (state: SectionsState, spaceId: string) =>
	state.sections[spaceId] ?? []

export const spaceOfSection = (state: SectionsState, id: string) =>
	Object.keys(state.sections).find((spaceId) =>
		sectionsIn(state, spaceId).some((section) => section.id === id),
	)

const repositioned = (sections: Section[], pins: RosterPin[]) =>
	sections
		.map((section) => {
			const at = pins.findIndex((pin) => pin.id === section.id)
			return at < 0 ? section : { ...section, position: at }
		})
		.toSorted((one, other) => one.position - other.position)

export const createSectionsController = (
	store: TranscriptStore,
	bots: BotSections,
	{ queryClient }: SectionsControllerOptions,
): SectionsController => {
	const choiceStore = createStore(initialSectionsChoice)

	const enqueue = createQueue()

	const commit = <Result>(write: () => Promise<Result>) =>
		enqueue(() => runMutation(queryClient, write))

	const listQuery = (spaceId: string) => {
		const hostSpaceId = bots.hostSpaceIdOf(spaceId)
		return sectionListQueryOf(spaceId, hostSpaceId, () =>
			enqueue(() => store.sections(hostSpaceId)),
		)
	}

	const sectionsReadIn = (spaceId: string) =>
		queryClient.getQueryData(listQuery(spaceId).queryKey)

	const current = memoizedOn(() => {
		const { spaceIds } = choiceStore.getState()
		return [spaceIds, spaceIds.map(sectionsReadIn)]
	}, sectionsStateOf)

	const keepOnly = (spaceIds: string[]) => choiceStore.setState({ spaceIds })

	const hold = (spaceId: string, sections: Section[]) =>
		queryClient.setQueryData(listQuery(spaceId).queryKey, sections)

	const held = (id: string) =>
		Object.values(current().sections)
			.flat()
			.find((section) => section.id === id)

	const spaceOf = (id: string) => spaceOfSection(current(), id)

	const apply = (written: Section) => {
		const spaceId = spaceOf(written.id)
		if (!spaceId) {
			return
		}
		hold(
			spaceId,
			sectionsIn(current(), spaceId).map((section) =>
				section.id === written.id ? written : section,
			),
		)
	}

	const reload = (spaceId: string) =>
		queryClient.invalidateQueries({ queryKey: listQuery(spaceId).queryKey })

	const reloadAll = () =>
		queryClient.invalidateQueries({ queryKey: sectionQueryKeys.lists() })

	const writes = createWriteLoop<string, Section>({
		enqueue,
		write: (id, name) =>
			runMutation(queryClient, () => store.renameSection(id, name)),
		apply: (_id, written) => apply(written),
		onRefused: () => {
			void reloadAll()
		},
	})

	const isKept = (spaceId: string) =>
		choiceStore.getState().spaceIds.includes(spaceId)

	return {
		getState: current,

		subscribe: subscribeWithQueries(
			choiceStore,
			queryClient,
			sectionQueryKeys.all,
		),

		listQuery,

		enter: (spaceId: string) => {
			if (!isKept(spaceId)) {
				keepOnly([...choiceStore.getState().spaceIds, spaceId])
			}
			return queryClient.prefetchQuery(listQuery(spaceId))
		},

		keep: (spaceIds: string[]) => {
			const held = choiceStore.getState().spaceIds
			if (
				spaceIds.length !== held.length ||
				spaceIds.some((spaceId) => !held.includes(spaceId))
			) {
				keepOnly(spaceIds)
			}
		},

		create: (spaceId: string, name: string, botId: string | null = null) =>
			commit(async () => {
				const created = await store.createSection(
					bots.hostSpaceIdOf(spaceId),
					name,
				)
				hold(spaceId, [...sectionsIn(current(), spaceId), created])
				if (botId) {
					await store.moveBotToSection(botId, created.id)
					bots.move(botId, created.id)
				}
				return created
			}).catch(async () => {
				await reload(spaceId)
				return undefined
			}),

		rename: (id: string, name: string) => {
			const stored = held(id)
			if (!stored) {
				return
			}
			apply({ ...stored, name })
			writes.push(id, name)
		},

		pin: (spaceId: string, pins: RosterPin[]) => {
			hold(spaceId, repositioned(sectionsIn(current(), spaceId), pins))
			bots.pin(pins)
			return commit(() =>
				store.pinRoster(bots.hostSpaceIdOf(spaceId), pins),
			).catch(() => reload(spaceId))
		},

		remove: (id: string) =>
			commit(async () => {
				const spaceId = spaceOf(id)
				if (!spaceId) {
					return
				}
				await store.deleteSection(id)
				writes.drop(id)
				hold(
					spaceId,
					sectionsIn(current(), spaceId).filter((section) => section.id !== id),
				)
				bots.clear(id)
			}).catch(reloadAll),

		moveBot: (botId: string, sectionId: string | null) =>
			commit(async () => {
				await store.moveBotToSection(botId, sectionId)
				bots.move(botId, sectionId)
			}).catch(bots.reload),
	}
}
