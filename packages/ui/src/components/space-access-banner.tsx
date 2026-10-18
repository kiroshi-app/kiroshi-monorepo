import { useTranslation } from "react-i18next"

import { type Icon, Icons } from "@workspace/ui/components/icons"

type SpaceAccessReason = "removed" | "deleted" | "offline"

type SpaceAccessBannerProps = {
	reason: SpaceAccessReason
	space: string
	host: string
}

const REASON_MARKS = {
	removed: Icons.Leave,
	deleted: Icons.Leave,
	offline: Icons.Clock,
} satisfies Record<SpaceAccessReason, Icon>

const SpaceAccessBanner = ({ reason, space, host }: SpaceAccessBannerProps) => {
	const { t } = useTranslation("chat")
	const Mark = REASON_MARKS[reason]

	return (
		<div
			className="flex items-center gap-3.5 rounded-[20px] bg-muted/40 py-3.5 ps-4.5 pe-3.5 ring-1 ring-border"
			data-reason={reason}
			data-slot="space-access-banner"
			role="status"
		>
			<Mark aria-hidden="true" className="size-4.5 shrink-0 text-foreground" />
			<div className="flex min-w-0 flex-1 flex-col">
				<p className="wrap-break-word font-semibold text-foreground text-sm">
					{t(`spaceAccessBanner.${reason}.title`, { host, space })}
				</p>
				<p className="wrap-break-word text-compact text-muted-foreground leading-4.5">
					{t(`spaceAccessBanner.${reason}.body`, { host, space })}
				</p>
			</div>
		</div>
	)
}

export {
	SpaceAccessBanner,
	type SpaceAccessBannerProps,
	type SpaceAccessReason,
}
