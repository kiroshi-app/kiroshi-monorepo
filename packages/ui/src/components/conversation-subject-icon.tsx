import conversationIcons from "@workspace/shared/conversation-icons.json"
import { hueStyle } from "@workspace/ui/components/hue-palette"
import { HUE_THEMES } from "@workspace/ui/components/hue-recipe"
import {
	type ConversationIconName,
	ConversationIcons,
} from "@workspace/ui/components/icons"
import { OutlinedHexagon } from "@workspace/ui/components/outlined-hexagon"

const CELL = "relative grid shrink-0 place-items-center"

const PICTOGRAM = "relative"

type ConversationSubjectIconProps = {
	icon?: string
	hue?: number | null
	side?: number
}

const UNTINTED_SCOPE_STYLE = Object.fromEntries(
	HUE_THEMES.flatMap((theme) =>
		["conversation-icon", "conversation-icon-foreground"].map((role) => [
			`--hue-${theme}-${role}`,
			"initial",
		]),
	),
)

const hueScopeOf = (hue: number | null | undefined) =>
	hue == null
		? { "data-hue": "", style: UNTINTED_SCOPE_STYLE }
		: { "data-hue": hue, style: hueStyle(hue) }

const isConversationIcon = (
	icon: string | undefined,
): icon is ConversationIconName =>
	icon !== undefined && conversationIcons.includes(icon)

const conversationIconOf = (icon: string | undefined): ConversationIconName =>
	isConversationIcon(icon) ? icon : "MessageSquare"

const ConversationSubjectIcon = ({
	icon,
	hue,
	side = 40,
}: ConversationSubjectIconProps) => {
	const Pictogram = ConversationIcons[conversationIconOf(icon)]
	const scope = hueScopeOf(hue)

	return (
		<span
			aria-hidden="true"
			className={CELL}
			data-hue={scope["data-hue"]}
			data-slot="conversation-subject-icon"
			style={{
				...scope.style,
				color: "var(--conversation-icon-foreground)",
				width: side,
				height: side,
			}}
		>
			<OutlinedHexagon fill="var(--conversation-icon)" side={side} />
			<span className={PICTOGRAM} style={{ width: side / 2, height: side / 2 }}>
				<Pictogram
					className="size-full"
					data-slot="conversation-subject-icon-pictogram"
				/>
			</span>
		</span>
	)
}

export {
	ConversationSubjectIcon,
	type ConversationSubjectIconProps,
	conversationIconOf,
}
