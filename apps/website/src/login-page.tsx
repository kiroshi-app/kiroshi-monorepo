import {
	type ErrorComponentProps,
	getRouteApi,
	useLocation,
	useNavigate,
	useRouter,
} from "@tanstack/react-router"
import { type FormEvent, type ReactNode, useState } from "react"

import { LOGIN_COPY } from "./login-copy"
import {
	ActionGroup,
	CardHeading,
	CodeEntry,
	FailureLine,
	Footnote,
	LoginShell,
	MailTile,
	OrDivider,
	PrimaryButton,
	SocialButton,
	TextField,
	TextLink,
	TextLinkRow,
} from "./login-parts"
import { landingOf } from "./login-search"
import { AppleMark, GoogleMark } from "./page-marks"
import {
	type CodeFailure,
	RelayError,
	type RelayFailure,
	requestSocialSignIn,
	type SocialProvider,
	saveName,
	sendCode,
	signInWithCode,
} from "./relay"
import { useRelayCall } from "./use-relay-call"

const loginRoute = getRouteApi("/login")

const CODE_POSITIONS = [0, 1, 2, 3, 4, 5] as const

const RETRYABLE_FAILURES: ReadonlySet<RelayFailure> = new Set([
	"network",
	"server",
])

const isCodeFailure = (failure: RelayFailure | null): failure is CodeFailure =>
	failure?.startsWith("code-") ?? false

type RelayFailureLineProps = {
	failure: RelayFailure | null
	onRetry: () => void
}

const RelayFailureLine = ({ failure, onRetry }: RelayFailureLineProps) => {
	if (!failure || isCodeFailure(failure)) return null

	return (
		<FailureLine
			message={LOGIN_COPY.failures[failure]}
			onRetry={RETRYABLE_FAILURES.has(failure) ? onRetry : undefined}
		/>
	)
}

type SocialEntry = {
	provider: SocialProvider
	mark: ReactNode
	label: string
}

const SOCIAL_ENTRIES: SocialEntry[] = [
	{
		provider: "google",
		mark: <GoogleMark />,
		label: LOGIN_COPY.continueWithGoogle,
	},
	{
		provider: "apple",
		mark: <AppleMark />,
		label: LOGIN_COPY.continueWithApple,
	},
]

type EmailStepProps = {
	initialEmail: string
	onCodeSent: (email: string) => void
}

const EmailStep = ({ initialEmail, onCodeSent }: EmailStepProps) => {
	const [email, setEmail] = useState(initialEmail)
	const loginHref = useLocation({ select: (location) => location.href })
	const call = useRelayCall()

	const continueWith = (provider: SocialProvider) => {
		if (call.isPending) return
		void call.run(async () => {
			const callbackURL = new URL(loginHref, window.location.origin).href
			window.location.assign(
				await requestSocialSignIn({ provider, callbackURL }),
			)
		})
	}

	const submit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault()
		const address = email.trim()
		void call.run(async () => {
			await sendCode(address)
			onCodeSent(address)
		})
	}

	return (
		<>
			<CardHeading
				lead={LOGIN_COPY.signInLead}
				title={LOGIN_COPY.signInTitle}
			/>
			<form className="contents" noValidate onSubmit={submit}>
				<TextField
					autoComplete="email"
					label={LOGIN_COPY.emailLabel}
					onValueChange={setEmail}
					placeholder={LOGIN_COPY.emailPlaceholder}
					type="email"
					value={email}
				/>
				<PrimaryButton isBusy={call.isPending} label={LOGIN_COPY.emailSubmit} />
			</form>
			<ActionGroup>
				<OrDivider />
				{SOCIAL_ENTRIES.map(({ provider, mark, label }) => (
					<SocialButton
						key={provider}
						label={label}
						mark={mark}
						onClick={() => continueWith(provider)}
					/>
				))}
			</ActionGroup>
			<RelayFailureLine failure={call.failure} onRetry={call.retry} />
			<Footnote>{LOGIN_COPY.signInFootnote}</Footnote>
		</>
	)
}

type CodeStepProps = {
	email: string
	onSignedIn: () => Promise<void>
	onOtherEmail: () => void
}

const CodeStep = ({ email, onSignedIn, onOtherEmail }: CodeStepProps) => {
	const [code, setCode] = useState("")
	const call = useRelayCall()

	const verify = (entered: string) =>
		call.run(async () => {
			await signInWithCode({ email, code: entered })
			await onSignedIn()
		})

	const enter = (value: string) => {
		const digits = value.replace(/\D/g, "").slice(0, CODE_POSITIONS.length)
		setCode(digits)
		if (digits.length === CODE_POSITIONS.length && !call.isPending) {
			void verify(digits)
		}
	}

	const askNewCode = () => {
		setCode("")
		void call.run(() => sendCode(email))
	}

	return (
		<>
			<MailTile />
			<CardHeading
				lead={LOGIN_COPY.codeLead(email)}
				title={LOGIN_COPY.codeTitle}
			/>
			<CodeEntry
				code={code}
				error={
					isCodeFailure(call.failure)
						? LOGIN_COPY.failures[call.failure]
						: undefined
				}
				isBusy={call.isPending}
				label={LOGIN_COPY.codeLabel}
				onCodeChange={enter}
				positions={CODE_POSITIONS}
			/>
			<RelayFailureLine failure={call.failure} onRetry={call.retry} />
			<TextLinkRow>
				<TextLink onClick={askNewCode}>{LOGIN_COPY.newCode}</TextLink>
				<TextLink onClick={onOtherEmail}>{LOGIN_COPY.anotherEmail}</TextLink>
			</TextLinkRow>
		</>
	)
}

type NameStepProps = {
	email: string
	onNamed: () => Promise<void>
}

const NameStep = ({ email, onNamed }: NameStepProps) => {
	const [name, setName] = useState("")
	const [hasSubmitted, setHasSubmitted] = useState(false)
	const call = useRelayCall()
	const isMissing = hasSubmitted && name.trim().length === 0

	const submit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault()
		setHasSubmitted(true)
		const trimmed = name.trim()
		if (trimmed.length === 0) return
		void call.run(async () => {
			await saveName(trimmed)
			await onNamed()
		})
	}

	return (
		<>
			<CardHeading
				lead={LOGIN_COPY.nameLead(email)}
				title={LOGIN_COPY.nameTitle}
			/>
			<form className="contents" noValidate onSubmit={submit}>
				<TextField
					autoComplete="name"
					error={isMissing ? LOGIN_COPY.nameMissing : undefined}
					label={LOGIN_COPY.nameLabel}
					onValueChange={setName}
					type="text"
					value={name}
				/>
				<PrimaryButton isBusy={call.isPending} label={LOGIN_COPY.nameSubmit} />
			</form>
			<RelayFailureLine failure={call.failure} onRetry={call.retry} />
			<Footnote>{LOGIN_COPY.nameFootnote}</Footnote>
		</>
	)
}

const LoginStep = () => {
	const { unnamedEmail } = loginRoute.useLoaderData()
	const search = loginRoute.useSearch()
	const router = useRouter()
	const navigate = useNavigate()
	const [email, setEmail] = useState("")
	const [isCodeSent, setIsCodeSent] = useState(false)

	const showCodeStep = (address: string) => {
		setEmail(address)
		setIsCodeSent(true)
	}

	if (unnamedEmail) {
		return (
			<NameStep
				email={unnamedEmail}
				onNamed={() => navigate({ href: landingOf(search) })}
			/>
		)
	}
	if (isCodeSent) {
		return (
			<CodeStep
				email={email}
				onOtherEmail={() => setIsCodeSent(false)}
				onSignedIn={() => router.invalidate()}
			/>
		)
	}
	return <EmailStep initialEmail={email} onCodeSent={showCodeStep} />
}

export const LoginPage = () => (
	<LoginShell>
		<LoginStep />
	</LoginShell>
)

export const LoginLoadFailure = ({ error }: ErrorComponentProps) => {
	const router = useRouter()
	const failure = error instanceof RelayError ? error.failure : "server"

	return (
		<LoginShell>
			<FailureLine
				message={LOGIN_COPY.failures[failure]}
				onRetry={() => void router.invalidate()}
			/>
		</LoginShell>
	)
}
