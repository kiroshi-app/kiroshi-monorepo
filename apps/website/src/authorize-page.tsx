import {
	getRouteApi,
	useLocation,
	useNavigate,
	useRouter,
} from "@tanstack/react-router"
import { useState } from "react"

import { initialsOf } from "@workspace/ui/components/initials-avatar"

import { AUTHORIZE_COPY } from "./authorize-copy"
import type { AuthorizeState, ClosedKind } from "./authorize-state"
import { RelayFailureLine } from "./login-page"
import {
	AccountCard,
	ActionStack,
	BenefitList,
	CardHeading,
	DeviceLine,
	Footnote,
	GhostButton,
	LoginShell,
	PrimaryButton,
	StatusChip,
} from "./login-parts"
import {
	type Account,
	approveAuthorizationRequest,
	cancelAuthorizationRequest,
	clearBearer,
	isRelayFailure,
} from "./relay"
import { useRelayCall } from "./use-relay-call"

const authorizeRoute = getRouteApi("/authorize")

type PendingState = Extract<AuthorizeState, { kind: "pending" }>

type Decision = (request: string) => Promise<void>

export type Approval = { deviceName: string; email: string }

const useSignInAgain = () => {
	const router = useRouter()
	return async () => {
		clearBearer()
		await router.invalidate()
	}
}

const CLOSED_HEADINGS = {
	expired: {
		title: AUTHORIZE_COPY.expiredTitle,
		lead: AUTHORIZE_COPY.expiredLead,
	},
	cancelled: {
		title: AUTHORIZE_COPY.cancelledTitle,
		lead: AUTHORIZE_COPY.cancelledLead,
	},
} satisfies Record<ClosedKind, { title: string; lead: string }>

type ClosedPageProps = {
	kind: ClosedKind
}

const ClosedPage = ({ kind }: ClosedPageProps) => (
	<LoginShell>
		<StatusChip status={kind} />
		<CardHeading {...CLOSED_HEADINGS[kind]} />
	</LoginShell>
)

const displayNameOf = (account: Account) => account.name ?? account.email

const firstNameOf = (account: Account) =>
	account.name?.split(/\s+/)[0] ?? account.email

type ContinueAsCardProps = {
	state: PendingState
	onContinue: () => void
}

const ContinueAsCard = ({ state, onContinue }: ContinueAsCardProps) => {
	const signInAgain = useSignInAgain()
	const { account } = state

	return (
		<>
			<CardHeading
				lead={AUTHORIZE_COPY.continueAsLead(state.device.deviceName)}
				title={AUTHORIZE_COPY.continueAsTitle}
			/>
			<AccountCard
				email={account.name ? account.email : undefined}
				initials={initialsOf(displayNameOf(account))}
				name={displayNameOf(account)}
				plan={account.plan ? AUTHORIZE_COPY.plans[account.plan] : undefined}
			/>
			<ActionStack onSubmit={onContinue}>
				<PrimaryButton
					isBusy={false}
					label={AUTHORIZE_COPY.continueAs(firstNameOf(account))}
				/>
				<GhostButton
					isBusy={false}
					label={AUTHORIZE_COPY.anotherAccount}
					onClick={() => void signInAgain()}
				/>
			</ActionStack>
		</>
	)
}

type ApproveCardProps = {
	state: PendingState
	onClosed: (kind: ClosedKind) => void
}

const ApproveCard = ({ state, onClosed }: ApproveCardProps) => {
	const navigate = useNavigate()
	const signInAgain = useSignInAgain()
	const call = useRelayCall()

	const decide = (
		decision: Decision,
		onDecided: () => Promise<void> | void,
	) => {
		void call.run(async () => {
			try {
				await decision(state.request)
			} catch (error) {
				if (isRelayFailure(error, "unauthorized")) return signInAgain()
				if (isRelayFailure(error, "unavailable")) return onClosed("expired")
				throw error
			}
			await onDecided()
		})
	}

	const approve = () => {
		const approval = {
			deviceName: state.device.deviceName,
			email: state.account.email,
		}
		decide(approveAuthorizationRequest, () =>
			navigate({ to: "/authorize/done", replace: true, state: { approval } }),
		)
	}

	const cancel = () =>
		decide(cancelAuthorizationRequest, () => onClosed("cancelled"))

	return (
		<>
			<CardHeading
				lead={AUTHORIZE_COPY.approveLead(state.account.email)}
				title={AUTHORIZE_COPY.approveTitle}
			/>
			<DeviceLine
				caption={AUTHORIZE_COPY.deviceCaption(
					state.device.platform,
					state.askedMinutesAgo,
				)}
				name={state.device.deviceName}
			/>
			<BenefitList benefits={AUTHORIZE_COPY.benefits} />
			<ActionStack onSubmit={approve}>
				<PrimaryButton isBusy={call.isPending} label={AUTHORIZE_COPY.approve} />
				<GhostButton
					isBusy={call.isPending}
					label={AUTHORIZE_COPY.cancel}
					onClick={cancel}
				/>
			</ActionStack>
			<RelayFailureLine failure={call.failure} onRetry={call.retry} />
			<Footnote>{AUTHORIZE_COPY.approveFootnote}</Footnote>
		</>
	)
}

type PendingAuthorizationProps = {
	state: PendingState
}

const PendingAuthorization = ({ state }: PendingAuthorizationProps) => {
	const [hasContinued, setHasContinued] = useState(false)
	const [closedAs, setClosedAs] = useState<ClosedKind | null>(null)

	if (closedAs) return <ClosedPage kind={closedAs} />
	return (
		<LoginShell width="wide">
			{hasContinued || state.isJustSignedIn ? (
				<ApproveCard onClosed={setClosedAs} state={state} />
			) : (
				<ContinueAsCard
					onContinue={() => setHasContinued(true)}
					state={state}
				/>
			)}
		</LoginShell>
	)
}

export const AuthorizePage = () => {
	const state = authorizeRoute.useLoaderData()

	if (state.kind !== "pending") return <ClosedPage kind={state.kind} />
	return <PendingAuthorization key={state.request} state={state} />
}

export const AuthorizeDonePage = () => {
	const approval = useLocation({
		select: (location) => location.state.approval,
	})

	if (!approval) return <ClosedPage kind="expired" />
	return (
		<LoginShell>
			<StatusChip status="signed-in" />
			<CardHeading
				lead={AUTHORIZE_COPY.doneLead(approval.deviceName, approval.email)}
				title={AUTHORIZE_COPY.doneTitle}
			/>
		</LoginShell>
	)
}
