import { type FormEvent, type MouseEvent, type ReactNode, useId } from "react"

import { cn } from "@workspace/ui/lib/utils"

import { LOGIN_COPY } from "./login-copy"
import {
	BenefitMark,
	CancelledMark,
	DeviceMark,
	ExpiredMark,
	MailMark,
	SignedInMark,
} from "./page-marks"

const FOCUS_HALO = "outline-none focus-visible:shadow-field-focus"

const ACTION = `${FOCUS_HALO} h-9 w-full rounded-[12px] text-sm leading-[18px] font-medium`

const FIELD_CONTROL =
	"h-9 rounded-lg bg-card px-3 text-sm leading-[18px] shadow-field outline-none placeholder:text-muted-foreground focus:shadow-field-focus"

const focusOnMount = (node: HTMLElement | null) => {
	node?.focus()
}

type ChildrenProps = {
	children: ReactNode
}

const CARD_WIDTHS = {
	regular: "w-95",
	wide: "w-100",
}

type LoginShellProps = ChildrenProps & {
	width?: keyof typeof CARD_WIDTHS
}

export const SiteHeader = () => (
	<header className="flex items-center gap-2 text-[15px] leading-[18px] font-semibold tracking-[-0.01em]">
		<img
			alt=""
			className="h-5 w-[22px] dark:invert"
			height={20}
			src="/kiroshi-mark.svg"
			width={22}
		/>
		{LOGIN_COPY.brand}
	</header>
)

export const LoginShell = ({
	children,
	width = "regular",
}: LoginShellProps) => (
	<div className="flex min-h-dvh flex-col bg-background px-8 py-7 text-foreground [font-synthesis:none]">
		<SiteHeader />
		<main className="flex flex-1 items-center justify-center pb-15">
			<section
				className={cn(
					"flex max-w-full flex-col gap-6 rounded-[18px] bg-card p-8 shadow-edge",
					CARD_WIDTHS[width],
				)}
			>
				{children}
			</section>
		</main>
	</div>
)

type CardHeadingProps = {
	title: string
	lead: string
}

export const CardHeading = ({ title, lead }: CardHeadingProps) => (
	<div className="flex flex-col gap-1.5">
		<h1 className="font-sans text-[22px] leading-7 font-semibold tracking-[-0.015em]">
			{title}
		</h1>
		<p className="text-sm leading-5 text-pretty wrap-anywhere text-muted-foreground">
			{lead}
		</p>
	</div>
)

export const MailTile = () => (
	<div className="flex size-10 items-center justify-center rounded-[12px] bg-mail-tile text-mail-glyph">
		<MailMark />
	</div>
)

type FailureLineProps = {
	message: string
	id?: string
	onRetry?: () => void
}

export const FailureLine = ({ message, id, onRetry }: FailureLineProps) => (
	<div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
		<p className="text-xs text-destructive" id={id} role="alert">
			{message}
		</p>
		{onRetry ? <TextLink onClick={onRetry}>{LOGIN_COPY.retry}</TextLink> : null}
	</div>
)

type TextFieldProps = {
	label: string
	value: string
	onValueChange: (value: string) => void
	autoComplete: "email" | "name"
	type: "email" | "text"
	placeholder?: string
	error?: string
}

export const TextField = ({
	label,
	value,
	onValueChange,
	autoComplete,
	type,
	placeholder,
	error,
}: TextFieldProps) => {
	const id = useId()
	const errorId = `${id}-error`

	return (
		<div className="flex flex-col gap-1.5">
			<label className="text-compact leading-[18px] font-medium" htmlFor={id}>
				{label}
			</label>
			<input
				aria-describedby={error ? errorId : undefined}
				aria-invalid={error ? true : undefined}
				autoComplete={autoComplete}
				className={FIELD_CONTROL}
				id={id}
				onChange={(event) => onValueChange(event.target.value)}
				placeholder={placeholder}
				ref={focusOnMount}
				type={type}
				value={value}
			/>
			{error ? <FailureLine id={errorId} message={error} /> : null}
		</div>
	)
}

type CodeCellProps = {
	digit?: string
	isActive: boolean
}

const CodeCell = ({ digit, isActive }: CodeCellProps) => (
	<span
		aria-hidden="true"
		className={cn(
			"flex h-12 flex-1 items-center justify-center rounded-lg bg-card text-[22px] leading-7 font-medium shadow-field",
			isActive && "group-focus-within:shadow-field-focus",
		)}
	>
		{digit ??
			(isActive ? (
				<span className="hidden h-[22px] w-[1.5px] bg-foreground group-focus-within:block" />
			) : null)}
	</span>
)

type CodeEntryProps = {
	code: string
	positions: readonly number[]
	label: string
	isBusy: boolean
	onCodeChange: (value: string) => void
	error?: string
}

export const CodeEntry = ({
	code,
	positions,
	label,
	isBusy,
	onCodeChange,
	error,
}: CodeEntryProps) => {
	const errorId = useId()
	const activePosition = Math.min(code.length, positions.length - 1)

	return (
		<div className="flex flex-col gap-1.5">
			<div className="group relative flex gap-2">
				{positions.map((position) => (
					<CodeCell
						digit={code[position]}
						isActive={position === activePosition}
						key={position}
					/>
				))}
				<input
					aria-describedby={error ? errorId : undefined}
					aria-invalid={error ? true : undefined}
					aria-label={label}
					autoComplete="one-time-code"
					className="absolute inset-0 size-full cursor-text bg-transparent text-base text-transparent caret-transparent outline-none selection:bg-transparent"
					inputMode="numeric"
					onChange={(event) => onCodeChange(event.target.value)}
					pattern="[0-9]*"
					readOnly={isBusy}
					ref={focusOnMount}
					value={code}
				/>
			</div>
			{error ? <FailureLine id={errorId} message={error} /> : null}
		</div>
	)
}

type PrimaryButtonProps = {
	label: string
	isBusy: boolean
}

export const PrimaryButton = ({ label, isBusy }: PrimaryButtonProps) => (
	<button
		className={`${ACTION} bg-primary text-primary-foreground hover:bg-primary/90`}
		disabled={isBusy}
		type="submit"
	>
		{label}
	</button>
)

type LinkActionProps = {
	label: string
	href: string
	onClick?: (event: MouseEvent<HTMLAnchorElement>) => void
}

const LINK_ACTION = `${ACTION} flex items-center justify-center`

export const PrimaryLink = ({ label, href, onClick }: LinkActionProps) => (
	<a
		className={`${LINK_ACTION} bg-primary text-primary-foreground hover:bg-primary/90`}
		href={href}
		onClick={onClick}
	>
		{label}
	</a>
)

export const SecondaryLink = ({ label, href }: LinkActionProps) => (
	<a
		className={`${LINK_ACTION} bg-card shadow-field hover:bg-accent`}
		href={href}
	>
		{label}
	</a>
)

type GhostButtonProps = {
	label: string
	isBusy: boolean
	onClick: () => void
}

export const GhostButton = ({ label, isBusy, onClick }: GhostButtonProps) => (
	<button
		className={`${ACTION} hover:bg-accent`}
		disabled={isBusy}
		onClick={onClick}
		type="button"
	>
		{label}
	</button>
)

type SocialButtonProps = {
	mark: ReactNode
	label: string
	onClick: () => void
}

export const SocialButton = ({ mark, label, onClick }: SocialButtonProps) => (
	<button
		className={`${ACTION} flex items-center justify-center gap-2 bg-card shadow-field hover:bg-accent`}
		onClick={onClick}
		type="button"
	>
		{mark}
		{label}
	</button>
)

export const ActionGroup = ({ children }: ChildrenProps) => (
	<div className="flex flex-col gap-2.5">{children}</div>
)

export const OrDivider = () => (
	<div className="flex items-center gap-3 text-xs text-muted-foreground">
		<span aria-hidden="true" className="h-px flex-1 bg-border" />
		{LOGIN_COPY.or}
		<span aria-hidden="true" className="h-px flex-1 bg-border" />
	</div>
)

export const Footnote = ({ children }: ChildrenProps) => (
	<p className="text-xs text-pretty text-muted-foreground">{children}</p>
)

export const TextLinkRow = ({ children }: ChildrenProps) => (
	<div className="flex flex-wrap gap-4">{children}</div>
)

type TextLinkProps = {
	children: ReactNode
	onClick: () => void
}

export const TextLink = ({ children, onClick }: TextLinkProps) => (
	<button
		className="rounded-sm text-compact leading-[18px] text-foreground underline decoration-1 underline-offset-2 outline-none focus-visible:shadow-field-focus"
		onClick={onClick}
		type="button"
	>
		{children}
	</button>
)

type ActionStackProps = ChildrenProps & {
	onSubmit: () => void
}

export const ActionStack = ({ children, onSubmit }: ActionStackProps) => {
	const submit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault()
		onSubmit()
	}

	return (
		<form className="flex flex-col gap-2" noValidate onSubmit={submit}>
			{children}
		</form>
	)
}

type AccountCardProps = {
	initials: string
	name: string
	email?: string
	plan?: string
}

export const AccountCard = ({
	initials,
	name,
	email,
	plan,
}: AccountCardProps) => (
	<div className="flex items-center gap-3 rounded-[14px] border border-primary px-3.5 py-3 ring-3 ring-primary/20">
		<span
			aria-hidden="true"
			className="flex size-9 shrink-0 items-center justify-center rounded-full bg-initials-tile text-[13px] leading-4 font-semibold text-initials-glyph uppercase"
		>
			{initials}
		</span>
		<div className="flex min-w-0 flex-1 flex-col">
			<p className="text-sm leading-5 font-medium wrap-anywhere">{name}</p>
			{email ? (
				<p className="text-[13px] leading-[18px] wrap-anywhere text-muted-foreground">
					{email}
				</p>
			) : null}
		</div>
		{plan ? (
			<span className="rounded-full bg-muted px-2 py-0.5 text-xs leading-4 font-medium">
				{plan}
			</span>
		) : null}
	</div>
)

type DeviceLineProps = {
	name: string
	caption: string
}

export const DeviceLine = ({ name, caption }: DeviceLineProps) => (
	<div className="flex items-center gap-3">
		<span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-muted text-foreground">
			<DeviceMark />
		</span>
		<div className="flex min-w-0 flex-col gap-0.5">
			<p className="text-sm leading-[18px] font-medium wrap-anywhere">{name}</p>
			<p className="text-xs leading-4 text-muted-foreground">{caption}</p>
		</div>
	</div>
)

type BenefitListProps = {
	benefits: readonly string[]
}

export const BenefitList = ({ benefits }: BenefitListProps) => (
	<ul className="flex flex-col gap-2.5 rounded-[12px] bg-background p-3.5">
		{benefits.map((benefit) => (
			<li className="flex gap-2 text-[13px] leading-[18px]" key={benefit}>
				<span className="text-muted-foreground">
					<BenefitMark />
				</span>
				{benefit}
			</li>
		))}
	</ul>
)

const STATUS_CHIPS = {
	"signed-in": {
		tone: "bg-signed-in-tile text-signed-in-glyph",
		mark: <SignedInMark />,
	},
	expired: { tone: "bg-expired-tile text-destructive", mark: <ExpiredMark /> },
	cancelled: {
		tone: "bg-cancelled-tile text-muted-foreground",
		mark: <CancelledMark />,
	},
}

type StatusChipProps = {
	status: keyof typeof STATUS_CHIPS
}

export const StatusChip = ({ status }: StatusChipProps) => (
	<span
		className={cn(
			"flex size-10 shrink-0 items-center justify-center rounded-full",
			STATUS_CHIPS[status].tone,
		)}
	>
		{STATUS_CHIPS[status].mark}
	</span>
)
