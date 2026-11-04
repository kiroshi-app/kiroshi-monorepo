"use client"

import type { TFunction } from "i18next"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { AuthorLineName } from "@workspace/ui/components/author-line"
import {
	type ActivityIndicatorKind,
	BotIdentityAvatar,
	type BotStopProps,
} from "@workspace/ui/components/bot-identity-avatar"
import { useMarkId } from "@workspace/ui/components/mark-context"
import { SharedMark } from "@workspace/ui/components/motion/shared-mark"
import {
	TextShimmer,
	WORKING_SHIMMER_DURATION,
} from "@workspace/ui/components/motion/text-shimmer"
import { TooltipHint } from "@workspace/ui/components/tooltip-hint"
import { readableLabel } from "@workspace/ui/lib/agent-tool"
import { cn } from "@workspace/ui/lib/utils"

type ActivityIndicatorWait = "you" | "next"

type ActivityIndicatorLayout = "line" | "row"

type ActivityIndicatorProps = BotStopProps & {
	kind?: ActivityIndicatorKind
	botId?: string
	name?: string
	label?: string
	waitingOn?: ActivityIndicatorWait
	layout?: ActivityIndicatorLayout
	startedAt?: number
	elapsedSeconds?: number
	blot?: number | null
	image?: string
	seed?: string
	size?: number
	className?: string
}

const SECOND = 1000

const WORK_LINE_AVATAR_SIZE = 20

type LineTextInput = {
	t: TFunction<"chat">
	kind: ActivityIndicatorKind
	label?: string
	waitingOn: ActivityIndicatorWait
}

const lineTextOf = ({ t, kind, label, waitingOn }: LineTextInput) => {
	if (kind === "waiting") {
		if (waitingOn === "next") return t("working.line.upNext")
		return label
			? t("working.line.waitingTitled", { title: label })
			: t("working.line.state", { verb: t("working.verb.waiting") })
	}
	return label
		? readableLabel(t, label)
		: t("working.line.state", { verb: t(`working.verb.${kind}`) })
}

const labelToneOf = (kind: ActivityIndicatorKind, waitingOn: string) => {
	if (kind !== "waiting") return "text-soft-foreground"
	return waitingOn === "next"
		? "text-muted-foreground"
		: "text-waiting-foreground"
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

type ClockProps = { seconds: number; className?: string }

const Clock = ({ seconds, className }: ClockProps) => (
	<span
		data-slot="bot-working-elapsed"
		className={cn(
			"shrink-0 text-muted-foreground text-xs tabular-nums leading-5",
			className,
		)}
	>
		{formatElapsed(seconds)}
	</span>
)

type ElapsedClockProps = { startedAt: number; className?: string }

const ElapsedClock = ({ startedAt, className }: ElapsedClockProps) => {
	const [seconds, setSeconds] = useState(() => secondsSince(startedAt))

	useEffect(() => {
		const tick = () => setSeconds(secondsSince(startedAt))

		tick()
		const timer = window.setInterval(tick, SECOND)

		return () => window.clearInterval(timer)
	}, [startedAt])

	return <Clock seconds={seconds} className={className} />
}

type ActivityClockProps = Pick<
	ActivityIndicatorProps,
	"startedAt" | "elapsedSeconds" | "className"
>

const ActivityClock = ({
	startedAt,
	elapsedSeconds,
	className,
}: ActivityClockProps) => {
	if (elapsedSeconds !== undefined)
		return <Clock seconds={elapsedSeconds} className={className} />
	return startedAt === undefined ? null : (
		<ElapsedClock startedAt={startedAt} className={className} />
	)
}

type WorkLineStopProps = {
	name: string
	onStop: () => void
}

const WorkLineStop = ({ name, onStop }: WorkLineStopProps) => {
	const { t } = useTranslation("chat")

	return (
		<button
			type="button"
			data-slot="bot-working-stop"
			aria-label={t("working.stop", { name })}
			onClick={onStop}
			className="absolute inset-0 flex items-center justify-center rounded-sm bg-foreground opacity-0 outline-offset-2 group-focus-within/work:opacity-100 group-hover/work:opacity-100"
		>
			<span
				aria-hidden="true"
				data-slot="bot-working-stop-glyph"
				className="size-2 rounded-[1px] bg-on-foreground"
			/>
		</button>
	)
}

function ActivityIndicator(props: ActivityIndicatorProps) {
	const {
		kind = "thinking",
		botId,
		name,
		label,
		waitingOn = "you",
		layout = "line",
		startedAt,
		elapsedSeconds,
		blot,
		image,
		seed,
		size = WORK_LINE_AVATAR_SIZE,
		className,
	} = props
	const { t } = useTranslation("chat")
	const markId = useMarkId(botId)
	const named = name ?? t("working.name")
	const isBusy = kind !== "waiting"
	const isTool = isBusy && label !== undefined
	const isRow = layout === "row"
	const text = lineTextOf({ t, kind, label, waitingOn })

	return (
		<div
			data-slot="bot-working"
			data-kind={kind}
			className={cn(
				"group/work flex h-5 min-w-0 items-center gap-2",
				className,
			)}
		>
			<span
				className={cn(
					"relative flex size-5 shrink-0 items-center justify-center",
					kind === "waiting" && waitingOn === "next" && "opacity-70",
				)}
			>
				<SharedMark markId={markId} className="shrink-0">
					<BotIdentityAvatar
						hue={blot}
						image={image}
						kind={kind}
						name={name}
						seed={seed}
						size={size}
						working={isBusy}
					/>
				</SharedMark>
				{props.stoppable ? (
					<WorkLineStop name={named} onStop={props.onStop} />
				) : null}
			</span>
			<AuthorLineName tone="agent" name={named} hue={blot} />
			{isTool ? (
				<span
					aria-hidden="true"
					data-slot="bot-working-separator"
					className="text-faint-foreground text-compact"
				>
					{t("working.line.separator")}
				</span>
			) : null}
			<TooltipHint content={t("working.line.titled", { name: named, text })}>
				<span
					data-slot="bot-working-label"
					className={cn(
						"block min-w-0 max-w-full truncate text-compact leading-5",
						labelToneOf(kind, waitingOn),
						props.stoppable &&
							"group-focus-within/work:hidden group-hover/work:hidden",
					)}
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
			{props.stoppable ? (
				<span
					aria-hidden="true"
					className="hidden shrink-0 text-bubble-foreground text-compact leading-5 group-focus-within/work:block group-hover/work:block"
				>
					{t("working.stop", { name: named })}
				</span>
			) : null}
			{isBusy ? (
				<ActivityClock
					elapsedSeconds={elapsedSeconds}
					startedAt={startedAt}
					className={isRow ? "ms-auto w-12 text-end" : undefined}
				/>
			) : null}
		</div>
	)
}

export type {
	ActivityIndicatorKind,
	ActivityIndicatorLayout,
	ActivityIndicatorWait,
}
export {
	ActivityClock,
	ActivityIndicator,
	formatElapsed,
	secondsSince,
	WORK_LINE_AVATAR_SIZE,
}
