import { getRouteApi } from "@tanstack/react-router"
import { useEffect, useState } from "react"

import { WEBSITE_COPY } from "./copy"
import { APP_STORE_URL, JOIN_COPY } from "./join-copy"
import {
	ClosedInvitation,
	DownloadLink,
	InvitationSummary,
	JoinDesktopActions,
	JoinDesktopFrame,
	JoinFootnote,
	type JoinLayout,
	JoinPhoneFrame,
	OpenInKiroshiLink,
	OpeningKiroshiAction,
	PhonePrimaryLink,
	PhoneSecondaryLink,
	type SpaceLines,
} from "./join-parts"
import { kiroshiLinkOf, universalLinkOf } from "./join-state"
import { AppleMark, DownloadMark } from "./page-marks"
import type { InvitationSpace } from "./relay"
import { type DownloadPlatform, useDownloadTarget } from "./use-download-target"

const joinRoute = getRouteApi("/join")

const APP_TAKEOVER_WAIT_MS = 2000

const EXPIRY_DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
	month: "long",
	day: "numeric",
})

const DOWNLOAD_LABEL: Record<DownloadPlatform, string> = {
	macos: WEBSITE_COPY.downloadActionMacOS,
	windows: WEBSITE_COPY.downloadActionWindows,
	linux: WEBSITE_COPY.downloadActionLinux,
	other: WEBSITE_COPY.downloadAction,
}

type OpenInvitationProps = {
	invitation: string
	space: InvitationSpace | null
}

type SummaryProps = {
	layout: JoinLayout
	space: InvitationSpace | null
}

const spaceInitialsOf = (spaceName: string) => {
	const [first = "", second = ""] = Array.from(spaceName).filter((character) =>
		/[\p{L}\p{N}]/u.test(character),
	)
	return `${first.toUpperCase()}${second.toLowerCase()}`
}

const spaceLinesOf = (space: InvitationSpace): SpaceLines => ({
	initials: spaceInitialsOf(space.name),
	invitedBy: JOIN_COPY.invitedBy(space.inviter),
	name: space.name,
	expiry: JOIN_COPY.worksUntil(EXPIRY_DATE_FORMAT.format(space.expiresAt)),
})

const Summary = ({ layout, space }: SummaryProps) => (
	<InvitationSummary
		layout={layout}
		learnMore={JOIN_COPY.learnMore}
		privacy={
			space ? JOIN_COPY.privacyIn(space.name) : JOIN_COPY.privacyInThisSpace
		}
		space={space && spaceLinesOf(space)}
	/>
)

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

const restingFootnoteOf = (
	platform: DownloadPlatform,
	space: InvitationSpace | null,
) => {
	if (platform === "windows") return JOIN_COPY.alsoOnBesideWindows
	if (platform === "linux") return JOIN_COPY.alsoOnBesideLinux
	return space ? JOIN_COPY.signInFor(space.name) : JOIN_COPY.signInForThisSpace
}

const ComputerJoin = ({ invitation, space }: OpenInvitationProps) => {
	const isAppMissing = useKiroshiHandoff(invitation)
	const download = useDownloadTarget()

	return (
		<JoinDesktopFrame>
			<Summary layout="desktop" space={space} />
			<JoinDesktopActions>
				{isAppMissing ? (
					<OpenInKiroshiLink
						href={kiroshiLinkOf(invitation)}
						label={JOIN_COPY.openInKiroshi}
					/>
				) : (
					<OpeningKiroshiAction label={JOIN_COPY.openingKiroshi} />
				)}
				<DownloadLink
					href={download.href}
					label={DOWNLOAD_LABEL[download.platform]}
					mark={
						download.platform === "macos" ? <AppleMark /> : <DownloadMark />
					}
					onClick={download.onActivate}
				/>
			</JoinDesktopActions>
			<JoinFootnote layout="desktop">
				{isAppMissing
					? restingFootnoteOf(download.platform, space)
					: JOIN_COPY.didntOpen}
			</JoinFootnote>
		</JoinDesktopFrame>
	)
}

const IPhoneJoin = ({ invitation, space }: OpenInvitationProps) => (
	<JoinPhoneFrame
		actions={
			<>
				<PhonePrimaryLink
					href={universalLinkOf(invitation)}
					label={JOIN_COPY.openInTheApp}
				/>
				<PhoneSecondaryLink href={APP_STORE_URL} label={JOIN_COPY.appStore} />
				<JoinFootnote layout="phone">
					{JOIN_COPY.alsoOnBesideIPhone}
				</JoinFootnote>
			</>
		}
	>
		<Summary layout="phone" space={space} />
	</JoinPhoneFrame>
)

const ClosedJoin = () => (
	<JoinDesktopFrame>
		<ClosedInvitation
			body={JOIN_COPY.closedBody}
			title={JOIN_COPY.closedTitle}
		/>
	</JoinDesktopFrame>
)

export const JoinPage = () => {
	const state = joinRoute.useLoaderData()

	if (state.kind === "closed") return <ClosedJoin />
	if (state.kind === "iphone")
		return <IPhoneJoin invitation={state.invitation} space={state.space} />
	return (
		<ComputerJoin
			invitation={state.invitation}
			key={state.invitation}
			space={state.space}
		/>
	)
}
