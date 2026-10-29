"use client"

import { type ReactNode, useId } from "react"
import { useTranslation } from "react-i18next"

import { type Icon, Icons } from "@workspace/ui/components/icons"
import {
	OnboardingButton,
	OnboardingHeading,
	OnboardingLink,
	OnboardingShell,
} from "@workspace/ui/components/onboarding-shell"
import { Input } from "@workspace/ui/components/ui/input"
import { cn } from "@workspace/ui/lib/utils"

type OnboardingConnectStep =
	| "loginFound"
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

type Tile = { Glyph: Icon; isFailure: boolean }

const LINK_TILE: Tile = { Glyph: Icons.Link, isFailure: false }
const BROWSER_TILE: Tile = { Glyph: Icons.Web, isFailure: false }
const KEY_TILE: Tile = { Glyph: Icons.Key, isFailure: false }
const FAILURE_TILE: Tile = { Glyph: Icons.AlertCircle, isFailure: true }

const TILES: Record<OnboardingConnectStep, Tile> = {
	loginFound: LINK_TILE,
	nothingFound: LINK_TILE,
	waitingForCode: BROWSER_TILE,
	connecting: BROWSER_TILE,
	cancelled: FAILURE_TILE,
	timedOut: FAILURE_TILE,
	linkRefused: FAILURE_TILE,
	agentMissing: FAILURE_TILE,
	keyField: KEY_TILE,
	keyRefused: FAILURE_TILE,
}

const HEADINGS = {
	loginFound: {
		title: "onboarding.account.question",
		body: "onboarding.account.use.description",
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

const COLUMN_CLASS = "flex w-100 max-w-full flex-col items-center gap-4"

const LINKS_CLASS = "flex flex-wrap justify-center gap-x-5 gap-y-2 pt-1"

type ConnectTileProps = { tile: Tile }

const ConnectTile = ({ tile: { Glyph, isFailure } }: ConnectTileProps) => (
	<span
		className={cn(
			"grid size-14 shrink-0 place-items-center rounded-[1rem]",
			isFailure ? "bg-destructive-tint" : "bg-muted/40",
		)}
		data-slot="onboarding-connect-tile"
	>
		<Glyph
			aria-hidden="true"
			className={cn(
				"size-6",
				isFailure ? "text-destructive" : "text-foreground",
			)}
			strokeWidth={1.8}
		/>
	</span>
)

type ConnectStatusProps = { children: string }

const ConnectStatus = ({ children }: ConnectStatusProps) => (
	<p
		className="flex items-center gap-2 text-compact text-muted-foreground leading-4.5"
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
		<div className="flex w-full flex-col gap-1.5">
			<label className="font-medium text-foreground text-xs" htmlFor={id}>
				{label}
			</label>
			<Input
				aria-describedby={describedBy}
				aria-invalid={isInvalid || undefined}
				autoComplete="off"
				className="h-9.5 rounded-control border-input bg-muted px-3 font-mono text-compact text-foreground leading-4.5 transition-none placeholder:font-sans placeholder:text-sm md:text-compact aria-invalid:ring-destructive/30 dark:aria-invalid:border-destructive dark:aria-invalid:ring-destructive/30"
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

type ConnectOptionProps = {
	number: number
	label: string
	description: string
	onClick: () => void
}

const ConnectOption = ({
	number,
	label,
	description,
	onClick,
}: ConnectOptionProps) => {
	const labelId = useId()
	const descriptionId = useId()

	return (
		<button
			aria-describedby={descriptionId}
			aria-labelledby={labelId}
			className="flex items-start gap-3 rounded-control bg-card p-3 text-start outline-offset-2"
			data-slot="onboarding-connect-option"
			onClick={onClick}
			type="button"
		>
			<span
				aria-hidden="true"
				className="grid size-5 shrink-0 place-items-center rounded-sm bg-muted font-medium text-[11px] text-muted-foreground leading-3"
			>
				{number}
			</span>
			<span className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className="font-medium text-foreground text-sm" id={labelId}>
					{label}
				</span>
				<span
					className="text-compact text-muted-foreground leading-5"
					id={descriptionId}
				>
					{description}
				</span>
			</span>
		</button>
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
	const heading = HEADINGS[step]

	const pasteKeyInstead = (
		<OnboardingLink onClick={onPasteKey}>
			{t("onboarding.code.exit")}
		</OnboardingLink>
	)

	const signInInstead = (
		<OnboardingLink onClick={onSignIn}>
			{t("onboarding.apiKey.exit")}
		</OnboardingLink>
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

	const signInFailed = (
		<div className={COLUMN_CLASS}>
			<OnboardingButton onClick={onSignIn}>
				{t("onboarding.signInFailed.retry.label")}
			</OnboardingButton>
			<div className={LINKS_CLASS}>{pasteKeyInstead}</div>
		</div>
	)

	const actions: Record<OnboardingConnectStep, ReactNode> = {
		loginFound: (
			<>
				<div className="flex w-110 max-w-full flex-col items-center gap-5">
					{account ? (
						<div
							className="flex w-full items-center gap-3 rounded-xl bg-muted/40 px-3.5 py-3"
							data-slot="onboarding-connect-account"
						>
							<span
								aria-hidden="true"
								className="grid size-9 shrink-0 place-items-center rounded-full bg-person-avatar font-semibold text-compact text-soft-foreground leading-4"
							>
								{account.initials}
							</span>
							<div className="flex min-w-0 flex-1 flex-col gap-0.5">
								<p className="break-words font-medium text-foreground text-sm">
									{account.email}
								</p>
								<p className="text-muted-foreground text-xs">
									{t("onboarding.connect.foundIn", { plan: account.plan })}
								</p>
							</div>
						</div>
					) : null}
					<OnboardingButton onClick={onUseAccount}>
						{t("onboarding.account.use.label")}
					</OnboardingButton>
				</div>
				<div className={LINKS_CLASS}>
					<OnboardingLink onClick={onUseAnotherAccount}>
						{t("onboarding.account.another.label")}
					</OnboardingLink>
				</div>
			</>
		),
		nothingFound: (
			<div className="flex w-105 max-w-full flex-col gap-1.5">
				<ConnectOption
					description={t("onboarding.access.signIn.description")}
					label={t("onboarding.access.signIn.label")}
					number={1}
					onClick={onSignIn}
				/>
				<ConnectOption
					description={t("onboarding.access.apiKey.description")}
					label={t("onboarding.access.apiKey.label")}
					number={2}
					onClick={onPasteKey}
				/>
			</div>
		),
		waitingForCode: (
			<div className={COLUMN_CLASS}>
				<ConnectStatus>{t("onboarding.connect.browser.waiting")}</ConnectStatus>
				{codeField}
				<OnboardingButton
					disabled={code.length === 0}
					onClick={() => onSubmitCode(code)}
				>
					{t("onboarding.connect.continue")}
				</OnboardingButton>
				<div className={LINKS_CLASS}>
					<OnboardingLink onClick={onReopenSignIn}>
						{t("onboarding.connect.browser.reopen")}
					</OnboardingLink>
					{pasteKeyInstead}
				</div>
			</div>
		),
		connecting: (
			<div className={COLUMN_CLASS}>
				<ConnectStatus>
					{t("onboarding.connect.browser.checking")}
				</ConnectStatus>
				{codeField}
				<OnboardingButton aria-busy="true" disabled>
					{t("onboarding.connect.connecting")}
				</OnboardingButton>
			</div>
		),
		cancelled: signInFailed,
		timedOut: signInFailed,
		linkRefused: signInFailed,
		agentMissing: (
			<div className={COLUMN_CLASS}>
				<OnboardingButton onClick={onDownloadAgain}>
					{t("onboarding.connect.agentMissing.download")}
				</OnboardingButton>
			</div>
		),
		keyField: (
			<div className={COLUMN_CLASS}>
				{keyField}
				<OnboardingButton
					disabled={apiKey.length === 0}
					onClick={() => onSubmitKey(apiKey)}
				>
					{t("onboarding.connect.continue")}
				</OnboardingButton>
				<div className={LINKS_CLASS}>{signInInstead}</div>
			</div>
		),
		keyRefused: (
			<div className={COLUMN_CLASS}>
				{keyField}
				<OnboardingButton onClick={onTryAnotherKey}>
					{t("onboarding.connection.keyFailed.anotherKey")}
				</OnboardingButton>
				<div className={LINKS_CLASS}>{signInInstead}</div>
			</div>
		),
	}

	return (
		<OnboardingShell
			className="gap-5 py-6"
			data-step={step}
			data-slot="onboarding-connect-screen"
		>
			<ConnectTile tile={TILES[step]} />
			<OnboardingHeading
				body={t(heading.body)}
				bodyId={bodyId}
				title={t(heading.title)}
				variant="connect"
			/>
			{actions[step]}
		</OnboardingShell>
	)
}

export {
	type OnboardingConnectAccount,
	OnboardingConnectScreen,
	type OnboardingConnectScreenProps,
	type OnboardingConnectStep,
}
