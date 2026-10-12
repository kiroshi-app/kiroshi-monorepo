import { getRouteApi, useNavigate, useRouter } from "@tanstack/react-router"
import { type FormEvent, useState } from "react"

import { AUTHORIZE_COPY } from "./authorize-copy"
import type { AuthorizeState, ClosedKind } from "./authorize-state"
import { RelayFailureLine } from "./login-page"
import {
	CardHeading,
	Footnote,
	LoginShell,
	PrimaryButton,
	SecondaryButton,
	TextLink,
	TextLinkRow,
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

type ClosedCardProps = {
	kind: ClosedKind
}

const ClosedCard = ({ kind }: ClosedCardProps) => (
	<CardHeading {...CLOSED_HEADINGS[kind]} />
)

type ContinueAsCardProps = {
	account: Account
	onContinue: () => void
}

const ContinueAsCard = ({ account, onContinue }: ContinueAsCardProps) => {
	const signInAgain = useSignInAgain()

	const submit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault()
		onContinue()
	}

	return (
		<>
			<CardHeading
				lead={AUTHORIZE_COPY.continueAsLead(account.email)}
				title={AUTHORIZE_COPY.continueAsTitle(account.name ?? account.email)}
			/>
			<form className="contents" noValidate onSubmit={submit}>
				<PrimaryButton isBusy={false} label={AUTHORIZE_COPY.continueAs} />
			</form>
			<TextLinkRow>
				<TextLink onClick={() => void signInAgain()}>
					{AUTHORIZE_COPY.anotherAccount}
				</TextLink>
			</TextLinkRow>
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

	const approve = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault()
		decide(approveAuthorizationRequest, () =>
			navigate({ to: "/authorize/done", replace: true }),
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
			<Footnote>
				{AUTHORIZE_COPY.device(state.device.deviceName, state.device.platform)}
			</Footnote>
			<form className="contents" noValidate onSubmit={approve}>
				<PrimaryButton isBusy={call.isPending} label={AUTHORIZE_COPY.approve} />
				<SecondaryButton
					isBusy={call.isPending}
					label={AUTHORIZE_COPY.cancel}
					onClick={cancel}
				/>
			</form>
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

	if (closedAs) return <ClosedCard kind={closedAs} />
	if (!hasContinued && !state.isJustSignedIn) {
		return (
			<ContinueAsCard
				account={state.account}
				onContinue={() => setHasContinued(true)}
			/>
		)
	}
	return <ApproveCard onClosed={setClosedAs} state={state} />
}

export const AuthorizePage = () => {
	const state = authorizeRoute.useLoaderData()

	return (
		<LoginShell>
			{state.kind === "pending" ? (
				<PendingAuthorization key={state.request} state={state} />
			) : (
				<ClosedCard kind={state.kind} />
			)}
		</LoginShell>
	)
}

export const AuthorizeDonePage = () => (
	<LoginShell>
		<CardHeading
			lead={AUTHORIZE_COPY.doneLead}
			title={AUTHORIZE_COPY.doneTitle}
		/>
	</LoginShell>
)
