"use client"

import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import { InitialsAvatar } from "@workspace/ui/components/initials-avatar"
import { SkeletonBar } from "@workspace/ui/components/list-skeleton"
import { Badge } from "@workspace/ui/components/ui/badge"
import { Button } from "@workspace/ui/components/ui/button"
import { Skeleton } from "@workspace/ui/components/ui/skeleton"
import {
	YourDevices,
	type YourDevicesProps,
} from "@workspace/ui/components/user-settings-dialog/your-devices"
import { useSkeletonTiming } from "@workspace/ui/hooks/use-skeleton-timing"
import { cn } from "@workspace/ui/lib/utils"

type AccountPlan = "free" | "pro"

type AccountState =
	| { status: "signedOut" }
	| { status: "waiting" }
	| {
			status: "signedIn"
			name: string
			email: string
			plan: AccountPlan | null
	  }

type AccountPanelProps = {
	account: AccountState
	isPending?: boolean
	devices?: YourDevicesProps
	onSignIn: () => void
	onCancel: () => void
	onCopySignInLink: () => void
	onManageAccount: () => void
	onSignOut: () => void
}

type AccountPictureProps = {
	image?: string
}

const ACCOUNT_AVATAR_SIZE = 40

const PANEL_CLASS = "flex flex-col gap-5 px-3 py-2"

const ACTION_CLASS = "rounded-control px-3.5 leading-4.5"

const ACTION_ICON_CLASS = "size-3.5"

const CAPTION_CLASS = "text-muted-foreground text-xs"

type AccountIntroProps = {
	title: string
	body: string
}

const AccountIntro = ({ title, body }: AccountIntroProps) => (
	<div className="flex max-w-120 flex-col gap-1">
		<h3 className="font-semibold text-foreground text-sm">{title}</h3>
		<p className="text-muted-foreground text-sm">{body}</p>
	</div>
)

type AccountActionsProps = {
	buttons: ReactNode
	caption?: string
	children?: ReactNode
}

const AccountActions = ({
	buttons,
	caption,
	children,
}: AccountActionsProps) => (
	<div className="flex flex-col items-start gap-2">
		<div className="flex flex-wrap items-center gap-2">{buttons}</div>
		{caption ? <p className={CAPTION_CLASS}>{caption}</p> : null}
		{children}
	</div>
)

const AccountCardSkeleton = () => (
	<div
		aria-hidden="true"
		className="flex animate-pulse items-center gap-3 rounded-xl border border-border p-3.5 motion-reduce:animate-none"
		data-slot="account-card-skeleton"
	>
		<Skeleton className="size-10 shrink-0 animate-none rounded-full bg-border" />
		<div className="flex min-w-0 flex-1 flex-col">
			<div className="flex h-5 items-center">
				<SkeletonBar className="w-24" />
			</div>
			<div className="flex h-4.5 items-center">
				<SkeletonBar className="w-34" isFaint />
			</div>
		</div>
	</div>
)

const AccountPanel = ({
	account,
	isPending = false,
	devices,
	onSignIn,
	onCancel,
	onCopySignInLink,
	onManageAccount,
	onSignOut,
	image,
}: AccountPanelProps & AccountPictureProps) => {
	const { t } = useTranslation("settings")
	const phase = useSkeletonTiming(isPending)

	if (phase === "delay" || phase === "skeleton") {
		return (
			<div aria-busy="true" className={PANEL_CLASS}>
				{phase === "skeleton" ? <AccountCardSkeleton /> : null}
			</div>
		)
	}

	if (account.status === "signedIn") {
		return (
			<div
				className={cn(PANEL_CLASS, "flex-1", devices?.isPending && "min-h-0")}
			>
				<div className="flex items-center gap-3 rounded-xl border border-border p-3.5">
					<InitialsAvatar
						className="shrink-0"
						image={image}
						name={account.name}
						size={ACCOUNT_AVATAR_SIZE}
					/>
					<div className="flex min-w-0 flex-1 flex-col">
						<p className="wrap-break-word font-medium text-foreground text-sm">
							{account.name}
						</p>
						<p className="wrap-break-word text-compact text-muted-foreground leading-4.5">
							{account.email}
						</p>
					</div>
					{account.plan ? (
						<div className="flex shrink-0 items-center gap-1.5">
							{account.plan === "pro" ? (
								<Badge variant="secondary">
									{t("account.signedIn.plan.beta")}
								</Badge>
							) : null}
							<span className="text-foreground text-sm leading-4.5">
								{t(`account.signedIn.plan.${account.plan}`)}
							</span>
						</div>
					) : null}
				</div>
				<AccountActions
					buttons={
						<>
							<Button
								className={ACTION_CLASS}
								onClick={onManageAccount}
								size="lg"
								variant="outline"
							>
								{t("account.signedIn.manage")}
								<Icons.ExternalLink
									aria-hidden="true"
									className={ACTION_ICON_CLASS}
								/>
							</Button>
							<Button
								className={ACTION_CLASS}
								onClick={onSignOut}
								size="lg"
								variant="ghost"
							>
								{t("account.signedIn.signOut")}
							</Button>
						</>
					}
				/>
				{devices ? <YourDevices {...devices} /> : null}
			</div>
		)
	}

	const isWaiting = account.status === "waiting"

	return (
		<div className={PANEL_CLASS}>
			<AccountIntro
				body={t("account.signedOut.body")}
				title={t("account.signedOut.title")}
			/>
			{isWaiting ? (
				<AccountActions
					buttons={
						<>
							<Button
								className={`${ACTION_CLASS} data-disabled:pointer-events-none data-disabled:opacity-60`}
								disabled
								focusableWhenDisabled
								size="lg"
							>
								<Icons.Loading
									aria-hidden="true"
									className={`${ACTION_ICON_CLASS} animate-spin motion-reduce:animate-none`}
								/>
								{t("account.waiting.label")}
							</Button>
							<Button
								className={ACTION_CLASS}
								onClick={onCancel}
								size="lg"
								variant="outline"
							>
								{t("account.waiting.cancel")}
							</Button>
						</>
					}
					caption={t("account.waiting.caption")}
				>
					<p className="flex flex-wrap items-center gap-1 text-xs">
						<span className="text-muted-foreground">
							{t("account.waiting.browserDidNotOpen")}
						</span>
						<button
							className="relative rounded-xs text-foreground underline decoration-1 underline-offset-2 outline-offset-2 after:absolute after:-inset-1"
							onClick={onCopySignInLink}
							type="button"
						>
							{t("account.waiting.copySignInLink")}
						</button>
					</p>
				</AccountActions>
			) : (
				<AccountActions
					buttons={
						<Button className={ACTION_CLASS} onClick={onSignIn} size="lg">
							{t("account.signedOut.signIn")}
							<Icons.ExternalLink
								aria-hidden="true"
								className={ACTION_ICON_CLASS}
							/>
						</Button>
					}
					caption={t("account.signedOut.caption")}
				/>
			)}
		</div>
	)
}

export { AccountPanel, type AccountPanelProps, type AccountState }
