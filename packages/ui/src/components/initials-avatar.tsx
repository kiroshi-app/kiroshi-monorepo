import type { CSSProperties, ReactNode } from "react"

import { COMPANION_SILHOUETTE } from "@workspace/ui/components/companion-picture"
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@workspace/ui/components/ui/avatar"
import { cn } from "@workspace/ui/lib/utils"

const FALLBACK_NAME = "You"

const DEFAULT_SIZE = 28

const INITIALS_RATIO = 0.4

const PRESENCE_INITIALS_SIZE = 9

type AvatarShape = "hexagon" | "round"

type ShapeStyle = { frame: string; layer: string; mask?: CSSProperties }

const SHAPE_STYLES: Record<AvatarShape, ShapeStyle> = {
	hexagon: {
		frame: "not-typeset block rounded-none after:hidden",
		layer: "rounded-none",
		mask: COMPANION_SILHOUETTE,
	},
	round: {
		frame: "block overflow-hidden rounded-full after:hidden",
		layer: "rounded-full",
	},
}

const INITIALS_CLASS =
	"grid size-full place-items-center bg-sidebar-accent font-medium text-sidebar-accent-foreground uppercase leading-none"

const displayNameOf = (name?: string) => name?.trim() || FALLBACK_NAME

const initialsOf = (name: string) =>
	name
		.split(/\s+/, 2)
		.map((word) => Array.from(word)[0])
		.join("")

type AvatarFrameProps = {
	slot: string
	shape: AvatarShape
	size: number
	image?: string
	overlay?: ReactNode
	className?: string
	children: ReactNode
}

const AvatarFrame = ({
	slot,
	shape,
	size,
	image,
	overlay,
	className,
	children,
}: AvatarFrameProps) => (
	<Avatar
		className={cn(SHAPE_STYLES[shape].frame, className)}
		data-slot={slot}
		style={{ width: size, height: size }}
	>
		{image ? (
			<AvatarImage
				alt=""
				aria-hidden="true"
				className={SHAPE_STYLES[shape].layer}
				src={image}
				style={SHAPE_STYLES[shape].mask}
			/>
		) : null}
		<AvatarFallback
			className={cn(SHAPE_STYLES[shape].layer, "bg-transparent text-inherit")}
			style={SHAPE_STYLES[shape].mask}
		>
			{children}
		</AvatarFallback>
		{overlay}
	</Avatar>
)

type InitialsAvatarProps = {
	name?: string
	image?: string
	size?: number
	isOnOwnBubble?: boolean
	isOnPresenceTag?: boolean
	className?: string
}

const InitialsAvatar = ({
	name,
	image,
	size = DEFAULT_SIZE,
	isOnOwnBubble = false,
	isOnPresenceTag = false,
	className,
}: InitialsAvatarProps) => (
	<AvatarFrame
		className={className}
		image={image}
		shape="round"
		size={size}
		slot="user-avatar"
	>
		<span
			aria-hidden="true"
			className={cn(
				INITIALS_CLASS,
				isOnOwnBubble &&
					"bg-user-bubble-foreground/14 text-user-bubble-foreground",
				isOnPresenceTag &&
					"bg-(--hue-light-avatar-ground) font-bold text-(--hue-light-accent)",
			)}
			style={{
				fontSize: isOnPresenceTag
					? PRESENCE_INITIALS_SIZE
					: Math.round(size * INITIALS_RATIO),
			}}
		>
			{initialsOf(displayNameOf(name))}
		</span>
	</AvatarFrame>
)

export { AvatarFrame, displayNameOf, InitialsAvatar, initialsOf }
