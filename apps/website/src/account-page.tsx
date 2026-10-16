import { getRouteApi, useNavigate } from "@tanstack/react-router"
import { useState } from "react"

import { initialsOf } from "@workspace/ui/components/initials-avatar"
import { toRelativeTime } from "@workspace/ui/lib/time-format"

import { ACCOUNT_COPY } from "./account-copy"
import {
	AccountActions,
	AccountSection,
	AccountShell,
	type DeviceKind,
	Identity,
	PlanCard,
	SessionList,
	SessionRow,
	SignOutButton,
	TextButton,
} from "./account-parts"
import { RelayFailureLine } from "./login-page"
import {
	type Account,
	clearBearer,
	isRelayFailure,
	type Session,
	signOutCurrentSession,
	signOutEverywhere,
	signOutSession,
} from "./relay"
import { useRelayCall } from "./use-relay-call"

const accountRoute = getRouteApi("/account")

type SignOutRequest = () => Promise<void>

type SignedOutStep = () => Promise<void> | void

const useLeaveSignedOut = () => {
	const navigate = useNavigate()
	return async () => {
		clearBearer()
		await navigate({ to: "/login", search: {} })
	}
}

const useSignOutCall = () => {
	const call = useRelayCall()
	const leaveSignedOut = useLeaveSignedOut()

	const signOut = (request: SignOutRequest, onSignedOut: SignedOutStep) =>
		call.run(async () => {
			try {
				await request()
			} catch (error) {
				if (isRelayFailure(error, "unauthorized")) return leaveSignedOut()
				throw error
			}
			await onSignedOut()
		})

	return { ...call, signOut, leaveSignedOut }
}

const signOutKnownSession = async (id: string) => {
	try {
		await signOutSession(id)
	} catch (error) {
		if (!isRelayFailure(error, "unavailable")) throw error
	}
}

const browserAndOsOf = ({ browser, os }: Session) =>
	browser && os ? ACCOUNT_COPY.browserOnOs(browser, os) : (browser ?? os)

const sessionNameOf = (session: Session) =>
	session.deviceName ?? browserAndOsOf(session) ?? ACCOUNT_COPY.unknownDevice

const MINUTE_MS = 60_000

const sentenceCase = (text: string) =>
	text.charAt(0).toUpperCase() + text.slice(1)

const lastSeenOf = (lastSeenAt: number) => {
	const now = Date.now()
	if (now - lastSeenAt < MINUTE_MS) return ACCOUNT_COPY.activeNow
	return sentenceCase(toRelativeTime(lastSeenAt, now))
}

const PHONE_OSES: ReadonlySet<string> = new Set(["iOS", "Android"])

const deviceKindOf = (session: Session): DeviceKind => {
	if (session.platform === "ios") return "phone"
	if (PHONE_OSES.has(session.os ?? "")) return "phone"
	if (/macbook/i.test(session.deviceName ?? "")) return "laptop"
	return "desktop"
}

type SessionItemProps = {
	session: Session
	onSignedOut: (id: string) => void
}

const SessionItem = ({ session, onSignedOut }: SessionItemProps) => {
	const call = useSignOutCall()
	const name = sessionNameOf(session)

	const signOut = () =>
		call.signOut(
			() => signOutKnownSession(session.id),
			session.isCurrent ? call.leaveSignedOut : () => onSignedOut(session.id),
		)

	return (
		<SessionRow
			action={
				<SignOutButton
					confirmLabel={ACCOUNT_COPY.signOut}
					description={
						session.isCurrent
							? ACCOUNT_COPY.signOutThisDeviceLead
							: ACCOUNT_COPY.signOutDeviceLead(name)
					}
					isBusy={call.isPending}
					label={ACCOUNT_COPY.signOut}
					onConfirm={signOut}
					target={name}
					title={
						session.isCurrent
							? ACCOUNT_COPY.signOutThisDeviceTitle
							: ACCOUNT_COPY.signOutDeviceTitle(name)
					}
				/>
			}
			caption={ACCOUNT_COPY.sessionCaption(
				session.platform,
				lastSeenOf(session.lastSeenAt),
			)}
			currentTag={session.isCurrent ? ACCOUNT_COPY.thisDevice : undefined}
			failure={<RelayFailureLine failure={call.failure} onRetry={call.retry} />}
			kind={deviceKindOf(session)}
			name={name}
		/>
	)
}

type SessionsProps = {
	sessions: Session[]
}

const Sessions = ({ sessions }: SessionsProps) => {
	const [signedOutIds, setSignedOutIds] = useState<ReadonlySet<string>>(
		new Set(),
	)

	const forget = (id: string) => setSignedOutIds((ids) => new Set(ids).add(id))

	return (
		<SessionList>
			{sessions
				.filter((session) => !signedOutIds.has(session.id))
				.map((session) => (
					<SessionItem
						key={session.id}
						onSignedOut={forget}
						session={session}
					/>
				))}
		</SessionList>
	)
}

const SignOutEverywhere = () => {
	const call = useSignOutCall()

	return (
		<>
			<SignOutButton
				confirmLabel={ACCOUNT_COPY.signOut}
				description={ACCOUNT_COPY.signOutEverywhereLead}
				isBusy={call.isPending}
				label={ACCOUNT_COPY.signOutEverywhere}
				onConfirm={() => call.signOut(signOutEverywhere, call.leaveSignedOut)}
				title={ACCOUNT_COPY.signOutEverywhereTitle}
			/>
			<RelayFailureLine failure={call.failure} onRetry={call.retry} />
		</>
	)
}

type AccountIdentityProps = {
	account: Account
}

const AccountIdentity = ({ account }: AccountIdentityProps) => {
	const call = useSignOutCall()
	const displayName = account.name ?? account.email

	return (
		<Identity
			action={
				<TextButton
					isBusy={call.isPending}
					label={ACCOUNT_COPY.signOut}
					onClick={() =>
						call.signOut(signOutCurrentSession, call.leaveSignedOut)
					}
				/>
			}
			email={account.name ? account.email : undefined}
			failure={<RelayFailureLine failure={call.failure} onRetry={call.retry} />}
			initials={initialsOf(displayName)}
			name={displayName}
		/>
	)
}

const planOf = (account: Account) =>
	account.plan === "pro" ? ACCOUNT_COPY.plans.pro : ACCOUNT_COPY.plans.free

export const AccountPage = () => {
	const { account, sessions } = accountRoute.useLoaderData()

	return (
		<AccountShell>
			<AccountIdentity account={account} />
			<AccountSection heading={ACCOUNT_COPY.planHeading}>
				<PlanCard {...planOf(account)} />
			</AccountSection>
			<AccountSection heading={ACCOUNT_COPY.devicesHeading}>
				<Sessions sessions={sessions} />
				<AccountActions>
					<SignOutEverywhere />
				</AccountActions>
			</AccountSection>
		</AccountShell>
	)
}
