import { getRouteApi, useNavigate } from "@tanstack/react-router"
import { useState } from "react"

import { initialsOf } from "@workspace/ui/components/initials-avatar"
import { toRelativeTime } from "@workspace/ui/lib/time-format"

import { ACCOUNT_COPY } from "./account-copy"
import {
	AccountActions,
	AccountSection,
	PlanLine,
	SessionList,
	SessionRow,
	SignOutButton,
} from "./account-parts"
import { RelayFailureLine } from "./login-page"
import { AccountCard, CardHeading, LoginShell } from "./login-parts"
import {
	type Account,
	clearBearer,
	isRelayFailure,
	type Session,
	signOutEverywhere,
	signOutSession,
	signOutSite,
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

const sessionNameOf = (session: Session) =>
	session.deviceName ?? ACCOUNT_COPY.unknownDevice

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
							: ACCOUNT_COPY.signOutDeviceLead
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
					tone="row"
				/>
			}
			caption={ACCOUNT_COPY.sessionCaption(
				session.platform,
				toRelativeTime(session.lastSeenAt, Date.now()),
			)}
			currentTag={session.isCurrent ? ACCOUNT_COPY.thisDevice : undefined}
			failure={<RelayFailureLine failure={call.failure} onRetry={call.retry} />}
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

type AccountSignOutProps = {
	label: string
	title: string
	description: string
	request: SignOutRequest
}

const AccountSignOut = ({
	label,
	title,
	description,
	request,
}: AccountSignOutProps) => {
	const call = useSignOutCall()

	return (
		<>
			<SignOutButton
				confirmLabel={ACCOUNT_COPY.signOut}
				description={description}
				isBusy={call.isPending}
				label={label}
				onConfirm={() => call.signOut(request, call.leaveSignedOut)}
				title={title}
				tone="ghost"
			/>
			<RelayFailureLine failure={call.failure} onRetry={call.retry} />
		</>
	)
}

const planLineOf = (account: Account) =>
	account.plan === "pro" ? ACCOUNT_COPY.plans.pro : ACCOUNT_COPY.plans.free

export const AccountPage = () => {
	const { account, sessions } = accountRoute.useLoaderData()
	const displayName = account.name ?? account.email

	return (
		<LoginShell width="wide">
			<CardHeading lead={ACCOUNT_COPY.lead} title={ACCOUNT_COPY.title} />
			<AccountCard
				email={account.name ? account.email : undefined}
				initials={initialsOf(displayName)}
				name={displayName}
			/>
			<AccountSection heading={ACCOUNT_COPY.planHeading}>
				<PlanLine {...planLineOf(account)} />
			</AccountSection>
			<AccountSection heading={ACCOUNT_COPY.devicesHeading}>
				<Sessions sessions={sessions} />
			</AccountSection>
			<AccountActions>
				<AccountSignOut
					description={ACCOUNT_COPY.signOutEverywhereLead}
					label={ACCOUNT_COPY.signOutEverywhere}
					request={signOutEverywhere}
					title={ACCOUNT_COPY.signOutEverywhereTitle}
				/>
				<AccountSignOut
					description={ACCOUNT_COPY.signOutSiteLead}
					label={ACCOUNT_COPY.signOut}
					request={signOutSite}
					title={ACCOUNT_COPY.signOutSiteTitle}
				/>
			</AccountActions>
		</LoginShell>
	)
}
