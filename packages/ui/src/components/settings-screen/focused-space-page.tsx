"use client"

import { type ReactNode, useId } from "react"
import { useTranslation } from "react-i18next"

import type { SpaceHost } from "@workspace/ui/components/host-pill"
import { INVERSE_BUTTON_CLASS } from "@workspace/ui/components/inverse-button"
import { SettingsField } from "@workspace/ui/components/settings-field"
import type { SpaceSettingsValue } from "@workspace/ui/components/space-settings"
import { SpaceSquare } from "@workspace/ui/components/space-switcher"
import { Button } from "@workspace/ui/components/ui/button"
import { formatDateTime } from "@workspace/ui/lib/time-format"
import { cn } from "@workspace/ui/lib/utils"

type FocusedSpace =
	| { state: "yours"; isShared: boolean }
	| { state: "joined"; hostName: string; isConnected: boolean }
	| { state: "invitation"; hostEmail: string; expiresAt: number }

const MONTH_AND_DAY: Intl.DateTimeFormatOptions = {
	month: "long",
	day: "numeric",
}

const HEADER_BUTTON = cn(
	INVERSE_BUTTON_CLASS,
	"rounded-[9px] px-3.5 text-compact transition-none",
)

const SHORTCUT =
	"text-[color-mix(in_oklab,var(--background)_60%,var(--foreground))] text-xs"

const presenceOf = (space: FocusedSpace): SpaceHost | undefined => {
	if (space.state === "joined") return space.isConnected ? "up" : "down"
	if (space.state === "yours" && space.isShared) return "shared"
	return undefined
}

type NotSharedCardProps = {
	name: string
	onShare: () => void
}

const NotSharedCard = ({ name, onShare }: NotSharedCardProps) => {
	const { t } = useTranslation("settings")
	const id = useId()
	const titleId = `${id}-title`
	const descriptionId = `${id}-description`

	return (
		<section
			aria-labelledby={titleId}
			className="flex flex-col gap-3 rounded-control border border-shell-divider bg-card-raised p-4"
			data-slot="not-shared-card"
		>
			<div className="flex flex-col gap-1.5">
				<h3 className="font-medium text-foreground text-sm/5" id={titleId}>
					{t("space.notShared.title")}
				</h3>
				<p
					className="break-words text-compact/4.5 text-soft-foreground"
					id={descriptionId}
				>
					{t("space.notShared.description", { name })}
				</p>
			</div>
			<Button
				aria-describedby={descriptionId}
				className="h-7.5 self-start rounded-md px-2.5 text-compact transition-none"
				onClick={onShare}
				variant="outline"
			>
				{t("space.notShared.share")}
			</Button>
		</section>
	)
}

type FocusedSpacePageProps = {
	space: FocusedSpace
	value: SpaceSettingsValue
	onValueChange: (value: SpaceSettingsValue) => void
	rank?: number
	onOpen?: () => void
	onShare?: () => void
	onAccept?: () => void
	children?: ReactNode
}

const FocusedSpacePage = ({
	space,
	value,
	onValueChange,
	rank,
	onOpen,
	onShare,
	onAccept,
	children,
}: FocusedSpacePageProps) => {
	const { t } = useTranslation("settings")
	const { t: tBots } = useTranslation("bots")
	const name = value.name.trim() || t("space.untitled")
	const isInvitation = space.state === "invitation"
	const isNameShown =
		space.state === "yours" || (space.state === "joined" && space.isConnected)

	const subtitle =
		space.state === "invitation"
			? t("space.standing.invitation", {
					email: space.hostEmail,
					date: formatDateTime(space.expiresAt, MONTH_AND_DAY),
				})
			: space.state === "joined"
				? t(
						space.isConnected
							? "space.standing.joined"
							: "space.standing.joinedNotConnected",
						{ host: space.hostName },
					)
				: t(
						space.isShared
							? "space.standing.yoursShared"
							: "space.standing.yours",
					)

	return (
		<>
			<div
				className="flex min-w-0 items-center gap-3.5"
				data-slot="focused-space-header"
			>
				<SpaceSquare
					colour={value.colour}
					host={presenceOf(space)}
					isInvitation={isInvitation}
					size="header"
				/>
				<div className="flex min-w-0 flex-1 flex-col">
					<h2 className="break-words font-semibold text-foreground text-xl/6.5 tracking-[-0.01em]">
						{name}
					</h2>
					<p
						className="break-words text-compact/4.5 text-muted-foreground"
						data-slot="focused-space-standing"
					>
						{subtitle}
					</p>
				</div>
				{isInvitation && onAccept ? (
					<Button className={HEADER_BUTTON} onClick={onAccept}>
						{tBots("spaces.invitations.accept")}
					</Button>
				) : null}
				{!isInvitation && onOpen ? (
					<Button
						aria-keyshortcuts={rank === undefined ? undefined : `Meta+${rank}`}
						className={HEADER_BUTTON}
						onClick={onOpen}
					>
						{t("space.open")}
						{rank === undefined ? null : (
							<span className={SHORTCUT}>
								{tBots("spaces.shortcut", { rank })}
							</span>
						)}
					</Button>
				) : null}
			</div>
			{isNameShown ? (
				<SettingsField
					label={t("space.name.label")}
					onValueChange={(next) => onValueChange({ ...value, name: next })}
					placeholder={t("space.name.placeholder")}
					readOnly={space.state === "joined"}
					readOnlyLook="filled"
					value={value.name}
				/>
			) : null}
			{space.state === "yours" && !space.isShared && onShare ? (
				<NotSharedCard name={name} onShare={onShare} />
			) : null}
			{children}
		</>
	)
}

export { type FocusedSpace, FocusedSpacePage, presenceOf }
