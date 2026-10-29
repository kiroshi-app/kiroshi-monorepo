import { useMutation } from "@tanstack/react-query"
import { useEffect, useRef, useSyncExternalStore } from "react"

import { i18n } from "@workspace/ui/lib/i18n"

import {
	countWaitingRows,
	type WaitingBadges,
	type WaitingRoster,
} from "./waiting-count"

import { commands } from "../bindings"

type DockBadgeRoster = WaitingRoster & {
	hasLoaded: boolean
	isRosterPending: boolean
}

type RosterSource = {
	getState: () => DockBadgeRoster
	subscribe: (listener: () => void) => () => void
}

type DockBadgeMount = WaitingBadges & {
	roster: RosterSource
	isDriverWindow: boolean
}

const setDockBadge = async (count: number) => {
	const result = await commands.badgeSet(count)
	if (result.status === "error") {
		throw new Error(result.error)
	}
}

const isRosterReady = (roster: DockBadgeRoster) =>
	roster.hasLoaded && !roster.isRosterPending

export const useDockBadge = ({
	roster,
	botBadges,
	conversationBadges,
	isDriverWindow,
}: DockBadgeMount) => {
	const { mutate: setBadge } = useMutation({
		mutationFn: setDockBadge,
		meta: {
			failureNotice: () => ({
				title: i18n.t("chat:screen.notice.dockBadgeFailed"),
			}),
			raisedIn: "use-dock-badge",
		},
	})
	const sentCount = useRef<number | undefined>(undefined)
	const count = useSyncExternalStore(roster.subscribe, () => {
		const state = roster.getState()
		return isDriverWindow && isRosterReady(state)
			? countWaitingRows(state, { botBadges, conversationBadges })
			: undefined
	})

	useEffect(() => {
		if (count === undefined || count === sentCount.current) {
			return
		}
		sentCount.current = count
		setBadge(count)
	}, [count, setBadge])
}
