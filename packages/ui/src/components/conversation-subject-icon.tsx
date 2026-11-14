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

const SQUARE_TILE = "absolute inset-0 rounded-sm bg-(--conversation-icon)"

const SQUARE_PICTOGRAM_SHARE = 7 / 12

const HEXAGON_PICTOGRAM_SHARE = 1 / 2

type ConversationSubjectIconProps = {
	icon?: string
	hue?: number | null
	side?: number
	isBare?: boolean
	isFilled?: boolean
	isSquare?: boolean
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

const hueScopeOf = (hue: number | null | undefined, isBare: boolean) =>
	hue == null
		? {
				"data-hue": "",
				style: isBare ? undefined : UNTINTED_TILE_STYLE,
			}
		: { "data-hue": hue, style: hueStyle(hue) }

const inkOf = (hue: number | null | undefined, isBare: boolean) => {
	if (!isBare) return "var(--conversation-icon-foreground)"
	return hue == null ? undefined : "var(--conversation-glyph)"
}

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
	isFilled = false,
	isSquare = false,
}: ConversationSubjectIconProps) => {
	const drawn =
		isBare && !isFilled ? ConversationOutlineIcons : ConversationIcons
	const Pictogram = drawn[conversationIconOf(icon)]
	const scope = hueScopeOf(hue, isBare)
	const pictogramSide =
		side * (isSquare ? SQUARE_PICTOGRAM_SHARE : HEXAGON_PICTOGRAM_SHARE)

	return (
		<span
			aria-hidden="true"
			className={CELL}
			data-hue={scope["data-hue"]}
			data-slot="conversation-subject-icon"
			style={{
				...scope.style,
				color: inkOf(hue, isBare),
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
					{isSquare ? (
						<span
							className={SQUARE_TILE}
							data-slot="conversation-subject-icon-tile"
						/>
					) : (
						<OutlinedHexagon fill="var(--conversation-icon)" side={side} />
					)}
					<span
						className={PICTOGRAM}
						style={{ width: pictogramSide, height: pictogramSide }}
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
