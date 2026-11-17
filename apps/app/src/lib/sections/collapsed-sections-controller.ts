import type { BotSections } from "./sections-controller"
import { type ReportFailure, spaceWriteRefusalOf } from "./space-write-refusal"

import { failureReporterIn } from "../failure-report"
import { createQueue } from "../queue"
import { createStore } from "../store"
import { createWriteLoop } from "../write-loop"
import type { SpacePreferences } from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"

export type CollapsedSectionsState = {
	collapsedBySpaceId: Record<string, string[]>
}

export type CollapsedSectionsController = {
	getState: () => CollapsedSectionsState
	subscribe: (listener: () => void) => () => void
	enter: (spaceId: string) => Promise<void>
	keep: (spaceIds: string[]) => void
	collapse: (spaceId: string, sectionId: string, isCollapsed: boolean) => void
}

export type SectionSpaces = Pick<BotSections, "hostSpaceIdOf" | "isOnScreen">

type CollapsedSectionsOptions = {
	reportFailure?: ReportFailure
}

const initialCollapsedSectionsState: CollapsedSectionsState = {
	collapsedBySpaceId: {},
}

export const collapsedIn = (state: CollapsedSectionsState, spaceId: string) =>
	state.collapsedBySpaceId[spaceId] ?? []

const withSection = (
	collapsed: string[],
	sectionId: string,
	isCollapsed: boolean,
) => {
	const without = collapsed.filter((id) => id !== sectionId)
	return isCollapsed ? [...without, sectionId] : without
}

export const createCollapsedSectionsController = (
	store: TranscriptStore,
	{ hostSpaceIdOf, isOnScreen }: SectionSpaces,
	{
		reportFailure = failureReporterIn("collapsed-sections-controller"),
	}: CollapsedSectionsOptions = {},
): CollapsedSectionsController => {
	const stateStore = createStore(initialCollapsedSectionsState)
	const current = stateStore.getState

	const enqueue = createQueue()

	const refuse = spaceWriteRefusalOf({
		raisedIn: "collapsed-sections-controller",
		isOnScreen,
		reportFailure,
	})

	const set = (collapsedBySpaceId: Record<string, string[]>) =>
		stateStore.setState({ collapsedBySpaceId })

	const hold = (spaceId: string, collapsed: string[]) =>
		set({ ...current().collapsedBySpaceId, [spaceId]: collapsed })

	const read = async (spaceId: string) => {
		const { collapsedSectionIds } = await store.spacePreferences(
			hostSpaceIdOf(spaceId),
		)
		hold(spaceId, collapsedSectionIds ?? [])
	}

	const reloadAll = () => {
		for (const spaceId of Object.keys(current().collapsedBySpaceId)) {
			void enqueue(() => read(spaceId)).catch(() => undefined)
		}
	}

	const writes = createWriteLoop<string[], SpacePreferences>({
		enqueue,
		write: (spaceId, collapsedSectionIds) =>
			store.setSpacePreferences(hostSpaceIdOf(spaceId), {
				collapsedSectionIds,
			}),
		apply: (spaceId, written) =>
			hold(spaceId, written.collapsedSectionIds ?? []),
		onRefused: (spaceId, reason) => {
			refuse(reason, spaceId)
			reloadAll()
		},
	})

	return {
		getState: current,

		subscribe: stateStore.subscribe,

		enter: (spaceId: string) =>
			enqueue(() => read(spaceId)).catch(() => undefined),

		keep: (spaceIds: string[]) => {
			const { collapsedBySpaceId } = current()
			const kept = Object.entries(collapsedBySpaceId).filter(([spaceId]) =>
				spaceIds.includes(spaceId),
			)
			if (kept.length !== Object.keys(collapsedBySpaceId).length) {
				set(Object.fromEntries(kept))
			}
		},

		collapse: (spaceId: string, sectionId: string, isCollapsed: boolean) => {
			const wanted = withSection(
				collapsedIn(current(), spaceId),
				sectionId,
				isCollapsed,
			)
			hold(spaceId, wanted)
			writes.push(spaceId, wanted)
		},
	}
}
