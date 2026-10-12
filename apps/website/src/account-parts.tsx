import type { ReactNode } from "react"

import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog"

import { ACTION } from "./login-parts"
import { DeviceMark } from "./page-marks"

type ChildrenProps = {
	children: ReactNode
}

type AccountSectionProps = ChildrenProps & {
	heading: string
}

export const AccountSection = ({ heading, children }: AccountSectionProps) => (
	<section className="flex flex-col gap-2.5">
		<h2 className="text-xs leading-4 font-medium text-muted-foreground">
			{heading}
		</h2>
		{children}
	</section>
)

type PlanLineProps = {
	name: string
	price: string
	betaTag?: string
}

export const PlanLine = ({ name, price, betaTag }: PlanLineProps) => (
	<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
		<p className="text-sm leading-5 font-medium">{name}</p>
		<p className="text-[13px] leading-[18px] text-muted-foreground">{price}</p>
		{betaTag ? (
			<span className="rounded-full bg-muted px-2 py-0.5 text-xs leading-4 font-medium">
				{betaTag}
			</span>
		) : null}
	</div>
)

export const SessionList = ({ children }: ChildrenProps) => (
	<ul className="flex flex-col gap-3">{children}</ul>
)

type SessionRowProps = {
	name: string
	caption: string
	currentTag?: string
	action: ReactNode
	failure: ReactNode
}

export const SessionRow = ({
	name,
	caption,
	currentTag,
	action,
	failure,
}: SessionRowProps) => (
	<li className="flex flex-col gap-1.5">
		<div className="flex items-center gap-3">
			<span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-muted text-foreground">
				<DeviceMark />
			</span>
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<div className="flex flex-wrap items-center gap-x-2">
					<p className="text-sm leading-[18px] font-medium wrap-anywhere">
						{name}
					</p>
					{currentTag ? (
						<span className="rounded-full bg-muted px-2 py-0.5 text-xs leading-4 font-medium">
							{currentTag}
						</span>
					) : null}
				</div>
				<p className="text-xs leading-4 text-muted-foreground">{caption}</p>
			</div>
			{action}
		</div>
		{failure}
	</li>
)

export const AccountActions = ({ children }: ChildrenProps) => (
	<div className="flex flex-col gap-2">{children}</div>
)

const SIGN_OUT_TRIGGERS = {
	row: `${ACTION} w-auto shrink-0 px-3 shadow-field hover:bg-accent disabled:opacity-50`,
	ghost: `${ACTION} hover:bg-accent disabled:opacity-50`,
}

type SignOutButtonProps = {
	label: string
	target?: string
	tone: keyof typeof SIGN_OUT_TRIGGERS
	title: string
	description: string
	confirmLabel: string
	isBusy: boolean
	onConfirm: () => Promise<void>
}

export const SignOutButton = ({
	label,
	target,
	tone,
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
		triggerClassName={SIGN_OUT_TRIGGERS[tone]}
	/>
)
