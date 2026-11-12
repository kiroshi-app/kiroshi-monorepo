import conversationIcons from "@workspace/shared/conversation-icons.json"
import { hueStyle } from "@workspace/ui/components/hue-palette"
import { HUE_THEMES } from "@workspace/ui/components/hue-recipe"
import {
	type ConversationIconName,
	ConversationIcons,
	ConversationOutlineIcons,
} from "@workspace/ui/components/icons"
import { OutlinedHexagon } from "@workspace/ui/components/outlined-hexagon"

const CELL = "relative grid shrink-0 place-items-center"

const PICTOGRAM = "relative"

const BARE_PICTOGRAM = "size-full stroke-[1.75]!"

type ConversationSubjectIconProps = {
	icon?: string
	hue?: number | null
	side?: number
	isBare?: boolean
}

const untintedStyleOf = (roles: string[]) =>
	Object.fromEntries(
		HUE_THEMES.flatMap((theme) =>
			roles.map((role) => [`--hue-${theme}-${role}`, "initial"]),
		),
	)

const UNTINTED_TILE_STYLE = untintedStyleOf([
	"conversation-icon",
	"conversation-icon-foreground",
])

const UNTINTED_GLYPH_STYLE = untintedStyleOf(["avatar-ink"])

const hueScopeOf = (hue: number | null | undefined, isBare: boolean) =>
	hue == null
		? {
				"data-hue": "",
				style: isBare ? UNTINTED_GLYPH_STYLE : UNTINTED_TILE_STYLE,
			}
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
	isBare = false,
}: ConversationSubjectIconProps) => {
	const drawn = isBare ? ConversationOutlineIcons : ConversationIcons
	const Pictogram = drawn[conversationIconOf(icon)]
	const scope = hueScopeOf(hue, isBare)

	return (
		<span
			aria-hidden="true"
			className={CELL}
			data-hue={scope["data-hue"]}
			data-slot="conversation-subject-icon"
			style={{
				...scope.style,
				color: isBare
					? "var(--conversation-glyph)"
					: "var(--conversation-icon-foreground)",
				width: side,
				height: side,
			}}
		>
			{isBare ? (
				<Pictogram
					className={BARE_PICTOGRAM}
					data-slot="conversation-subject-icon-pictogram"
				/>
			) : (
				<>
					<OutlinedHexagon fill="var(--conversation-icon)" side={side} />
					<span
						className={PICTOGRAM}
						style={{ width: side / 2, height: side / 2 }}
					>
						<Pictogram
							className="size-full"
							data-slot="conversation-subject-icon-pictogram"
						/>
					</span>
				</>
			)}
		</span>
	)
}

export {
	ConversationSubjectIcon,
	type ConversationSubjectIconProps,
	conversationIconOf,
}
