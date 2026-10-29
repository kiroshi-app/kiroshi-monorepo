"use client"

import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import {
	AvatarFrame,
	displayNameOf,
	initialsOf,
} from "@workspace/ui/components/initials-avatar"
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

const ACCOUNT_INITIALS_CLASS =
	"grid size-full place-items-center bg-person-avatar font-medium text-foreground text-sm uppercase"

const PANEL_CLASS = "flex flex-col gap-5 px-3 py-2"

type AccountLayout = "panel" | "screen"

const ACTION_CLASS: Record<AccountLayout, string> = {
	panel: "rounded-control px-3.5 leading-4.5 transition-none",
	screen: "rounded-full px-5 leading-4.5 transition-none",
}

const ACTION_ICON_CLASS = "size-3.5"

const CAPTION_CLASS = "text-muted-foreground text-xs"

const INTRO_CLASS: Record<
	AccountLayout,
	{ block: string; title: string; body: string }
> = {
	panel: {
		block: "flex max-w-120 flex-col gap-1",
		title: "font-semibold text-foreground text-sm",
		body: "text-muted-foreground text-sm",
	},
	screen: {
		block: "flex w-105 max-w-full flex-col gap-2 text-center",
		title:
			"text-balance font-semibold text-[22px] text-foreground leading-7 tracking-[-0.01em]",
		body: "text-pretty text-muted-foreground text-sm",
	},
}

type AccountIntroProps = {
	title: string
	body: string
	layout?: AccountLayout
}

const AccountIntro = ({ title, body, layout = "panel" }: AccountIntroProps) => {
	const Title = layout === "screen" ? "h1" : "h3"

	return (
		<div className={INTRO_CLASS[layout].block}>
			<Title className={INTRO_CLASS[layout].title}>{title}</Title>
			<p className={INTRO_CLASS[layout].body}>{body}</p>
		</div>
	)
}

type AccountActionsProps = {
	buttons: ReactNode
	caption?: string
	children?: ReactNode
	layout?: AccountLayout
}

const AccountActions = ({
	buttons,
	caption,
	children,
	layout = "panel",
}: AccountActionsProps) => (
	<div
		className={cn(
			"flex flex-col gap-2",
			layout === "screen" ? "items-center text-center" : "items-start",
		)}
	>
		<div
			className={cn(
				"flex flex-wrap items-center gap-2",
				layout === "screen" && "justify-center",
			)}
		>
			{buttons}
		</div>
		{caption ? <p className={CAPTION_CLASS}>{caption}</p> : null}
		{children}
	</div>
)

type SignInActionsProps = Pick<
	AccountPanelProps,
	"onSignIn" | "onCancel" | "onCopySignInLink"
> & {
	isWaiting: boolean
	layout?: AccountLayout
}

const SignInActions = ({
	isWaiting,
	layout = "panel",
	onSignIn,
	onCancel,
	onCopySignInLink,
}: SignInActionsProps) => {
	const { t } = useTranslation("settings")

	if (!isWaiting) {
		return (
			<AccountActions
				buttons={
					<Button className={ACTION_CLASS[layout]} onClick={onSignIn} size="lg">
						{t("account.signedOut.signIn")}
						<Icons.ExternalLink
							aria-hidden="true"
							className={ACTION_ICON_CLASS}
						/>
					</Button>
				}
				caption={t("account.signedOut.caption")}
				layout={layout}
			/>
		)
	}

	return (
		<AccountActions
			buttons={
				<>
					<Button
						className={cn(
							ACTION_CLASS[layout],
							"data-disabled:pointer-events-none data-disabled:opacity-60",
						)}
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
						className={ACTION_CLASS[layout]}
						onClick={onCancel}
						size="lg"
						variant="outline"
					>
						{t("account.waiting.cancel")}
					</Button>
				</>
			}
			caption={t("account.waiting.caption")}
			layout={layout}
		>
			<p
				className={cn(
					"flex flex-wrap items-center gap-1 text-xs",
					layout === "screen" && "justify-center",
				)}
			>
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
	)
}

type AccountCardProps = Omit<
	Extract<AccountState, { status: "signedIn" }>,
	"status"
> &
	AccountPictureProps

const AccountCard = ({ name, email, plan, image }: AccountCardProps) => {
	const { t } = useTranslation("settings")

	return (
		<div
			className="flex items-center gap-3 rounded-xl border border-border p-3.5"
			data-slot="account-card"
		>
			<AvatarFrame
				className="shrink-0"
				image={image}
				shape="round"
				size={ACCOUNT_AVATAR_SIZE}
				slot="user-avatar"
			>
				<span aria-hidden="true" className={ACCOUNT_INITIALS_CLASS}>
					{initialsOf(displayNameOf(name))}
				</span>
			</AvatarFrame>
			<div className="flex min-w-0 flex-1 flex-col">
				<p className="wrap-break-word font-medium text-foreground text-sm">
					{name}
				</p>
				<p className="wrap-break-word text-compact text-muted-foreground leading-4.5">
					{email}
				</p>
			</div>
			{plan ? (
				<div className="flex shrink-0 items-center gap-1.5">
					{plan === "pro" ? (
						<Badge variant="secondary">{t("account.signedIn.plan.beta")}</Badge>
					) : null}
					<span className="text-foreground text-sm leading-4.5">
						{t(`account.signedIn.plan.${plan}`)}
					</span>
				</div>
			) : null}
		</div>
	)
}

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
				<AccountCard
					email={account.email}
					image={image}
					name={account.name}
					plan={account.plan}
				/>
				<AccountActions
					buttons={
						<>
							<Button
								className={ACTION_CLASS.panel}
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
								className={ACTION_CLASS.panel}
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

	return (
		<div className={PANEL_CLASS}>
			<AccountIntro
				body={t("account.signedOut.body")}
				title={t("account.signedOut.title")}
			/>
			<SignInActions
				isWaiting={account.status === "waiting"}
				onCancel={onCancel}
				onCopySignInLink={onCopySignInLink}
				onSignIn={onSignIn}
			/>
		</div>
	)
}

export {
	ACTION_CLASS as ACCOUNT_ACTION_CLASS,
	AccountCard,
	AccountIntro,
	AccountPanel,
	type AccountPanelProps,
	type AccountState,
	SignInActions,
}
