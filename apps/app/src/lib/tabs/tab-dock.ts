import { tabKeptIn } from "./tabs-mirror"
import type { Tab } from "./tabs-model"

import {
	commands,
	type ScreenPosition,
	type StripBounds,
	TAB_DRAG_EVENT,
	type TabDrag,
} from "../bindings"
import { readWindowOrigin, revealWindow, type WindowOrigin } from "../host"
import { createStore } from "../store"
import { listenOnThisWindow } from "../host/window-listen"

const STRIP_SELECTOR = '[data-slot="title-bar-tabs"]'

export type IncomingTab = {
	tab: Tab
	clientX: number
}

type TabDockSource = {
	windowLabel: string
	shownSpaceId: () => string
	receive: (tab: Tab, index: number) => void
}

type HeldDrag = {
	originSpaceId: string
	tab: Tab
	strip: StripBounds | null
	origin: WindowOrigin | null
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
		if (!held?.strip || !held.origin || !isSameSpace(held)) {
			return null
		}
		const clientX = point.x - held.origin.x
		const clientY = point.y - held.origin.y
		return holds(held.strip, clientX, clientY)
			? { tab: held.tab, clientX }
			: null
	}

	const readOrigin = (drag: HeldDrag) => {
		readWindowOrigin().then((origin) => {
			drag.origin = origin
		}, reportDockFailure)
	}

	const hold = (originSpaceId: string, packed: unknown) => {
		const tab = tabKeptIn(packed)
		held = tab
			? { originSpaceId, tab, strip: measuredStrip(), origin: null }
			: null
		if (!held) {
			return
		}
		reportPlace(shownSpaceId(), held.strip)
		readOrigin(held)
	}

	const take = (point: ScreenPosition) => {
		const parting = partingAt(point)
		const index = incomingIndex
		held = null
		part(null)
		if (!parting) {
			return
		}
		receive(parting.tab, index ?? Number.POSITIVE_INFINITY)
		revealWindow({ withFocus: true }).catch(reportDockFailure)
	}

	const release = () => {
		held = null
		part(null)
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
			take(drag.point)
		} else {
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
