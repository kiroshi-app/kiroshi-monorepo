"use client"

import { type ReactNode, useId, useState } from "react"
import { useTranslation } from "react-i18next"

import {
	OnboardingButton,
	type OnboardingButtonProps,
	OnboardingContent,
	OnboardingControls,
	OnboardingHeading,
	OnboardingShell,
} from "@workspace/ui/components/onboarding-shell"
import { Input } from "@workspace/ui/components/ui/input"
import {
	RadioGroup,
	RadioGroupItem,
} from "@workspace/ui/components/ui/radio-group"
import { cn } from "@workspace/ui/lib/utils"

type OnboardingConnectStep =
	| "loginFound"
	| "anotherAccount"
	| "nothingFound"
	| "waitingForCode"
	| "connecting"
	| "cancelled"
	| "timedOut"
	| "linkRefused"
	| "agentMissing"
	| "keyField"
	| "keyRefused"

type OnboardingConnectAccount = {
	email: string
	initials: string
	plan: string
}

type OnboardingConnectScreenProps = {
	step: OnboardingConnectStep
	account?: OnboardingConnectAccount
	code: string
	apiKey: string
	onCodeChange: (code: string) => void
	onApiKeyChange: (apiKey: string) => void
	onUseAccount: () => void
	onUseAnotherAccount: () => void
	onSignIn: () => void
	onReopenSignIn: () => void
	onPasteKey: () => void
	onSubmitCode: (code: string) => void
	onSubmitKey: (apiKey: string) => void
	onTryAnotherKey: () => void
	onDownloadAgain: () => void
}

const HEADINGS = {
	loginFound: {
		title: "onboarding.connect.loginFound.title",
		body: "onboarding.account.use.description",
	},
	anotherAccount: {
		title: "onboarding.access.question",
		body: "onboarding.account.another.description",
	},
	nothingFound: {
		title: "onboarding.connect.provider.title",
		body: "onboarding.connect.provider.body",
	},
	waitingForCode: {
		title: "onboarding.access.signIn.label",
		body: "onboarding.connect.browser.body",
	},
	connecting: {
		title: "onboarding.access.signIn.label",
		body: "onboarding.connect.browser.body",
	},
	cancelled: {
		title: "onboarding.signInFailed.title",
		body: "onboarding.connect.failed.cancelled",
	},
	timedOut: {
		title: "onboarding.signInFailed.title",
		body: "onboarding.connect.failed.timedOut",
	},
	linkRefused: {
		title: "onboarding.signInFailed.title",
		body: "onboarding.connect.failed.linkRefused",
	},
	agentMissing: {
		title: "onboarding.connect.agentMissing.title",
		body: "onboarding.connect.agentMissing.body",
	},
	keyField: {
		title: "onboarding.apiKey.question",
		body: "onboarding.connect.key.body",
	},
	keyRefused: {
		title: "onboarding.connection.keyFailed.title",
		body: "onboarding.connection.keyFailed.sentence",
	},
} as const satisfies Record<OnboardingConnectStep, unknown>

const COLUMN_CLASS = "flex w-105 max-w-full shrink-0 flex-col gap-2.5 pt-7"

const SECONDARY_ROW_CLASS = "flex flex-wrap justify-center"

type ConnectButtonProps = Omit<OnboardingButtonProps, "variant">

const ConnectPrimary = ({ className, ...props }: ConnectButtonProps) => (
	<OnboardingButton
		className={cn("h-10 px-6 data-disabled:opacity-45", className)}
		{...props}
	/>
)

const ConnectSecondary = ({ className, ...props }: ConnectButtonProps) => (
	<OnboardingButton
		className={cn("h-10 px-6 text-muted-foreground", className)}
		variant="ghost"
		{...props}
	/>
)

type ConnectStatusProps = { children: string }

const ConnectStatus = ({ children }: ConnectStatusProps) => (
	<p
		className="mb-1.5 flex items-center justify-center gap-2 text-compact text-muted-foreground leading-4.5"
		role="status"
	>
		<span
			aria-hidden="true"
			className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-input border-t-muted-foreground motion-reduce:animate-none"
			data-slot="onboarding-connect-spinner"
		/>
		{children}
	</p>
)

type ConnectFieldProps = {
	label: string
	value: string
	placeholder: string
	onChange: (value: string) => void
	isInvalid?: boolean
	describedBy?: string
	isReadOnly?: boolean
}

const ConnectField = ({
	label,
	value,
	placeholder,
	onChange,
	isInvalid = false,
	describedBy,
	isReadOnly = false,
}: ConnectFieldProps) => {
	const id = useId()

	return (
		<div className="flex w-full flex-col gap-2.5">
			<label
				className="font-medium text-compact text-foreground leading-4.5"
				htmlFor={id}
			>
				{label}
			</label>
			<Input
				aria-describedby={describedBy}
				aria-invalid={isInvalid || undefined}
				autoComplete="off"
				className="h-11 rounded-control border-input bg-muted px-3.5 font-mono text-compact text-foreground leading-4.5 transition-none placeholder:font-sans placeholder:text-sm md:text-compact aria-invalid:ring-destructive/30 dark:aria-invalid:border-destructive dark:aria-invalid:ring-destructive/30"
				id={id}
				onChange={(event) => onChange(event.target.value)}
				placeholder={placeholder}
				readOnly={isReadOnly}
				spellCheck={false}
				value={value}
			/>
		</div>
	)
}

type ConnectFormProps = {
	id: string
	value: string
	onSubmit: (value: string) => void
	children: ReactNode
}

const ConnectForm = ({ id, value, onSubmit, children }: ConnectFormProps) => (
	<form
		className={COLUMN_CLASS}
		id={id}
		noValidate
		onSubmit={(event) => {
			event.preventDefault()
			if (value.length > 0) onSubmit(value)
		}}
	>
		{children}
	</form>
)

type ConnectMethod = "signIn" | "apiKey"

const CONNECT_METHODS: ConnectMethod[] = ["signIn", "apiKey"]

type ConnectOptionProps = {
	method: ConnectMethod
}

const ConnectOption = ({ method }: ConnectOptionProps) => {
	const { t } = useTranslation("chat")
	const id = useId()
	const labelId = useId()
	const descriptionId = useId()

	return (
		<label
			className="flex cursor-pointer items-start gap-3 rounded-control border border-border bg-card px-4 py-3.5 text-start has-focus-visible:ring-3 has-focus-visible:ring-ring/30 has-data-checked:border-primary"
			data-slot="onboarding-connect-option"
			htmlFor={id}
		>
			<RadioGroupItem
				aria-describedby={descriptionId}
				aria-labelledby={labelId}
				className="mt-px size-4.5 border-[1.5px] border-input bg-transparent focus-visible:ring-0 data-checked:border-primary data-checked:bg-transparent dark:data-checked:bg-transparent [&_[data-slot=radio-group-indicator]>span]:size-2 [&_[data-slot=radio-group-indicator]>span]:bg-foreground"
				id={id}
				value={method}
			/>
			<span className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span
					className="font-medium text-foreground text-sm leading-5"
					id={labelId}
				>
					{t(`onboarding.access.${method}.label`)}
				</span>
				<span
					className="text-compact text-muted-foreground leading-4.5"
					id={descriptionId}
				>
					{t(`onboarding.access.${method}.description`)}
				</span>
			</span>
		</label>
	)
}

type ConnectMethodChoiceProps = {
	heading: ReactNode
	label: string
	onSignIn: () => void
	onPasteKey: () => void
}

const ConnectMethodChoice = ({
	heading,
	label,
	onSignIn,
	onPasteKey,
}: ConnectMethodChoiceProps) => {
	const { t } = useTranslation("chat")
	const [method, setMethod] = useState<ConnectMethod>("signIn")

	return (
		<>
			<OnboardingContent className="gap-6 pb-5">
				{heading}
				<RadioGroup
					aria-label={label}
					className="w-105 max-w-full gap-2"
					onValueChange={(value) =>
						setMethod(value === "apiKey" ? "apiKey" : "signIn")
					}
					value={method}
				>
					{CONNECT_METHODS.map((option) => (
						<ConnectOption key={option} method={option} />
					))}
				</RadioGroup>
			</OnboardingContent>
			<OnboardingControls>
				<ConnectPrimary onClick={method === "signIn" ? onSignIn : onPasteKey}>
					{t("onboarding.connect.continue")}
				</ConnectPrimary>
			</OnboardingControls>
		</>
	)
}

type ConnectSlots = {
	contentClassName?: string
	aboveHeading?: ReactNode
	belowHeading?: ReactNode
	controls: ReactNode
}

type ConnectAccountCardProps = { account: OnboardingConnectAccount }

const ConnectAccountCard = ({ account }: ConnectAccountCardProps) => {
	const { t } = useTranslation("chat")

	return (
		<div
			className="flex w-90 max-w-full shrink-0 flex-col items-center gap-1.5 rounded-2xl border border-border bg-card px-6 py-7 text-center"
			data-slot="onboarding-connect-account"
		>
			<span
				aria-hidden="true"
				className="mb-2.5 grid size-22 shrink-0 place-items-center rounded-full bg-muted font-semibold text-[28px] text-foreground leading-8"
			>
				{account.initials}
			</span>
			<p className="w-full break-words font-semibold text-base text-foreground leading-5.5">
				{account.email}
			</p>
			<p className="text-muted-foreground text-xs leading-4">
				{t("onboarding.connect.foundIn", { plan: account.plan })}
			</p>
		</div>
	)
}

const OnboardingConnectScreen = ({
	step,
	account,
	code,
	apiKey,
	onCodeChange,
	onApiKeyChange,
	onUseAccount,
	onUseAnotherAccount,
	onSignIn,
	onReopenSignIn,
	onPasteKey,
	onSubmitCode,
	onSubmitKey,
	onTryAnotherKey,
	onDownloadAgain,
}: OnboardingConnectScreenProps) => {
	const { t } = useTranslation("chat")
	const bodyId = useId()
	const formId = useId()
	const heading = HEADINGS[step]
	const title = t(heading.title)

	const headingNode = (
		<OnboardingHeading
			body={t(heading.body)}
			bodyId={bodyId}
			title={title}
			variant="connect"
		/>
	)

	const pasteKeyInstead = (
		<ConnectSecondary onClick={onPasteKey}>
			{t("onboarding.code.exit")}
		</ConnectSecondary>
	)

	const signInInstead = (
		<ConnectSecondary onClick={onSignIn}>
			{t("onboarding.apiKey.exit")}
		</ConnectSecondary>
	)

	const codeField = (
		<ConnectField
			isReadOnly={step === "connecting"}
			label={t("onboarding.code.question")}
			onChange={onCodeChange}
			placeholder={t("onboarding.connect.browser.placeholder")}
			value={code}
		/>
	)

	const keyField = (
		<ConnectField
			describedBy={step === "keyRefused" ? bodyId : undefined}
			isInvalid={step === "keyRefused"}
			label={t("onboarding.apiKey.entry")}
			onChange={onApiKeyChange}
			placeholder={t("onboarding.apiKey.placeholder")}
			value={apiKey}
		/>
	)

	const signInFailed: ConnectSlots = {
		controls: (
			<>
				<ConnectPrimary onClick={onSignIn}>
					{t("onboarding.signInFailed.retry.label")}
				</ConnectPrimary>
				{pasteKeyInstead}
			</>
		),
	}

	const slots: Record<
		Exclude<OnboardingConnectStep, "anotherAccount" | "nothingFound">,
		ConnectSlots
	> = {
		loginFound: {
			contentClassName: "gap-8",
			aboveHeading: account ? <ConnectAccountCard account={account} /> : null,
			controls: (
				<>
					<ConnectPrimary onClick={onUseAccount}>
						{t("onboarding.account.use.label")}
					</ConnectPrimary>
					<ConnectSecondary onClick={onUseAnotherAccount}>
						{t("onboarding.account.another.label")}
					</ConnectSecondary>
				</>
			),
		},
		waitingForCode: {
			belowHeading: (
				<ConnectForm id={formId} onSubmit={onSubmitCode} value={code}>
					<ConnectStatus>
						{t("onboarding.connect.browser.waiting")}
					</ConnectStatus>
					{codeField}
				</ConnectForm>
			),
			controls: (
				<>
					<ConnectPrimary
						disabled={code.length === 0}
						form={formId}
						type="submit"
					>
						{t("onboarding.connect.continue")}
					</ConnectPrimary>
					<div className={SECONDARY_ROW_CLASS}>
						<ConnectSecondary onClick={onReopenSignIn}>
							{t("onboarding.connect.browser.reopen")}
						</ConnectSecondary>
						{pasteKeyInstead}
					</div>
				</>
			),
		},
		connecting: {
			belowHeading: (
				<div className={COLUMN_CLASS}>
					<ConnectStatus>
						{t("onboarding.connect.browser.checking")}
					</ConnectStatus>
					{codeField}
				</div>
			),
			controls: (
				<ConnectPrimary aria-busy="true" disabled>
					{t("onboarding.connect.connecting")}
				</ConnectPrimary>
			),
		},
		cancelled: signInFailed,
		timedOut: signInFailed,
		linkRefused: signInFailed,
		agentMissing: {
			controls: (
				<ConnectPrimary onClick={onDownloadAgain}>
					{t("onboarding.connect.agentMissing.download")}
				</ConnectPrimary>
			),
		},
		keyField: {
			belowHeading: (
				<ConnectForm id={formId} onSubmit={onSubmitKey} value={apiKey}>
					{keyField}
				</ConnectForm>
			),
			controls: (
				<>
					<ConnectPrimary
						disabled={apiKey.length === 0}
						form={formId}
						type="submit"
					>
						{t("onboarding.connect.continue")}
					</ConnectPrimary>
					{signInInstead}
				</>
			),
		},
		keyRefused: {
			belowHeading: <div className={COLUMN_CLASS}>{keyField}</div>,
			controls: (
				<>
					<ConnectPrimary onClick={onTryAnotherKey}>
						{t("onboarding.connection.keyFailed.anotherKey")}
					</ConnectPrimary>
					{signInInstead}
				</>
			),
		},
	}

	return (
		<OnboardingShell data-step={step} data-slot="onboarding-connect-screen">
			{step === "anotherAccount" || step === "nothingFound" ? (
				<ConnectMethodChoice
					heading={headingNode}
					key={step}
					label={title}
					onPasteKey={onPasteKey}
					onSignIn={onSignIn}
				/>
			) : (
				<>
					<OnboardingContent className={slots[step].contentClassName ?? "pb-5"}>
						{slots[step].aboveHeading}
						{headingNode}
						{slots[step].belowHeading}
					</OnboardingContent>
					<OnboardingControls>{slots[step].controls}</OnboardingControls>
				</>
			)}
		</OnboardingShell>
	)
}

export {
	type OnboardingConnectAccount,
	OnboardingConnectScreen,
	type OnboardingConnectScreenProps,
	type OnboardingConnectStep,
}
