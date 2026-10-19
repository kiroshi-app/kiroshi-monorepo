import { useEffect, useRef } from "react"

import {
	type InvitationsTransport,
	refusalNoticeOf,
} from "./invitations-transport"

import { failureReporterIn } from "../failure-report"
import { isDesktopHost } from "../host"

type JoinLinksTransport = Pick<
	InvitationsTransport,
	"onJoinLinkOpened" | "askForJoinLinks"
>

const reportFailure = failureReporterIn("use-join-links")

const reportRefusal = (reason: unknown) => {
	void reportFailure(refusalNoticeOf(reason))
}

export const useJoinLinks = (
	transport: JoinLinksTransport,
	open: (invitationId: string) => void,
) => {
	const hasAskedRef = useRef(false)

	useEffect(() => {
		if (!isDesktopHost()) return
		let isListening = true
		const askOnce = () => {
			if (!isListening || hasAskedRef.current) return
			hasAskedRef.current = true
			transport.askForJoinLinks().catch(reportRefusal)
		}
		const detach = transport.onJoinLinkOpened(open).then(
			(unlisten) => {
				askOnce()
				return unlisten
			},
			(reason: unknown) => {
				reportRefusal(reason)
				return undefined
			},
		)
		return () => {
			isListening = false
			void detach.then((unlisten) => unlisten?.())
		}
	}, [transport, open])
}
