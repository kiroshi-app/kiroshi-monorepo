import { type ReactNode, useId } from "react"

import { cn } from "@workspace/ui/lib/utils"

import { LOGIN_COPY } from "./login-copy"
import { MailMark } from "./page-marks"

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

export const LoginShell = ({ children }: ChildrenProps) => (
	<div className="flex min-h-dvh flex-col bg-background px-8 py-7 text-foreground [font-synthesis:none]">
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
		<main className="flex flex-1 items-center justify-center pb-15">
			<section className="flex w-95 max-w-full flex-col gap-6 rounded-[18px] bg-card p-8 shadow-edge">
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

type SecondaryButtonProps = {
	label: string
	isBusy: boolean
	onClick: () => void
}

export const SecondaryButton = ({
	label,
	isBusy,
	onClick,
}: SecondaryButtonProps) => (
	<button
		className={`${ACTION} bg-card shadow-field hover:bg-accent`}
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
