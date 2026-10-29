import {
	answerDock,
	awaitDockSettle,
	type DockedTab,
	type DockMessage,
	type DockMessageHeard,
	unpackDockedTab,
} from "./tab-dock-channel"
import type { Tab } from "./tabs-model"

import {
	commands,
	type Json,
	type ScreenPosition,
	type StripBounds,
	TAB_DRAG_EVENT,
	type TabDrag,
} from "../bindings"
import { readWindowOrigin, revealWindow } from "../host"
import { createStore } from "../store"
import { listenOnThisWindow } from "../host/window-listen"

const STRIP_SELECTOR = '[data-slot="title-bar-tabs"]'

type IncomingTab = {
	tab: Tab
	clientX: number
}

type TabDockSource = {
	windowLabel: string
	shownSpaceId: () => string
	receive: (tab: Tab, index: number) => void
}

type SettleHearing = Promise<DockMessageHeard | null>

type HeldDrag = DockedTab & {
	originSpaceId: string
	strip: StripBounds | null
}

const reportDockFailure = (reason: unknown) => {
	console.error("this window could not take part in the tab drag", reason)
}

const measuredStrip = (): StripBounds | null => {
	const strip = document.querySelector(STRIP_SELECTOR)
	if (!strip) {
		return null
	}
	const { x, y, width, height } = strip.getBoundingClientRect()
	return { x, y, width, height }
}

const reportUnheard = (reason: unknown) => {
	reportDockFailure(reason)
	return null
}

const stopHearing = (hearing: SettleHearing) => {
	void hearing.then((settle) => settle?.end(false))
}

const isUnsent = (reason: unknown) => {
	reportDockFailure(reason)
	return false
}

const holds = (strip: StripBounds, x: number, y: number) =>
	x >= strip.x &&
	x < strip.x + strip.width &&
	y >= strip.y &&
	y < strip.y + strip.height

const reportPlace = (spaceId: string, strip: StripBounds | null) => {
	commands.windowReportSpace(spaceId).catch(reportDockFailure)
	if (strip) {
		commands.windowReportStrip(strip).catch(reportDockFailure)
	}
}

export const createTabDock = (
	{ windowLabel, shownSpaceId, receive }: TabDockSource,
	listen = listenOnThisWindow,
) => {
	const store = createStore<IncomingTab | null>(null)
	let held: HeldDrag | null = null
	let incomingIndex: number | null = null
	let hearing: SettleHearing = Promise.resolve(null)

	const part = (incoming: IncomingTab | null) => {
		if (!incoming) {
			incomingIndex = null
		}
		if (incoming || store.getState()) {
			store.setState(incoming)
		}
	}

	const isSameSpace = (drag: HeldDrag) =>
		drag.originSpaceId !== "" && drag.originSpaceId === shownSpaceId()

	const partingAt = (point: ScreenPosition): IncomingTab | null => {
		if (!held?.strip || !isSameSpace(held)) {
			return null
		}
		const origin = readWindowOrigin()
		const clientX = point.x - origin.x
		const clientY = point.y - origin.y
		return holds(held.strip, clientX, clientY)
			? { tab: held.tab, clientX }
			: null
	}

	const releaseOnceSettled = async (
		drag: HeldDrag,
		heldHearing: SettleHearing,
	) => {
		const settle = await heldHearing
		await settle?.heard
		if (held === drag) {
			release()
		}
	}

	const hearSettleOf = (drag: HeldDrag) => {
		hearing = awaitDockSettle(windowLabel, drag.originTabId).catch(
			reportUnheard,
		)
		void releaseOnceSettled(drag, hearing)
	}

	const hold = (originSpaceId: string, packed: Json) => {
		stopHearing(hearing)
		const docked = unpackDockedTab(packed)
		held = docked ? { ...docked, originSpaceId, strip: measuredStrip() } : null
		if (!held) {
			return
		}
		hearSettleOf(held)
		reportPlace(shownSpaceId(), held.strip)
	}

	const release = () => {
		held = null
		part(null)
	}

	const isOverStripNow = (drag: HeldDrag, point: ScreenPosition) => {
		const strip = measuredStrip()
		if (!strip || !isSameSpace(drag)) {
			return false
		}
		const origin = readWindowOrigin()
		return holds(strip, point.x - origin.x, point.y - origin.y)
	}

	const isSettledTaken = async (
		answer: DockMessage,
		heldHearing: SettleHearing,
	) => {
		const settle = await heldHearing
		if (!settle) {
			return false
		}
		if (!(await answerDock(answer).then(() => true, isUnsent))) {
			settle.end(false)
		}
		return settle.heard
	}

	const take = async (drag: HeldDrag, point: ScreenPosition) => {
		const index = incomingIndex ?? Number.POSITIVE_INFINITY
		const heldHearing = hearing
		release()
		const isTaken = isOverStripNow(drag, point)
		const answer = { windowLabel, originTabId: drag.originTabId, isTaken }
		if (!isTaken) {
			stopHearing(heldHearing)
			await answerDock(answer).catch(reportDockFailure)
			return
		}
		if (!(await isSettledTaken(answer, heldHearing))) {
			return
		}
		receive(drag.tab, index)
		revealWindow({ withFocus: true }).catch(reportDockFailure)
	}

	const follow = (drag: TabDrag) => {
		if (drag.originLabel === windowLabel) {
			return
		}
		if (drag.kind === "started") {
			hold(drag.originSpaceId, drag.tab)
		} else if (drag.kind === "moved") {
			part(partingAt(drag.point))
		} else if (drag.kind === "dropped") {
			if (held) {
				void take(held, drag.point)
			}
		} else {
			stopHearing(hearing)
			release()
		}
	}

	return {
		getState: store.getState,
		subscribe: store.subscribe,
		follow,
		placeIncoming: (index: number) => {
			incomingIndex = index
		},
		watch: () =>
			listen<TabDrag>(TAB_DRAG_EVENT, ({ payload }) => follow(payload)),
	}
}

export type TabDock = ReturnType<typeof createTabDock>
