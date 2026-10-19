import { Link } from "@tanstack/react-router"
import type { MouseEvent, ReactNode } from "react"

import { cn } from "@workspace/ui/lib/utils"

import { SiteHeader } from "./login-parts"
import { FOCUS_RING } from "./site-chrome"

export type JoinLayout = "desktop" | "phone"

export type SpaceLines = {
	initials: string
	invitedBy: string
	name: string
	expiry: string
}

type ChildrenProps = {
	children: ReactNode
}

type JoinPhoneFrameProps = ChildrenProps & {
	actions: ReactNode
}

type InvitationSummaryProps = {
	layout: JoinLayout
	space: SpaceLines | null
	privacy: string
	learnMore: string
	unnamedSpaceHeading: string
}

type SpaceHeadingProps = {
	layout: JoinLayout
	space: SpaceLines
}

type ClosedInvitationProps = {
	title: string
	body: string
}

type ActionLinkProps = {
	label: string
	href: string
}

type DownloadLinkProps = ActionLinkProps & {
	mark: ReactNode
	onClick: (event: MouseEvent<HTMLAnchorElement>) => void
}

type PendingActionProps = {
	label: string
}

type JoinFootnoteProps = ChildrenProps & {
	layout: JoinLayout
}

const PAGE =
	"flex min-h-dvh flex-col bg-background text-foreground [font-synthesis:none]"

const SECONDARY_TEXT = "text-foreground/85"

const SUMMARY_TYPE = {
	desktop: {
		avatar: "size-12 text-[19px] leading-6",
		invitedBy: "text-base leading-[22px]",
		name: "text-[72px] leading-[72px]",
		expiry: "text-reading",
	},
	phone: {
		avatar: "size-10 text-base leading-5",
		invitedBy: "text-[15px] leading-5",
		name: "text-[52px] leading-[54px]",
		expiry: "text-[15px] leading-5",
	},
}

const DESKTOP_ACTION = `${FOCUS_RING} inline-flex h-11 items-center justify-center gap-2 rounded-xl text-[15px] leading-5 font-medium whitespace-nowrap`

const PHONE_ACTION = `${FOCUS_RING} flex h-[50px] w-full items-center justify-center rounded-[14px] text-base leading-5 font-medium`

const PRIMARY_TONE = "bg-primary text-primary-foreground"

export const JoinDesktopFrame = ({ children }: ChildrenProps) => (
	<div className={`${PAGE} px-8 py-7`}>
		<SiteHeader />
		<main className="flex flex-1 items-center justify-center pb-10">
			<section className="flex w-110 max-w-full flex-col gap-6">
				{children}
			</section>
		</main>
	</div>
)

export const JoinPhoneFrame = ({ children, actions }: JoinPhoneFrameProps) => (
	<div className={`${PAGE} gap-7 px-6 pt-15 pb-10`}>
		<SiteHeader />
		<main className="flex flex-1 flex-col gap-7">
			<section className="flex flex-col gap-4 pt-8">{children}</section>
			<div className="mt-auto flex flex-col gap-2.5">{actions}</div>
		</main>
	</div>
)

const SpaceHeading = ({ layout, space }: SpaceHeadingProps) => (
	<>
		<div className="flex items-center gap-3.5">
			<span
				aria-hidden="true"
				className={cn(
					"flex shrink-0 items-center justify-center rounded-full bg-(--conversation-icon-green) font-semibold text-(--conversation-icon-green-foreground)",
					SUMMARY_TYPE[layout].avatar,
				)}
			>
				{space.initials}
			</span>
			<p
				className={cn(
					"min-w-0 wrap-anywhere",
					SECONDARY_TEXT,
					SUMMARY_TYPE[layout].invitedBy,
				)}
			>
				{space.invitedBy}
			</p>
		</div>
		<h1
			className={cn(
				"font-semibold tracking-[-0.04em] text-balance wrap-anywhere",
				SUMMARY_TYPE[layout].name,
			)}
		>
			{space.name}
		</h1>
		<p className={SUMMARY_TYPE[layout].expiry}>{space.expiry}</p>
	</>
)

export const InvitationSummary = ({
	layout,
	space,
	privacy,
	learnMore,
	unnamedSpaceHeading,
}: InvitationSummaryProps) => (
	<>
		{space ? (
			<SpaceHeading layout={layout} space={space} />
		) : (
			<h1 className="sr-only">{unnamedSpaceHeading}</h1>
		)}
		<div className="flex flex-col items-start gap-1.5">
			<p className={cn("text-base leading-6 text-pretty", SECONDARY_TEXT)}>
				{privacy}
			</p>
			<Link
				className={`${FOCUS_RING} rounded-sm text-reading font-medium underline decoration-1 underline-offset-2`}
				to="/privacy"
			>
				{learnMore}
			</Link>
		</div>
	</>
)

export const ClosedInvitation = ({ title, body }: ClosedInvitationProps) => (
	<>
		<h1 className="text-[48px] leading-[52px] font-semibold tracking-[-0.03em] text-balance">
			{title}
		</h1>
		<p className={cn("text-base leading-6 text-pretty", SECONDARY_TEXT)}>
			{body}
		</p>
	</>
)

export const JoinDesktopActions = ({ children }: ChildrenProps) => (
	<div className="flex flex-wrap gap-2.5">{children}</div>
)

export const OpenInKiroshiLink = ({ label, href }: ActionLinkProps) => (
	<a
		className={`${DESKTOP_ACTION} ${PRIMARY_TONE} px-[22px] hover:bg-primary/90`}
		href={href}
	>
		{label}
	</a>
)

export const OpeningKiroshiAction = ({ label }: PendingActionProps) => (
	<button
		className={`${DESKTOP_ACTION} ${PRIMARY_TONE} px-[22px] opacity-70`}
		disabled
		type="button"
	>
		{label}
	</button>
)

export const DownloadLink = ({
	label,
	href,
	mark,
	onClick,
}: DownloadLinkProps) => (
	<a
		className={`${DESKTOP_ACTION} bg-card px-[18px] shadow-field hover:bg-accent`}
		href={href}
		onClick={onClick}
	>
		{mark}
		{label}
	</a>
)

export const PhonePrimaryLink = ({ label, href }: ActionLinkProps) => (
	<a
		className={`${PHONE_ACTION} ${PRIMARY_TONE} hover:bg-primary/90`}
		href={href}
	>
		{label}
	</a>
)

export const PhoneSecondaryLink = ({ label, href }: ActionLinkProps) => (
	<a
		className={`${PHONE_ACTION} bg-card ring-1 ring-input hover:bg-accent`}
		href={href}
	>
		{label}
	</a>
)

export const JoinFootnote = ({ children, layout }: JoinFootnoteProps) => (
	<p
		className={cn(
			"text-compact leading-[18px] text-pretty text-muted-foreground",
			layout === "phone" && "text-center",
		)}
	>
		{children}
	</p>
)
