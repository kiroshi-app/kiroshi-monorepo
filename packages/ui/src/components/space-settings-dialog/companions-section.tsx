"use client"

import { useTranslation } from "react-i18next"

import { BotTitleBadge } from "@workspace/ui/components/bot-badge"
import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import type { BotPermissionMode } from "@workspace/ui/components/bot-settings"
import type { BotAvatarBlot } from "@workspace/ui/components/companion-colour"
import { Icons } from "@workspace/ui/components/icons"
import { Button } from "@workspace/ui/components/ui/button"

const CARD =
	"flex w-full min-w-0 cursor-pointer flex-col gap-3.5 rounded-xl border border-border bg-muted/40 p-4 text-start outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"

type CompanionSummary = {
	id: string
	name: string
	blot?: BotAvatarBlot
	seed?: string
	image?: string
	title?: string
	instructions: string
	skillsCount?: number
	applicationsCount?: number
	permissionMode: BotPermissionMode
}

type CompanionCardProps = {
	companion: CompanionSummary
	onSelect: (id: string) => void
}

const CompanionCard = ({ companion, onSelect }: CompanionCardProps) => {
	const { t } = useTranslation("settings")
	const { t: tBots } = useTranslation("bots")
	const modeCopy = tBots as (key: `approvals.mode.option.${string}`) => string
	const skills =
		companion.skillsCount === undefined
			? undefined
			: t("space.companions.skills", { count: companion.skillsCount })
	const applications =
		companion.applicationsCount === undefined
			? undefined
			: t("space.companions.applications", {
					count: companion.applicationsCount,
				})
	const counts =
		skills && applications
			? t("space.companions.counts", { skills, applications })
			: (skills ?? applications)

	return (
		<li className="flex min-w-0">
			<button
				className={CARD}
				data-slot="companion-card"
				onClick={() => onSelect(companion.id)}
				type="button"
			>
				<span className="flex w-full min-w-0 items-center gap-3">
					<BotIdentityAvatar
						blot={companion.blot}
						className="shrink-0"
						image={companion.image}
						name={companion.name}
						seed={companion.seed}
					/>
					<span className="flex min-w-0 flex-1 items-center gap-2">
						<span
							className="truncate font-medium text-foreground text-sm"
							data-slot="companion-card-name"
						>
							{companion.name}
						</span>
						<BotTitleBadge title={companion.title} />
					</span>
				</span>
				<span
					className="line-clamp-2 h-10 wrap-break-word text-compact text-foreground/85 leading-5"
					data-slot="companion-card-excerpt"
				>
					{companion.instructions}
				</span>
				<span className="flex w-full min-w-0 items-center gap-3 border-border border-t pt-3 text-muted-foreground text-xs">
					{counts && <span className="truncate">{counts}</span>}
					<span className="ms-auto shrink-0" data-slot="companion-card-mode">
						{modeCopy(
							`approvals.mode.option.${companion.permissionMode}.label`,
						)}
					</span>
				</span>
			</button>
		</li>
	)
}

type CompanionsSectionProps = {
	companions: CompanionSummary[]
	spaceName: string
	onSelect: (id: string) => void
	onCreate: () => void
}

const CompanionsSection = ({
	companions,
	spaceName,
	onSelect,
	onCreate,
}: CompanionsSectionProps) => {
	const { t } = useTranslation("settings")

	return (
		<section className="flex flex-col gap-8" data-slot="companions-section">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div className="flex min-w-0 flex-col gap-1">
					<h2 className="font-medium text-muted-foreground text-sm">
						{t("space.companions.title")}
					</h2>
					<p className="wrap-break-word text-compact text-muted-foreground leading-4.5">
						{t("space.companions.caption", { space: spaceName })}
					</p>
				</div>
				<Button
					className="rounded-lg border-input text-compact text-foreground leading-4"
					onClick={onCreate}
					variant="outline"
				>
					<Icons.Add aria-hidden="true" className="size-3.5" />
					{t("space.companions.create")}
				</Button>
			</div>
			{companions.length === 0 ? (
				<p className="text-compact text-muted-foreground leading-5">
					{t("space.companions.empty")}
				</p>
			) : (
				<ul className="grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,--spacing(78)),1fr))] gap-4 p-0">
					{companions.map((companion) => (
						<CompanionCard
							companion={companion}
							key={companion.id}
							onSelect={onSelect}
						/>
					))}
				</ul>
			)}
		</section>
	)
}

export { type CompanionSummary, CompanionsSection, type CompanionsSectionProps }
