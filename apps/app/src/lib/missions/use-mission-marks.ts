import { useCallback, useEffect, useRef, useState } from "react"

import { i18n } from "@workspace/ui/lib/i18n"

import { coalescedRead } from "./coalesced-read"
import type { MissionEntry } from "./missions-model"
import { missionsTransport } from "./missions-transport"

import { raiseReportedFailure } from "@/lib/failure-report"
import { isHostOffline } from "@/lib/host/host-offline"
import { isHostRefused } from "@/lib/host/host-refused"
import { useHostReconnections } from "@/lib/host/use-host-reconnections"
import { LOCAL_HOST, useReachableHost } from "@/lib/host/use-reachable-host"

type HeldMarks = {
	source: string
	entries: MissionEntry[]
}

type MarksRead = {
	source: string
	read: () => Promise<MissionEntry[]>
}

const NO_MARKS: MissionEntry[] = []

const marksReadOf = (
	host: string | null,
	spaceId: string | null,
): MarksRead | null => {
	if (host === LOCAL_HOST) {
		return { source: LOCAL_HOST, read: missionsTransport.board }
	}
	if (!host || !spaceId) {
		return null
	}
	return {
		source: `${host}/${spaceId}`,
		read: () => missionsTransport.spaceFeed(spaceId, Date.now()),
	}
}

const raiseUnavailableNotice = () =>
	raiseReportedFailure(
		{
			title: i18n.t("bots:roster.mission.unavailable.title"),
			description: i18n.t("bots:roster.mission.unavailable.description"),
		},
		{ raisedIn: "use-mission-marks" },
	)

export const useMissionMarks = (
	shownSpaceId: string | null,
): MissionEntry[] => {
	const [held, setHeld] = useState<HeldMarks | null>(null)
	const reads = useRef(0)
	const isFailureReported = useRef(false)
	const host = useReachableHost()

	const reload = useCallback(() => {
		reads.current += 1
		const marksRead = marksReadOf(host, shownSpaceId)
		if (!marksRead) {
			return
		}

		const ticket = reads.current
		const { source, read } = marksRead
		read().then(
			(entries) => {
				if (ticket !== reads.current) {
					return
				}
				isFailureReported.current = false
				setHeld({ source, entries })
			},
			(reason) => {
				if (ticket !== reads.current) {
					return
				}
				setHeld(null)
				if (
					isHostOffline(reason) ||
					isHostRefused(reason) ||
					isFailureReported.current
				) {
					return
				}
				isFailureReported.current = true
				raiseUnavailableNotice()
			},
		)
	}, [host, shownSpaceId])

	useEffect(reload, [reload])

	useHostReconnections(reload)

	useEffect(() => {
		const rereading = coalescedRead(reload)
		const listening = missionsTransport
			.onChanged(rereading.request)
			.catch((reason) => {
				console.error(
					"roster: mission changes could not be listened to",
					reason,
				)
				return () => undefined
			})

		return () => {
			rereading.cancel()
			void listening.then((unsubscribe) => unsubscribe())
		}
	}, [reload])

	const isShown =
		held !== null && held.source === marksReadOf(host, shownSpaceId)?.source
	return isShown ? held.entries : NO_MARKS
}
