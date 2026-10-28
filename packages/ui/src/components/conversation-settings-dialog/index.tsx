"use client"

import { Toggle } from "@base-ui/react/toggle"
import { ToggleGroup } from "@base-ui/react/toggle-group"
import { type KeyboardEvent, useId, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import conversationIcons from "@workspace/shared/conversation-icons.json"
import { ColourField } from "@workspace/ui/components/colour-field"
import {
	ConversationSubjectIcon,
	conversationIconOf,
} from "@workspace/ui/components/conversation-subject-icon"
import {
	type ConversationIconName,
	Icons,
} from "@workspace/ui/components/icons"
import type { RosterBot } from "@workspace/ui/components/roster"
import { SettingsField } from "@workspace/ui/components/settings-field"
import {
	FIELD_LABEL_CLASS,
	POPUP_CLASS,
} from "@workspace/ui/components/settings-styles"
import { SpaceTint } from "@workspace/ui/components/space-tint"
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@workspace/ui/components/ui/popover"
import { cn } from "@workspace/ui/lib/utils"

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
					<ConversationSubjectIcon icon={current} side={26} />
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
								<ConversationSubjectIcon icon={option} side={28} />
							</Toggle>
						))}
					</ToggleGroup>
				</PopoverContent>
			</Popover>
		</div>
	)
}

type ConversationColourFieldProps = {
	hue?: number | null
	onHueChange?: (hue: number | null) => void
}

const ConversationColourField = ({
	hue = null,
	onHueChange,
}: ConversationColourFieldProps) => (
	<ColourField
		mark={(option) => <SpaceTint className="size-6" tint={option} />}
		noColour="last"
		onValueChange={(next) => onHueChange?.(next)}
		value={hue}
	/>
)

type ConversationSettingsValue = {
	name: string
	instructions: string
}

type ConversationValueProps = {
	value: ConversationSettingsValue
	onValueChange: (value: ConversationSettingsValue) => void
}

type ConversationGeneralFieldsProps = ConversationValueProps &
	ConversationColourFieldProps &
	ConversationIconFieldProps

const ConversationGeneralFields = ({
	value,
	onValueChange,
	icon,
	onIconChange,
	...colour
}: ConversationGeneralFieldsProps) => {
	const { t } = useTranslation("chat")

	return (
		<>
			<SettingsField
				label={t("conversationSettings.name.label")}
				onValueChange={(next) => onValueChange({ ...value, name: next })}
				placeholder={t("conversationSettings.name.placeholder")}
				value={value.name}
			/>
			<ConversationIconField icon={icon} onIconChange={onIconChange} />
			<ConversationColourField {...colour} />
		</>
	)
}

type ConversationInstructionsFieldProps = ConversationValueProps & {
	isTall?: boolean
}

const ConversationInstructionsField = ({
	value,
	onValueChange,
	isTall,
}: ConversationInstructionsFieldProps) => {
	const { t } = useTranslation("chat")

	return (
		<SettingsField
			fill={!isTall}
			height={isTall ? "tall" : undefined}
			label={t("conversationSettings.instructions.label")}
			onValueChange={(instructions) =>
				onValueChange({ ...value, instructions })
			}
			placeholder={t("conversationSettings.instructions.placeholder")}
			value={value.instructions}
		/>
	)
}

type ConversationSettingsDialogProps = {
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
}

export {
	ConversationGeneralFields,
	ConversationInstructionsField,
	type ConversationSettingsDialogProps,
	type ConversationSettingsValue,
}
