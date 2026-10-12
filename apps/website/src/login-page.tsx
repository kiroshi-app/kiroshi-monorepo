import {
	type ErrorComponentProps,
	getRouteApi,
	useLocation,
	useNavigate,
	useRouter,
} from "@tanstack/react-router"
import { type FormEvent, useState } from "react"

import { Notice } from "@workspace/ui/components/notice"
import { SettingsField } from "@workspace/ui/components/settings-field"
import { Button } from "@workspace/ui/components/ui/button"

import { LOGIN_COPY } from "./login-copy"
import { landingOf } from "./login-search"
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

const CODE_LENGTH = 6

const RETRYABLE_FAILURES: ReadonlySet<RelayFailure> = new Set([
	"network",
	"server",
])

const isCodeFailure = (failure: RelayFailure | null): failure is CodeFailure =>
	failure?.startsWith("code-") ?? false

type FailureNoticeProps = {
	failure: RelayFailure | null
	isRetrying: boolean
	onRetry: () => void
}

const FailureNotice = ({
	failure,
	isRetrying,
	onRetry,
}: FailureNoticeProps) => {
	if (!failure || isCodeFailure(failure)) return null

	return (
		<Notice
			retry={
				RETRYABLE_FAILURES.has(failure)
					? { onRetry, isBusy: isRetrying }
					: undefined
			}
			title={LOGIN_COPY.failures[failure]}
		/>
	)
}

const SOCIAL_LABEL: Record<SocialProvider, string> = {
	google: LOGIN_COPY.continueWithGoogle,
	apple: LOGIN_COPY.continueWithApple,
}

type EmailStepProps = {
	onCodeSent: (email: string) => void
}

const EmailStep = ({ onCodeSent }: EmailStepProps) => {
	const [email, setEmail] = useState("")
	const loginHref = useLocation({ select: (location) => location.href })
	const call = useRelayCall()

	const continueWith = (provider: SocialProvider) =>
		call.run(async () => {
			const callbackURL = new URL(loginHref, window.location.origin).href
			window.location.assign(
				await requestSocialSignIn({ provider, callbackURL }),
			)
		})

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
			<h1>{LOGIN_COPY.signInTitle}</h1>
			{(["google", "apple"] as const).map((provider) => (
				<Button
					disabled={call.isPending}
					key={provider}
					onClick={() => void continueWith(provider)}
					type="button"
					variant="outline"
				>
					{SOCIAL_LABEL[provider]}
				</Button>
			))}
			<form noValidate onSubmit={submit}>
				<SettingsField
					kind="email"
					label={LOGIN_COPY.emailLabel}
					onValueChange={setEmail}
					value={email}
				/>
				<Button disabled={call.isPending} type="submit">
					{LOGIN_COPY.emailSubmit}
				</Button>
			</form>
			<FailureNotice
				failure={call.failure}
				isRetrying={call.isPending}
				onRetry={call.retry}
			/>
		</>
	)
}

type CodeStepProps = {
	email: string
	onSignedIn: () => Promise<void>
}

const CodeStep = ({ email, onSignedIn }: CodeStepProps) => {
	const [code, setCode] = useState("")
	const call = useRelayCall()

	const verify = (entered: string) =>
		call.run(async () => {
			await signInWithCode({ email, code: entered })
			await onSignedIn()
		})

	const enter = (value: string) => {
		const digits = value.replace(/\D/g, "").slice(0, CODE_LENGTH)
		setCode(digits)
		if (digits.length === CODE_LENGTH && !call.isPending) void verify(digits)
	}

	const askNewCode = () => {
		setCode("")
		void call.run(() => sendCode(email))
	}

	return (
		<>
			<h1>{LOGIN_COPY.codeTitle}</h1>
			<p>{`${LOGIN_COPY.codeSentTo} ${email}`}</p>
			<SettingsField
				error={
					isCodeFailure(call.failure)
						? LOGIN_COPY.failures[call.failure]
						: undefined
				}
				label={LOGIN_COPY.codeLabel}
				onValueChange={enter}
				readOnly={call.isPending}
				value={code}
			/>
			<Button
				disabled={call.isPending}
				onClick={askNewCode}
				type="button"
				variant="link"
			>
				{LOGIN_COPY.newCode}
			</Button>
			<FailureNotice
				failure={call.failure}
				isRetrying={call.isPending}
				onRetry={call.retry}
			/>
		</>
	)
}

type NameStepProps = {
	onNamed: () => Promise<void>
}

const NameStep = ({ onNamed }: NameStepProps) => {
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
		<form noValidate onSubmit={submit}>
			<h1>{LOGIN_COPY.nameTitle}</h1>
			<SettingsField
				error={isMissing ? LOGIN_COPY.nameMissing : undefined}
				label={LOGIN_COPY.nameLabel}
				onValueChange={setName}
				value={name}
			/>
			<Button disabled={call.isPending} type="submit">
				{LOGIN_COPY.nameSubmit}
			</Button>
			<FailureNotice
				failure={call.failure}
				isRetrying={call.isPending}
				onRetry={call.retry}
			/>
		</form>
	)
}

const LoginStep = () => {
	const { isSignedIn } = loginRoute.useLoaderData()
	const search = loginRoute.useSearch()
	const router = useRouter()
	const navigate = useNavigate()
	const [email, setEmail] = useState<string | null>(null)

	if (isSignedIn) {
		return <NameStep onNamed={() => navigate({ href: landingOf(search) })} />
	}
	if (email) {
		return <CodeStep email={email} onSignedIn={() => router.invalidate()} />
	}
	return <EmailStep onCodeSent={setEmail} />
}

export const LoginPage = () => (
	<main>
		<LoginStep />
	</main>
)

export const LoginLoadFailure = ({ error }: ErrorComponentProps) => {
	const router = useRouter()
	const failure = error instanceof RelayError ? error.failure : "server"

	return (
		<main>
			<Notice
				retry={{ onRetry: () => void router.invalidate() }}
				title={LOGIN_COPY.failures[failure]}
			/>
		</main>
	)
}
