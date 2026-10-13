import type { ReactNode } from "react"

import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog"

import { SiteHeader } from "./login-parts"
import { DesktopMark, LaptopMark, PhoneMark } from "./page-marks"

const CARD = "rounded-[14px] bg-card shadow-field"

const TEXT_ACTION =
	"rounded-sm text-[13px] leading-4 font-medium text-foreground outline-none focus-visible:shadow-field-focus disabled:opacity-50"

type ChildrenProps = {
	children: ReactNode
}

const Tag = ({ children }: ChildrenProps) => (
	<span className="rounded-full bg-muted px-2 py-0.5 text-xs leading-4 font-medium text-foreground">
		{children}
	</span>
)

export const AccountShell = ({ children }: ChildrenProps) => (
	<div className="flex min-h-dvh flex-col bg-background px-8 py-7 text-foreground [font-synthesis:none]">
		<SiteHeader />
		<main className="mx-auto flex w-160 max-w-full flex-col gap-7 pt-9">
			{children}
		</main>
	</div>
)

type IdentityProps = {
	initials: string
	name: string
	email?: string
	action: ReactNode
	failure: ReactNode
}

export const Identity = ({
	initials,
	name,
	email,
	action,
	failure,
}: IdentityProps) => (
	<div className="flex flex-col gap-2">
		<div className="flex items-center gap-3.5">
			<span
				aria-hidden="true"
				className="flex size-12 shrink-0 items-center justify-center rounded-full bg-initials-tile text-base leading-5 font-semibold text-initials-glyph uppercase"
			>
				{initials}
			</span>
			<div className="flex min-w-0 flex-1 flex-col">
				<div className="flex items-start gap-4">
					<h1 className="min-w-0 flex-1 text-[22px] leading-7 font-semibold tracking-[-0.015em] wrap-anywhere">
						{name}
					</h1>
					<span className="shrink-0">{action}</span>
				</div>
				{email ? (
					<p className="text-sm leading-5 wrap-anywhere text-muted-foreground">
						{email}
					</p>
				) : null}
			</div>
		</div>
		<div className="max-w-80 self-end empty:hidden">{failure}</div>
	</div>
)

type AccountSectionProps = ChildrenProps & {
	heading: string
}

export const AccountSection = ({ heading, children }: AccountSectionProps) => (
	<section className="flex flex-col gap-2.5">
		<h2 className="text-[13px] leading-4 font-medium text-muted-foreground">
			{heading}
		</h2>
		{children}
	</section>
)

type PlanCardProps = {
	name: string
	price: string
	betaTag?: string
}

export const PlanCard = ({ name, price, betaTag }: PlanCardProps) => (
	<div
		className={`${CARD} flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3.5`}
	>
		<div className="flex flex-wrap items-center gap-2">
			<p className="text-sm leading-[18px] font-medium">{name}</p>
			{betaTag ? <Tag>{betaTag}</Tag> : null}
		</div>
		{betaTag ? (
			<s className="text-sm leading-[18px] text-struck-price">{price}</s>
		) : (
			<p className="text-sm leading-[18px] text-muted-foreground">{price}</p>
		)}
	</div>
)

export const SessionList = ({ children }: ChildrenProps) => (
	<ul className={CARD}>{children}</ul>
)

const DEVICE_MARKS = {
	desktop: <DesktopMark />,
	laptop: <LaptopMark />,
	phone: <PhoneMark />,
}

export type DeviceKind = keyof typeof DEVICE_MARKS

type SessionRowProps = {
	kind: DeviceKind
	name: string
	caption: string
	currentTag?: string
	action: ReactNode
	failure: ReactNode
}

export const SessionRow = ({
	kind,
	name,
	caption,
	currentTag,
	action,
	failure,
}: SessionRowProps) => (
	<li className="flex flex-col gap-1.5 border-b border-border px-4 py-3 last:border-b-0">
		<div className="flex items-center gap-3">
			<span className="text-foreground">{DEVICE_MARKS[kind]}</span>
			<div className="flex min-w-0 flex-1 flex-col">
				<div className="flex flex-wrap items-center gap-x-2">
					<p className="text-sm leading-5 wrap-anywhere">{name}</p>
					{currentTag ? <Tag>{currentTag}</Tag> : null}
				</div>
				<p className="text-xs leading-4 text-muted-foreground">{caption}</p>
			</div>
			<span className="flex w-20 shrink-0 justify-end">{action}</span>
		</div>
		{failure}
	</li>
)

export const AccountActions = ({ children }: ChildrenProps) => (
	<div className="flex flex-col items-end gap-2">{children}</div>
)

type SignOutButtonProps = {
	label: string
	target?: string
	title: string
	description: string
	confirmLabel: string
	isBusy: boolean
	onConfirm: () => Promise<void>
}

export const SignOutButton = ({
	label,
	target,
	title,
	description,
	confirmLabel,
	isBusy,
	onConfirm,
}: SignOutButtonProps) => (
	<ConfirmDialog
		confirmLabel={confirmLabel}
		description={description}
		isTriggerDisabled={isBusy}
		onConfirm={onConfirm}
		title={title}
		trigger={
			<>
				{label}
				{target ? <span className="sr-only">{` ${target}`}</span> : null}
			</>
		}
		triggerClassName={TEXT_ACTION}
	/>
)

type TextButtonProps = {
	label: string
	isBusy: boolean
	onClick: () => void
}

export const TextButton = ({ label, isBusy, onClick }: TextButtonProps) => (
	<button
		className={TEXT_ACTION}
		disabled={isBusy}
		onClick={onClick}
		type="button"
	>
		{label}
	</button>
)
