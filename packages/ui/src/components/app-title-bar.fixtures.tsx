import type { AppTitleBarProps } from "@workspace/ui/components/app-title-bar"
import { Icons } from "@workspace/ui/components/icons"
import type { Space } from "@workspace/ui/components/space"
import type { TitleBarTab } from "@workspace/ui/components/title-bar-tabs"

export const STUDIO: Space = {
	id: "studio",
	name: "Studio",
	colour: "orange",
	avatarSeed: "studio",
}

export const GARAGE: Space = {
	id: "garage",
	name: "Garage",
	avatarSeed: "garage",
}

export const VOCCA: Space = {
	id: "vocca",
	name: "Vocca",
	colour: "blue",
	avatarSeed: "vocca",
}

export const ATELIER: Space = {
	id: "atelier",
	name: "Atelier",
	colour: "green",
	avatarSeed: "atelier",
}

export const TITLE_BAR: AppTitleBarProps = {
	"data-tauri-drag-region": "deep",
	insetWindowControls: true,
}

export const RELEASE_NOTES: TitleBarTab = {
	id: "release-notes",
	title: "Release notes for 2.4",
	icon: <Icons.Conversations />,
}

export const LOGIN_REDIRECT: TitleBarTab = {
	id: "login-redirect",
	title: "Fix the login redirect",
	icon: <Icons.Missions />,
}

export const WEEKLY_PLANNING: TitleBarTab = {
	id: "weekly-planning",
	title: "Weekly planning",
	icon: <Icons.Conversations />,
}

export const ONBOARDING_COPY: TitleBarTab = {
	id: "onboarding-copy",
	title:
		"Rewrite the onboarding copy for the second step of the space invitation flow",
	icon: <Icons.Conversations />,
}

export const INVOICE_EXPORT: TitleBarTab = {
	id: "invoice-export",
	title: "Invoice export",
	icon: <Icons.Missions />,
}

export const PRICING_PAGE: TitleBarTab = {
	id: "pricing-page",
	title: "Pricing page",
	icon: <Icons.Conversations />,
}

export const SUPPORT_TRIAGE: TitleBarTab = {
	id: "support-triage",
	title: "Support triage",
	icon: <Icons.Missions />,
}

export const DESIGN_REVIEW: TitleBarTab = {
	id: "design-review",
	title: "Design review",
	icon: <Icons.Conversations />,
}

export const HIRING_PLAN: TitleBarTab = {
	id: "hiring-plan",
	title: "Hiring plan",
	icon: <Icons.Conversations />,
}

export const BUG_BASH: TitleBarTab = {
	id: "bug-bash",
	title: "Bug bash",
	icon: <Icons.Missions />,
}

export const ROADMAP: TitleBarTab = {
	id: "roadmap",
	title: "Roadmap",
	icon: <Icons.Conversations />,
}

export const STANDUP: TitleBarTab = {
	id: "standup",
	title: "Standup notes",
	icon: <Icons.Conversations />,
}

export const PINNED_INBOX: TitleBarTab = {
	id: "inbox",
	title: "Inbox",
	icon: <Icons.Bell />,
	isPinned: true,
}

export const MIGRATION_QUESTION: TitleBarTab = {
	id: "migration-question",
	title: "Database migration",
	icon: <Icons.Missions />,
	isNeedingYou: true,
}

export const NEW_TAB: TitleBarTab = {
	id: "new-tab",
	title: "New tab",
	icon: <Icons.Conversations />,
}
