"use client"

import { Tabs } from "@base-ui/react/tabs"
import { Toggle } from "@base-ui/react/toggle"
import { ToggleGroup } from "@base-ui/react/toggle-group"
import { type KeyboardEvent, useId, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import conversationIcons from "@workspace/shared/conversation-icons.json"
import { DangerZone } from "@workspace/ui/components/bot-settings-dialog/danger-zone"
import { ColourField } from "@workspace/ui/components/colour-field"
import { ParticipantsPanel } from "@workspace/ui/components/conversation-settings-dialog/participants-panel"
import {
	ConversationSubjectIcon,
	conversationIconOf,
} from "@workspace/ui/components/conversation-subject-icon"
import {
	type ConversationIconName,
	Icons,
} from "@workspace/ui/components/icons"
import type { RosterBot } from "@workspace/ui/components/roster"
import { SettingsDialogShell } from "@workspace/ui/components/settings-dialog-shell"
import { SettingsField } from "@workspace/ui/components/settings-field"
import {
	DANGER_RAIL_ITEM_CLASS,
	SETTINGS_PANEL_CLASS,
	SettingsRailItem,
	SettingsRailSeparator,
	SettingsScrollingPanel,
} from "@workspace/ui/components/settings-rail"
import {
	FIELD_LABEL_CLASS,
	POPUP_CLASS,
} from "@workspace/ui/components/settings-styles"
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@workspace/ui/components/ui/popover"
import { cn } from "@workspace/ui/lib/utils"

const FIRST_TAB = "general"

const DANGER_TAB = "danger"

const ICON_OPTIONS = conversationIcons as ConversationIconName[]

const ICON_COLUMNS = 6

const ROW_STEPS: Partial<Record<string, number>> = {
	ArrowDown: ICON_COLUMNS,
	ArrowUp: -ICON_COLUMNS,
}

const ICON_TRIGGER_CLASS =
	"flex w-fit cursor-pointer items-center gap-2 rounded-control border border-input bg-muted py-1.25 ps-1.5 pe-2.5 text-foreground text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 aria-expanded:bg-[color-mix(in_oklch,var(--muted),var(--foreground)_3%)]"

const ICON_POPUP_CLASS = cn(POPUP_CLASS, "w-auto gap-0 rounded-xl p-1.5 ring-0")

const ICON_OPTION_CLASS =
	"grid size-9 cursor-pointer place-items-center rounded-lg outline-none not-data-pressed:hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring data-pressed:bg-muted data-pressed:inset-ring-1 data-pressed:inset-ring-foreground/22"

type ConversationIconFieldProps = {
	icon?: ConversationIconName
	hue?: number | null
	onIconChange?: (icon: ConversationIconName) => void
}

const focusOptionOneRowAway = (event: KeyboardEvent<HTMLDivElement>) => {
	const step = ROW_STEPS[event.key]
	if (!step) return
	const options = [
		...event.currentTarget.querySelectorAll<HTMLElement>("button"),
	]
	const target = options[options.indexOf(event.target as HTMLElement) + step]
	if (!target) return
	event.preventDefault()
	target.focus()
}

const ConversationIconField = ({
	icon,
	hue,
	onIconChange,
}: ConversationIconFieldProps) => {
	const { t } = useTranslation("chat")
	const [open, setOpen] = useState(false)
	const currentOption = useRef<HTMLButtonElement>(null)
	const labelId = useId()
	const valueId = useId()
	const current = conversationIconOf(icon)

	const choose = (next: ConversationIconName) => {
		onIconChange?.(next)
		setOpen(false)
	}

	return (
		<div className="flex flex-col gap-1.5">
			<span className={FIELD_LABEL_CLASS} id={labelId}>
				{t("conversationSettings.icon.label")}
			</span>
			<Popover onOpenChange={setOpen} open={open}>
				<PopoverTrigger
					aria-labelledby={`${labelId} ${valueId}`}
					className={ICON_TRIGGER_CLASS}
				>
					<ConversationSubjectIcon hue={hue} icon={current} side={26} />
					<span className="w-18 truncate text-start" id={valueId}>
						{t(`conversationSettings.icon.option.${current}`)}
					</span>
					<Icons.Expand
						aria-hidden="true"
						className="size-3.5 shrink-0 text-muted-foreground"
					/>
				</PopoverTrigger>
				<PopoverContent
					align="start"
					aria-labelledby={labelId}
					className={ICON_POPUP_CLASS}
					initialFocus={currentOption}
				>
					<ToggleGroup
						aria-labelledby={labelId}
						className="grid grid-cols-6 gap-0.5"
						loopFocus
						onKeyDown={focusOptionOneRowAway}
						value={[current]}
					>
						{ICON_OPTIONS.map((option) => (
							<Toggle
								aria-label={t(`conversationSettings.icon.option.${option}`)}
								className={ICON_OPTION_CLASS}
								key={option}
								onClick={() => choose(option)}
								ref={option === current ? currentOption : undefined}
								value={option}
							>
								<ConversationSubjectIcon hue={hue} icon={option} side={28} />
							</Toggle>
						))}
					</ToggleGroup>
				</PopoverContent>
			</Popover>
		</div>
	)
}

type ConversationColourFieldProps = {
	icon?: ConversationIconName
	hue?: number | null
	onHueChange?: (hue: number | null) => void
}

const ConversationColourField = ({
	icon,
	hue = null,
	onHueChange,
}: ConversationColourFieldProps) => (
	<ColourField
		mark={(option) => (
			<ConversationSubjectIcon hue={option} icon={icon} side={26} />
		)}
		noColour="last"
		onValueChange={(next) => onHueChange?.(next)}
		value={hue}
	/>
)

type ConversationSettingsValue = {
	name: string
	instructions: string
}

type ConversationSettingsDialogProps = {
	open: boolean
	onClose: () => void
	value: ConversationSettingsValue
	onValueChange: (value: ConversationSettingsValue) => void
	icon?: ConversationIconName
	hue?: number | null
	onIconChange?: (icon: ConversationIconName) => void
	onHueChange?: (hue: number | null) => void
	participants: RosterBot[]
	leadId: string
	onLeadChange: (id: string) => void
	onDismiss: (id: string) => void
	onDelete: () => void
	className?: string
}

const ConversationSettingsDialog = ({
	open,
	onClose,
	value,
	onValueChange,
	icon,
	hue,
	onIconChange,
	onHueChange,
	participants,
	leadId,
	onLeadChange,
	onDismiss,
	onDelete,
	className,
}: ConversationSettingsDialogProps) => {
	const { t } = useTranslation("chat")
	const conversationName =
		value.name.trim() || t("conversationSettings.untitled")

	const patch = (fields: Partial<ConversationSettingsValue>) =>
		onValueChange({ ...value, ...fields })

	return (
		<SettingsDialogShell
			breadcrumb={t("conversationSettings.breadcrumb")}
			className={className}
			mark={<ConversationSubjectIcon hue={hue} icon={icon} side={24} />}
			name={conversationName}
			onClose={onClose}
			open={open}
			rail={(iconsOnly) => (
				<>
					<SettingsRailItem
						icon="Settings"
						iconsOnly={iconsOnly}
						label={t("conversationSettings.tab.general")}
						value={FIRST_TAB}
					/>
					<SettingsRailItem
						icon="User"
						iconsOnly={iconsOnly}
						label={t("conversationSettings.tab.participants")}
						value="participants"
					/>
					<SettingsRailItem
						icon="Docs"
						iconsOnly={iconsOnly}
						label={t("conversationSettings.tab.instructions")}
						value="instructions"
					/>
					<SettingsRailSeparator />
					<SettingsRailItem
						className={DANGER_RAIL_ITEM_CLASS}
						icon="Alert"
						iconsOnly={iconsOnly}
						label={t("conversationSettings.tab.danger")}
						value={DANGER_TAB}
					/>
				</>
			)}
			tab={FIRST_TAB}
		>
			<SettingsScrollingPanel value={FIRST_TAB}>
				<SettingsField
					label={t("conversationSettings.name.label")}
					onValueChange={(name) => patch({ name })}
					placeholder={t("conversationSettings.name.placeholder")}
					value={value.name}
				/>
				<ConversationIconField
					hue={hue}
					icon={icon}
					onIconChange={onIconChange}
				/>
				<ConversationColourField
					hue={hue}
					icon={icon}
					onHueChange={onHueChange}
				/>
			</SettingsScrollingPanel>

			<SettingsScrollingPanel value="participants">
				<ParticipantsPanel
					leadId={leadId}
					onDismiss={onDismiss}
					onLeadChange={onLeadChange}
					participants={participants}
				/>
			</SettingsScrollingPanel>

			<Tabs.Panel className={SETTINGS_PANEL_CLASS} value="instructions">
				<SettingsField
					fill
					label={t("conversationSettings.instructions.label")}
					onValueChange={(instructions) => patch({ instructions })}
					placeholder={t("conversationSettings.instructions.placeholder")}
					value={value.instructions}
				/>
			</Tabs.Panel>

			<SettingsScrollingPanel value={DANGER_TAB}>
				<DangerZone
					confirmTitle={t("conversationSettings.danger.confirm.title", {
						name: conversationName,
					})}
					actionLabel={t("conversationSettings.danger.delete")}
					description={t("conversationSettings.danger.description")}
					onConfirm={onDelete}
				/>
			</SettingsScrollingPanel>
		</SettingsDialogShell>
	)
}

export {
	ConversationSettingsDialog,
	type ConversationSettingsDialogProps,
	type ConversationSettingsValue,
}
