"use client"

import type { TFunction } from "i18next"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import {
	type ActivityIndicatorKind,
	BotIdentityAvatar,
	BotStopButton,
	type BotStopProps,
} from "@workspace/ui/components/bot-identity-avatar"
import { useMarkId } from "@workspace/ui/components/mark-context"
import { SharedMark } from "@workspace/ui/components/motion/shared-mark"
import {
	TextShimmer,
	WORKING_SHIMMER_DURATION,
} from "@workspace/ui/components/motion/text-shimmer"
import { TooltipHint } from "@workspace/ui/components/tooltip-hint"
import { TURN_AVATAR_SIZE } from "@workspace/ui/components/turn"
import { readableLabel } from "@workspace/ui/lib/agent-tool"
import { cn } from "@workspace/ui/lib/utils"

type ActivityIndicatorWait = "you" | "next"

type ActivityIndicatorProps = BotStopProps & {
	kind?: ActivityIndicatorKind
	botId?: string
	name?: string
	label?: string
	waitingOn?: ActivityIndicatorWait
	startedAt?: number
	elapsedSeconds?: number
	blot?: number | null
	image?: string
	seed?: string
	size?: number
	className?: string
}

const SECOND = 1000

type RowTextInput = {
	t: TFunction<"chat">
	kind: ActivityIndicatorKind
	name: string
	label?: string
	waitingOn: ActivityIndicatorWait
}

const rowTextOf = ({ t, kind, name, label, waitingOn }: RowTextInput) => {
	if (kind === "waiting") {
		if (waitingOn === "next") return t("working.upNext", { name })
		return label
			? t("working.waitingTitled", { name, title: label })
			: t("working.state", { name, verb: t("working.verb.waiting") })
	}
	return label
		? t("working.labelled", { name, label: readableLabel(t, label) })
		: t("working.state", { name, verb: t(`working.verb.${kind}`) })
}

const secondsSince = (startedAt: number) =>
	Math.max(0, Math.floor((Date.now() - startedAt) / SECOND))

const formatElapsed = (seconds: number) => {
	const minutes = Math.floor(seconds / 60)
	const rest = seconds % 60
	return minutes > 0
		? `${minutes}m ${String(rest).padStart(2, "0")}s`
		: `${rest}s`
}

type ClockProps = { seconds: number }

const Clock = ({ seconds }: ClockProps) => (
	<span
		data-slot="bot-working-elapsed"
		className="shrink-0 font-normal text-muted-foreground text-sm tabular-nums"
	>
		{formatElapsed(seconds)}
	</span>
)

type ElapsedClockProps = { startedAt: number }

const ElapsedClock = ({ startedAt }: ElapsedClockProps) => {
	const [seconds, setSeconds] = useState(() => secondsSince(startedAt))

	useEffect(() => {
		const tick = () => setSeconds(secondsSince(startedAt))

		tick()
		const timer = window.setInterval(tick, SECOND)

		return () => window.clearInterval(timer)
	}, [startedAt])

	return <Clock seconds={seconds} />
}

type ActivityClockProps = Pick<
	ActivityIndicatorProps,
	"startedAt" | "elapsedSeconds"
>

const ActivityClock = ({ startedAt, elapsedSeconds }: ActivityClockProps) => {
	if (elapsedSeconds !== undefined) return <Clock seconds={elapsedSeconds} />
	return startedAt === undefined ? null : <ElapsedClock startedAt={startedAt} />
}

function ActivityIndicator(props: ActivityIndicatorProps) {
	const {
		kind = "thinking",
		botId,
		name,
		label,
		waitingOn = "you",
		startedAt,
		elapsedSeconds,
		blot,
		image,
		seed,
		size = TURN_AVATAR_SIZE,
		className,
	} = props
	const { t } = useTranslation("chat")
	const markId = useMarkId(botId)
	const named = name ?? t("working.name")
	const isBusy = kind !== "waiting"
	const text = rowTextOf({ t, kind, name: named, label, waitingOn })
	const avatar = (
		<BotIdentityAvatar
			hue={blot}
			image={image}
			kind={kind}
			name={name}
			seed={seed}
			size={size}
			working
		/>
	)

	return (
		<div
			data-slot="bot-working"
			data-kind={kind}
			className={cn("flex min-w-0 items-center gap-2", className)}
		>
			<SharedMark markId={markId} className="shrink-0">
				{props.stoppable ? (
					<BotStopButton
						image={image}
						name={named}
						onStop={props.onStop}
						size={size}
					>
						{avatar}
					</BotStopButton>
				) : (
					avatar
				)}
			</SharedMark>
			<TooltipHint content={text}>
				<span
					data-slot="bot-working-label"
					className="block min-w-0 max-w-full flex-1 truncate font-medium text-muted-foreground text-sm"
				>
					{isBusy ? (
						<TextShimmer className="inline" duration={WORKING_SHIMMER_DURATION}>
							{text}
						</TextShimmer>
					) : (
						text
					)}
				</span>
			</TooltipHint>
			{isBusy ? (
				<ActivityClock elapsedSeconds={elapsedSeconds} startedAt={startedAt} />
			) : null}
		</div>
	)
}

export type { ActivityIndicatorKind, ActivityIndicatorWait }
export { ActivityIndicator }
