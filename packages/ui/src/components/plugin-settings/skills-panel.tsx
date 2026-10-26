"use client"

import { useTranslation } from "react-i18next"

import type { BotSkillItem } from "@workspace/ui/components/bot-settings"
import { Icons } from "@workspace/ui/components/icons"
import {
	SETTINGS_EMPTY_CLASS,
	SETTINGS_TAG_CLASS,
} from "@workspace/ui/components/settings-styles"
import { Button } from "@workspace/ui/components/ui/button"
import { cn } from "@workspace/ui/lib/utils"

type SkillsPanelProps = {
	skills: BotSkillItem[]
	onOpen: (skill: BotSkillItem) => void
	onAdd: () => void
}

const SkillsPanel = ({ skills, onOpen, onAdd }: SkillsPanelProps) => {
	const { t } = useTranslation("bots")

	if (skills.length === 0) {
		return (
			<div className={SETTINGS_EMPTY_CLASS}>
				<Icons.Skill
					aria-hidden="true"
					className="size-8 text-muted-foreground"
				/>
				<div className="flex flex-col gap-1">
					<span className="font-medium text-foreground text-sm">
						{t("skills.empty.title")}
					</span>
					<p className="max-w-xs text-muted-foreground text-sm">
						{t("skills.empty.description")}
					</p>
				</div>
				<Button onClick={onAdd} size="sm">
					<Icons.Add aria-hidden="true" className="size-3.5" />
					{t("skills.add")}
				</Button>
			</div>
		)
	}

	return (
		<>
			<div className="flex shrink-0 justify-end">
				<Button onClick={onAdd} size="sm" variant="outline">
					<Icons.Add aria-hidden="true" className="size-3.5" />
					{t("skills.add")}
				</Button>
			</div>
			<ul className="flex min-h-0 flex-1 list-none flex-col gap-2 overflow-y-auto p-0">
				{skills.map((skill) => (
					<li key={skill.id}>
						<button
							className="flex w-full cursor-pointer items-center gap-3 rounded-control border border-border px-3 py-2.5 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
							onClick={() => onOpen(skill)}
							type="button"
						>
							<span className="flex min-w-0 flex-1 flex-col gap-0.5">
								<span className="truncate font-medium text-foreground text-sm">
									{skill.name.trim() || t("skills.untitled")}
								</span>
								{skill.description ? (
									<span className="max-w-120 truncate text-muted-foreground text-xs">
										{skill.description}
									</span>
								) : null}
							</span>
							{skill.isSystem ? (
								<span
									className={cn(SETTINGS_TAG_CLASS, "text-muted-foreground")}
								>
									{t("skills.system.tag")}
								</span>
							) : null}
							{skill.isPreloaded ? (
								<span className={cn(SETTINGS_TAG_CLASS, "text-foreground")}>
									{t("skills.preloaded.tag")}
								</span>
							) : null}
							<Icons.Next
								aria-hidden="true"
								className="size-4 shrink-0 text-muted-foreground"
							/>
						</button>
					</li>
				))}
			</ul>
		</>
	)
}

export { SkillsPanel }
