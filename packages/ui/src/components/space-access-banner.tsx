import { useTranslation } from "react-i18next"

import { type Icon, Icons } from "@workspace/ui/components/icons"

type SpaceAccessReason = "removed" | "deleted" | "unknown" | "offline"

type SpaceWaitReason =
	| "relayUnreachable"
	| "rekeySendFailed"
	| "hostSilent"
	| "socketClosed"
	| "rekeyNotVerified"
	| "notMember"
	| "unknownInstance"
	| "deviceKeysUnreadable"
	| "deviceAwaitingApproval"
	| "socketUrlFailed"
	| "rosterMissing"
	| "keychainReadFailed"

type SpaceAccessBannerProps = {
	reason: SpaceAccessReason
	space: string
	host: string
	waitReason?: SpaceWaitReason
}

const REASON_MARKS = {
	removed: Icons.Leave,
	deleted: Icons.Leave,
	unknown: Icons.Leave,
	offline: Icons.Clock,
} satisfies Record<SpaceAccessReason, Icon>

const REASON_COPY = {
	removed: {
		title: "bots:spaces.removed.memberNotice",
		body: "bots:spaces.removed.memberNoticeDescription",
	},
	deleted: {
		title: "bots:spaces.removed.deletedNotice",
		body: "bots:spaces.removed.deletedNoticeDescription",
	},
	unknown: {
		title: "bots:spaces.removed.notice",
		body: "bots:spaces.removed.noticeDescription",
	},
	offline: {
		title: "chat:spaceAccessBanner.offline.title",
		body: "chat:spaceAccessBanner.offline.body",
	},
} as const satisfies Record<SpaceAccessReason, { title: string; body: string }>

const bodyKeyOf = (reason: SpaceAccessReason, waitReason?: SpaceWaitReason) =>
	reason === "offline" && waitReason
		? (`chat:spaceAccessBanner.offline.reasons.${waitReason}` as const)
		: REASON_COPY[reason].body

const SpaceAccessBanner = ({
	reason,
	space,
	host,
	waitReason,
}: SpaceAccessBannerProps) => {
	const { t } = useTranslation(["bots", "chat"])
	const Mark = REASON_MARKS[reason]
	const copy = REASON_COPY[reason]
	const naming = { host, name: space, space }

	return (
		<div
			className="flex items-center gap-3.5 rounded-[20px] bg-sidebar py-3.5 ps-4.5 pe-3.5 ring-1 ring-border"
			data-reason={reason}
			data-slot="space-access-banner"
			role="status"
		>
			<Mark aria-hidden="true" className="size-4.5 shrink-0 text-foreground" />
			<div className="flex min-w-0 flex-1 flex-col">
				<p className="wrap-break-word font-semibold text-foreground text-sm">
					{t(copy.title, naming)}
				</p>
				<p className="wrap-break-word text-compact text-muted-foreground leading-4.5">
					{t(bodyKeyOf(reason, waitReason), naming)}
				</p>
			</div>
		</div>
	)
}

export {
	SpaceAccessBanner,
	type SpaceAccessBannerProps,
	type SpaceAccessReason,
	type SpaceWaitReason,
}
