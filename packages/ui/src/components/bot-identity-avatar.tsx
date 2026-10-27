"use client"

import { type ReactNode, useState } from "react"
import { useTranslation } from "react-i18next"

import { type BotBadge, BotBadgeDot } from "@workspace/ui/components/bot-badge"
import {
	type BotAvatarBlot,
	hueOf,
} from "@workspace/ui/components/companion-colour"
import {
	COMPANION_SILHOUETTE,
	SILHOUETTE_FOCUS_RING,
} from "@workspace/ui/components/companion-picture"
import type { BotAvatarState } from "@workspace/ui/components/companion-state"
import { DitheredFieldAvatar } from "@workspace/ui/components/dithered-field-avatar"
import { Icons } from "@workspace/ui/components/icons"
import { AvatarFrame } from "@workspace/ui/components/initials-avatar"
import { OutlinedHexagon } from "@workspace/ui/components/outlined-hexagon"
import {
	type ClickModifiers,
	clickHandlersFor,
} from "@workspace/ui/lib/click-modifiers"
import { cn } from "@workspace/ui/lib/utils"

type ActivityIndicatorKind = Extract<
	BotAvatarState,
	"thinking" | "searching" | "working" | "writing" | "waiting"
>

const DEFAULT_SIZE = 40

type BotIdentityAvatarProps = {
	name?: string
	blot?: BotAvatarBlot
	seed?: string
	image?: string
	badge?: BotBadge
	working?: boolean
	kind?: ActivityIndicatorKind
	size?: number
	className?: string
}

function BotIdentityAvatar({
	name,
	blot,
	seed,
	image,
	badge,
	working = false,
	kind = "thinking",
	size = DEFAULT_SIZE,
	className,
}: BotIdentityAvatarProps) {
	return (
		<AvatarFrame
			className={className}
			image={image}
			overlay={
				<>
					<OutlinedHexagon fill="none" side={size} />
					{badge ? (
						<BotBadgeDot
							badge={badge}
							data-slot="bot-activity-dot"
							placement="avatar"
						/>
					) : null}
				</>
			}
			shape="hexagon"
			size={size}
			slot="bot-identity-avatar"
		>
			<DitheredFieldAvatar
				name={name ?? seed ?? ""}
				size={size}
				state={working ? kind : "idle"}
				hue={hueOf(blot)}
			/>
		</AvatarFrame>
	)
}

const STOP_OVERLAY =
	"pointer-events-none absolute inset-0 flex items-center justify-center bg-background/75 text-foreground"

type BotStopProps =
	| { stoppable: true; onStop: () => void }
	| { stoppable?: false; onStop?: () => void }

type BotStopButtonProps = {
	name: string
	image?: string
	size?: number
	onStop: () => void
	children: ReactNode
}

const BotStopButton = ({ name, onStop, children }: BotStopButtonProps) => {
	const { t } = useTranslation("chat")
	const [armed, setArmed] = useState(false)

	return (
		<button
			type="button"
			data-slot="bot-working-stop"
			aria-label={t("working.stop", { name })}
			onClick={onStop}
			onPointerEnter={() => setArmed(true)}
			onPointerLeave={() => setArmed(false)}
			onFocus={() => setArmed(true)}
			onBlur={() => setArmed(false)}
			className={cn("relative block w-fit", SILHOUETTE_FOCUS_RING)}
		>
			{children}
			<span
				aria-hidden="true"
				data-slot="bot-working-stop-glyph"
				className={cn(STOP_OVERLAY, armed ? "opacity-100" : "opacity-0")}
				style={COMPANION_SILHOUETTE}
			>
				<Icons.Stop className="size-1/2" />
			</span>
		</button>
	)
}

type BotSelectButtonProps = {
	name: string
	image?: string
	size?: number
	onSelect: (modifiers: ClickModifiers) => void
	children: ReactNode
}

const BotSelectButton = ({
	name,
	onSelect,
	children,
}: BotSelectButtonProps) => (
	<button
		type="button"
		data-slot="bot-select"
		aria-label={name}
		{...clickHandlersFor(onSelect)}
		className={cn(
			"block w-fit cursor-pointer transition-opacity duration-150 ease-out hover:not-focus-visible:opacity-70 hover:transition-none motion-reduce:transition-none",
			SILHOUETTE_FOCUS_RING,
		)}
	>
		{children}
	</button>
)

export {
	type ActivityIndicatorKind,
	BotIdentityAvatar,
	type BotIdentityAvatarProps,
	BotSelectButton,
	BotStopButton,
	type BotStopProps,
}
