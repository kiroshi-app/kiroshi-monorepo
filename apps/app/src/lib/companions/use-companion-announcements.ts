import { useEffect, useRef } from "react"

import { i18n } from "@workspace/ui/lib/i18n"

import {
	type CompanionCreated,
	type CompanionSeedRefused,
	companionsTransport,
} from "./companions-transport"

import { raiseReportedFailure } from "../failure-report"

export type CompanionAnnouncements = {
	onCreated: (created: CompanionCreated) => void
	onHostCreated: () => void
	onFirstRunDone: () => void
}

export const useCompanionAnnouncements = (
	announcements: CompanionAnnouncements,
) => {
	const announce = useRef(announcements)
	const settled = useRef(new Set<string>())

	useEffect(() => {
		announce.current = announcements
	}, [announcements])

	useEffect(() => {
		let isListening = true

		const settleOnce = (key: string, settle: () => void) => {
			if (!isListening || settled.current.has(key)) {
				return
			}
			settled.current.add(key)
			settle()
		}

		const created = (companion: CompanionCreated) =>
			settleOnce(`created:${companion.id}`, () =>
				announce.current.onCreated(companion),
			)

		const refused = ({ reason }: CompanionSeedRefused) =>
			settleOnce(`refused:${reason}`, () =>
				raiseReportedFailure(
					{
						title: i18n.t("bots:roster.seedRefused"),
						description: reason,
					},
					{ raisedIn: "use-companion-announcements" },
				),
			)

		const listening = Promise.all([
			companionsTransport.onCreated(created),
			companionsTransport.onHostCreated(() => announce.current.onHostCreated()),
			companionsTransport.onFirstRunDone(() =>
				announce.current.onFirstRunDone(),
			),
			companionsTransport.onSeedRefused(refused),
		]).catch((reason) => {
			console.error(
				"companions: companion announcements could not be listened to",
				reason,
			)
			return []
		})

		void listening
			.then(() => companionsTransport.launchOutcome())
			.then((outcome) => {
				if (outcome.created) {
					created(outcome.created)
				}
				if (outcome.refused) {
					refused(outcome.refused)
				}
			})
			.catch((reason) => {
				console.error(
					"companions: the launch outcome could not be read",
					reason,
				)
			})

		return () => {
			isListening = false
			void listening.then((unsubscribes) => {
				for (const unsubscribe of unsubscribes) {
					unsubscribe()
				}
			})
		}
	}, [])
}
