import type { NoticeMessage } from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import type { AccountState } from "../bindings"

const UNREACHABLE_NOTICE_KEYS = {
	title: "settings:account.unreachable.title",
	description: "settings:account.unreachable.description",
} as const

const NOTICE_KEYS_BY_TRANSITION = {
	unreachable: UNREACHABLE_NOTICE_KEYS,
	"failed:unreachable": UNREACHABLE_NOTICE_KEYS,
	"failed:expired": {
		title: "settings:account.failed.timedOut",
		description: "settings:account.failed.description",
	},
	"failed:cancelled": {
		title: "settings:account.failed.cancelled",
		description: "settings:account.failed.description",
	},
	"signedOut:signedOutOnSite": {
		title: "settings:account.signedOutFromTheSite.title",
		description: "settings:account.signedOutFromTheSite.description",
	},
	"signedOut:deviceRevoked": {
		title: "settings:account.deviceRevoked.title",
		description: "settings:account.deviceRevoked.description",
	},
} as const

type NoticedTransition = keyof typeof NOTICE_KEYS_BY_TRANSITION

const isNoticed = (transition: string): transition is NoticedTransition =>
	Object.hasOwn(NOTICE_KEYS_BY_TRANSITION, transition)

export const transitionOf = (state: AccountState): string => {
	if (state.kind === "failed") return `failed:${state.failure}`
	if (state.kind === "signedOut") return `signedOut:${state.reason}`
	return state.kind
}

export const transitionNoticeOf = (
	transition: string,
): NoticeMessage | null => {
	if (!isNoticed(transition)) {
		return null
	}
	const { title, description } = NOTICE_KEYS_BY_TRANSITION[transition]
	return { title: i18n.t(title), description: i18n.t(description) }
}
