import type { CSSProperties, ReactNode } from "react"

import type { BoardPoint } from "@workspace/ui/components/board-view"
import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { companionHue } from "@workspace/ui/components/companion-avatar"
import { hueStyle, hueTone } from "@workspace/ui/components/hue-palette"
import { type ToneSpec, toneOf } from "@workspace/ui/components/hue-recipe"
import { HUE_TONES, YELLOW_BAND } from "@workspace/ui/components/hue-tones"
import { InitialsAvatar } from "@workspace/ui/components/initials-avatar"
import { cn } from "@workspace/ui/lib/utils"

const TAG_AVATAR_SIZE = 16

type BoardPresenceOwner = {
	kind: "agent" | "person"
	id: string
	name: string
	hue: number
	image?: string
}

type BoardOutlineState = "writing" | "drawing"

type BoardPointerPlacement = {
	owner: BoardPresenceOwner
	position: BoardPoint
}

type BoardObjectOutlineSpec = {
	objectId: string
	owner: BoardPresenceOwner
	state: BoardOutlineState
}

const OUTLINE_RING: Record<BoardOutlineState, string> = {
	writing: "*:ring-2 *:ring-(--board-presence)",
	drawing: "*:ring-4 *:ring-(--board-presence)/25",
}

const AGENT_INK_UNDER_WHITE: ToneSpec = {
	...HUE_TONES.light["avatar-ink"],
	contrast: { with: "#ffffff", ratio: 4.5 },
}

const ownerColourOf = ({ kind, name, hue }: BoardPresenceOwner) =>
	kind === "agent"
		? toneOf(AGENT_INK_UNDER_WHITE, companionHue(name, hue), YELLOW_BAND).hex
		: hueTone(hue, "light", "accent").hex

const ownerStyleOf = (owner: BoardPresenceOwner) =>
	({
		...hueStyle(owner.hue),
		"--board-presence": ownerColourOf(owner),
	}) as CSSProperties

type OwnerAvatarProps = { owner: BoardPresenceOwner }

const OwnerAvatar = ({ owner }: OwnerAvatarProps) =>
	owner.kind === "agent" ? (
		<BotIdentityAvatar
			hue={owner.hue}
			image={owner.image}
			name={owner.name}
			seed={owner.id}
			size={TAG_AVATAR_SIZE}
		/>
	) : (
		<InitialsAvatar
			image={owner.image}
			isOnPresenceTag
			name={owner.name}
			size={TAG_AVATAR_SIZE}
		/>
	)

const BoardPointer = ({ owner, position }: BoardPointerPlacement) => (
	<div
		className="absolute top-0 left-0"
		data-owner-kind={owner.kind}
		data-slot="board-pointer"
		style={{
			...ownerStyleOf(owner),
			transform: `translate(${position.x}px, ${position.y}px)`,
		}}
	>
		<svg
			aria-hidden="true"
			className="absolute -top-0.5 -left-0.5 overflow-visible"
			data-slot="board-pointer-arrow"
			height={20}
			viewBox="0 0 20 20"
			width={20}
		>
			<path
				className="fill-(--board-presence) stroke-white"
				d="M2 2 L17 9 L10.5 10.5 L8 17 Z"
				strokeLinejoin="round"
				strokeWidth={1.5}
			/>
		</svg>
		<div
			className="absolute top-4.5 left-3.5 flex h-5.5 items-center gap-1 whitespace-nowrap rounded-[6px] rounded-tl-none bg-(--board-presence) py-[3px] ps-[3px] pe-2"
			data-slot="board-pointer-tag"
		>
			<OwnerAvatar owner={owner} />
			<span
				className="max-w-40 truncate font-semibold text-white text-xs leading-4"
				data-slot="board-pointer-name"
			>
				{owner.name}
			</span>
		</div>
	</div>
)

type BoardObjectOutlineProps = {
	owner: BoardPresenceOwner
	state: BoardOutlineState
	children: ReactNode
}

const BoardObjectOutline = ({
	owner,
	state,
	children,
}: BoardObjectOutlineProps) => (
	<div
		className={cn("contents", OUTLINE_RING[state])}
		data-slot="board-object-outline"
		data-state={state}
		style={ownerStyleOf(owner)}
	>
		{children}
	</div>
)

export {
	BoardObjectOutline,
	type BoardObjectOutlineSpec,
	BoardPointer,
	type BoardPointerPlacement,
	type BoardPresenceOwner,
}
