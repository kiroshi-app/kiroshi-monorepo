import { getRouteApi } from "@tanstack/react-router"
import { useEffect, useState } from "react"

import { APP_STORE_URL, JOIN_COPY } from "./join-copy"
import { kiroshiLinkOf, universalLinkOf } from "./join-state"
import {
	ActionGroup,
	CardHeading,
	LoginShell,
	PrimaryLink,
	SecondaryLink,
	StatusChip,
} from "./login-parts"
import { useDownloadTarget } from "./use-download-target"

const joinRoute = getRouteApi("/join")

const APP_TAKEOVER_WAIT_MS = 2000

type InvitationProps = {
	invitation: string
}

const useKiroshiHandoff = (invitation: string) => {
	const [isAppMissing, setIsAppMissing] = useState(false)

	useEffect(() => {
		const listening = new AbortController()
		const timer = window.setTimeout(
			() => setIsAppMissing(true),
			APP_TAKEOVER_WAIT_MS,
		)
		const stopWaiting = () => window.clearTimeout(timer)
		const stopWaitingOnceHidden = () => {
			if (document.hidden) stopWaiting()
		}
		window.addEventListener("blur", stopWaiting, listening)
		document.addEventListener(
			"visibilitychange",
			stopWaitingOnceHidden,
			listening,
		)
		window.location.assign(kiroshiLinkOf(invitation))
		return () => {
			stopWaiting()
			listening.abort()
		}
	}, [invitation])

	return isAppMissing
}

const OpeningCard = () => (
	<CardHeading lead={JOIN_COPY.openingLead} title={JOIN_COPY.openingTitle} />
)

const VisitorCard = ({ invitation }: InvitationProps) => {
	const download = useDownloadTarget()

	return (
		<>
			<CardHeading
				lead={JOIN_COPY.visitorLead}
				title={JOIN_COPY.visitorTitle}
			/>
			<ActionGroup>
				<PrimaryLink
					href={download.href}
					label={JOIN_COPY.download}
					onClick={download.onActivate}
				/>
				<SecondaryLink
					href={kiroshiLinkOf(invitation)}
					label={JOIN_COPY.openAgain}
				/>
			</ActionGroup>
		</>
	)
}

const ComputerJoin = ({ invitation }: InvitationProps) => {
	const isAppMissing = useKiroshiHandoff(invitation)

	return isAppMissing ? (
		<VisitorCard invitation={invitation} />
	) : (
		<OpeningCard />
	)
}

const IPhoneJoin = ({ invitation }: InvitationProps) => (
	<>
		<CardHeading lead={JOIN_COPY.iphoneLead} title={JOIN_COPY.iphoneTitle} />
		<ActionGroup>
			<PrimaryLink
				href={universalLinkOf(invitation)}
				label={JOIN_COPY.openApp}
			/>
			<SecondaryLink href={APP_STORE_URL} label={JOIN_COPY.appStore} />
		</ActionGroup>
	</>
)

const ClosedInvitation = () => (
	<>
		<StatusChip status="expired" />
		<CardHeading lead={JOIN_COPY.closedLead} title={JOIN_COPY.closedTitle} />
	</>
)

const JoinStep = () => {
	const state = joinRoute.useLoaderData()

	if (state.kind === "closed") return <ClosedInvitation />
	if (state.kind === "iphone")
		return <IPhoneJoin invitation={state.invitation} />
	return <ComputerJoin invitation={state.invitation} key={state.invitation} />
}

export const JoinPage = () => (
	<LoginShell>
		<JoinStep />
	</LoginShell>
)
