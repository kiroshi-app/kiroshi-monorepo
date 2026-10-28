import type { BotBadge } from "./bot-badge"

import { createStore } from "../store"

type BadgedRow = {
	id: string
}

export type BadgeRuleInput<State> = {
	held: BotBadge
	before: State | undefined
	after: State
	isSelected: boolean
	hasFocus: boolean
}

type StateSource<State> = {
	stateFor: (id: string) => State | null
	subscribe: (listener: () => void) => () => void
}

type SelectionSource = {
	getState: () => {
		ids: string[]
		selectedId: string | null
	}
	subscribe: (listener: () => void) => () => void
}

export type BadgeSourceOptions<State> = {
	states: StateSource<State>
	selection: SelectionSource
	ruleOf: (input: BadgeRuleInput<State>) => BotBadge
	hasFocus: () => boolean
	watchFocus: (report: (isFocused: boolean) => void) => Promise<() => void>
}

export type BadgeReport = {
	readId: string | null
	changed: Record<string, BotBadge>
}

type BadgeReportListener = (report: BadgeReport) => void

export type BadgeSource = {
	getBadges: () => Record<string, BotBadge>
	raise: (id: string, badge: BotBadge) => void
	subscribe: (listener: () => void) => () => void
	start: () => () => void
	watchReports: (listener: BadgeReportListener) => () => void
	take: (windowLabel: string, report: BadgeReport) => void
	mirror: (badges: Record<string, BotBadge>) => void
}

export const rowIdsIn = (rosters: Record<string, BadgedRow[]>): string[] =>
	Object.values(rosters).flatMap((rows) => rows.map((row) => row.id))

export const createBadgeSource = <State>({
	states,
	selection,
	ruleOf,
	hasFocus,
	watchFocus,
}: BadgeSourceOptions<State>): BadgeSource => {
	const seen = new Map<string, State>()
	const readsElsewhere = new Map<string, string>()
	const reportListeners = new Set<BadgeReportListener>()

	const badges = createStore<Record<string, BotBadge>>({})
	let selectedId: string | null = null
	let windowFocus: boolean | undefined

	const isFocused = () => windowFocus ?? hasFocus()

	const readHere = () => (isFocused() ? selectedId : null)

	const isReadElsewhere = (id: string) =>
		[...readsElsewhere.values()].includes(id)

	const isRead = (id: string) => id === readHere() || isReadElsewhere(id)

	const heldOf = (id: string): BotBadge => badges.getState()[id] ?? "none"

	const forget = (ids: string[]) => {
		for (const id of seen.keys()) {
			if (!ids.includes(id)) {
				seen.delete(id)
			}
		}
	}

	const hasChanged = (next: Record<string, BotBadge>): boolean => {
		const keys = Object.keys(next)
		return (
			keys.length !== Object.keys(badges.getState()).length ||
			keys.some((id) => next[id] !== badges.getState()[id])
		)
	}

	const changesIn = (next: Record<string, BotBadge>) =>
		Object.fromEntries(
			Object.entries(next).filter(([id, badge]) => badge !== heldOf(id)),
		)

	const tellReports = (changed: Record<string, BotBadge>) => {
		const report = { readId: readHere(), changed }
		for (const listener of [...reportListeners]) {
			listener(report)
		}
	}

	const publish = (next: Record<string, BotBadge>) => {
		const changed = changesIn(next)
		if (hasChanged(next)) {
			badges.setState(next)
		}
		tellReports(changed)
	}

	const carriedOf = (id: string, held: BotBadge) =>
		held === "none" || isRead(id) ? undefined : held

	const badgeOf = (id: string, held: BotBadge): BotBadge | undefined => {
		const after = states.stateFor(id)
		if (!after) {
			seen.delete(id)
			return carriedOf(id, held)
		}
		const badge = ruleOf({
			held,
			before: seen.get(id),
			after,
			isSelected: id === selectedId || isReadElsewhere(id),
			hasFocus: isFocused() || isReadElsewhere(id),
		})
		seen.set(id, after)
		return badge
	}

	const refresh = (cleared: string | null = null) => {
		const { ids } = selection.getState()
		const next: Record<string, BotBadge> = {}

		for (const id of ids) {
			const badge = badgeOf(id, id === cleared ? "none" : heldOf(id))
			if (badge) {
				next[id] = badge
			}
		}

		forget(ids)
		publish(next)
	}

	const isShown = (id: string) => selection.getState().ids.includes(id)

	const raise = (id: string, badge: BotBadge) => {
		if (isRead(id) || !isShown(id)) {
			return
		}
		publish({ ...badges.getState(), [id]: badge })
	}

	const followReadElsewhere = (windowLabel: string, readId: string | null) => {
		if (readId === null) {
			readsElsewhere.delete(windowLabel)
			return
		}
		readsElsewhere.set(windowLabel, readId)
	}

	const take = (windowLabel: string, { readId, changed }: BadgeReport) => {
		followReadElsewhere(windowLabel, readId)
		const next = { ...badges.getState() }
		for (const [id, badge] of Object.entries(changed)) {
			if (isShown(id) && (badge === "none" || !isRead(id))) {
				next[id] = badge
			}
		}
		if (readId !== null && isShown(readId)) {
			next[readId] = "none"
		}
		publish(next)
	}

	const mirror = (shared: Record<string, BotBadge>) => {
		if (hasChanged(shared)) {
			badges.setState(shared)
		}
	}

	const watchReports = (listener: BadgeReportListener) => {
		reportListeners.add(listener)
		listener({ readId: readHere(), changed: {} })
		return () => {
			reportListeners.delete(listener)
		}
	}

	const followFocus = (isFocusedNow: boolean) => {
		windowFocus = isFocusedNow
		if (!isFocusedNow) {
			tellReports({})
			return
		}
		readsElsewhere.clear()
		refresh()
	}

	const followSelection = () => {
		const selected = selection.getState().selectedId
		if (selected === selectedId) {
			refresh()
			return
		}
		selectedId = selected
		refresh(selected)
	}

	return {
		getBadges: badges.getState,
		raise,
		subscribe: badges.subscribe,
		watchReports,
		take,
		mirror,
		start: () => {
			const stopStates = states.subscribe(refresh)
			const stopSelection = selection.subscribe(followSelection)
			const focus = watchFocus(followFocus).catch(() => undefined)

			followSelection()

			return () => {
				stopStates()
				stopSelection()
				void focus.then((stop) => stop?.())
			}
		},
	}
}
