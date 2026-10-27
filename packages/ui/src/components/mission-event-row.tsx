import type { TFunction } from "i18next"
import { useTranslation } from "react-i18next"

import { BotTitleBadge } from "@workspace/ui/components/bot-badge"
import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { MessageHeader } from "@workspace/ui/components/message"
import {
	MessageBubble,
	MessageBubbleContent,
} from "@workspace/ui/components/message-bubble"
import type {
	MissionBot,
	MissionEventModel,
} from "@workspace/ui/components/mission"
import { MissionLink } from "@workspace/ui/components/mission-activity-line"
import {
	type MissionMark,
	missionAgentTool,
	missionSourceKind,
	missionToolMark,
} from "@workspace/ui/components/mission-marks"
import { toRelativeTime } from "@workspace/ui/lib/time-format"

const MISSION_EVENT_GUTTER_SIZE = 40

type MissionEventRowProps = {
	event: MissionEventModel
	tools: string[]
	bot?: MissionBot
	now: number
}

type MissionEventFace = {
	label: string
	Mark?: MissionMark
}

type MissionEventFaceProps = {
	source: string
	tools: string[]
	bot?: MissionBot
	t: TFunction<"chat">
}

const missionEventFace = ({
	source,
	tools,
	bot,
	t,
}: MissionEventFaceProps): MissionEventFace => {
	const kind = missionSourceKind(source)

	if (kind === "bot") {
		return { label: bot?.name ?? t("missions.event.source.bot") }
	}

	if (kind === "agent") {
		const tool = missionAgentTool(tools)

		return tool
			? { label: tool, Mark: missionToolMark(tool) }
			: {
					label: t("missions.event.source.agent"),
					Mark: missionToolMark(source),
				}
	}

	const named = kind === "unknown" ? source : t(`missions.event.source.${kind}`)

	return { label: named, Mark: missionToolMark(source) }
}

type MissionEventTimeProps = {
	event: MissionEventModel
	now: number
}

const MissionEventTime = ({ event, now }: MissionEventTimeProps) => {
	useTranslation("chat")

	return (
		<time
			className="ms-auto shrink-0 text-[11px] leading-4 tabular-nums"
			dateTime={new Date(event.createdAt).toISOString()}
		>
			{toRelativeTime(event.createdAt, now)}
		</time>
	)
}

type MissionEventLineProps = MissionEventTimeProps & {
	label: string
}

const MissionMachineLine = ({ event, label, now }: MissionEventLineProps) => {
	const { t } = useTranslation("chat")
	return (
		<p
			className="flex h-5 w-full min-w-0 items-center gap-2 px-1 text-muted-foreground text-xs leading-4"
			data-slot="mission-machine-line"
		>
			<span
				aria-hidden="true"
				className="size-[5px] shrink-0 rounded-full bg-muted-foreground/45"
			/>
			<span className="min-w-0 truncate">
				{t(`missions.event.line.${event.kind}`, { source: label })}
			</span>
			{event.link ? <MissionLink {...event.link} /> : null}
			<MissionEventTime event={event} now={now} />
		</p>
	)
}

type MissionEventGutterProps = {
	Mark?: MissionMark
	bot?: MissionBot
}

const MissionEventGutter = ({ Mark, bot }: MissionEventGutterProps) => {
	if (Mark) {
		return (
			<span
				className="grid size-10 shrink-0 place-items-center rounded-full bg-muted"
				data-gutter="tool"
				data-slot="mission-event-gutter"
			>
				<Mark
					aria-hidden="true"
					className="size-[18px] text-muted-foreground"
				/>
			</span>
		)
	}

	return (
		<span
			className="flex shrink-0"
			data-gutter="bot"
			data-slot="mission-event-gutter"
		>
			<BotIdentityAvatar
				hue={bot?.blot}
				image={bot?.image}
				name={bot?.name}
				seed={bot?.seed}
				size={MISSION_EVENT_GUTTER_SIZE}
			/>
		</span>
	)
}

type MissionAuthoredEventProps = MissionEventTimeProps & {
	face: MissionEventFace
	bot?: MissionBot
}

const MissionAuthoredEvent = ({
	event,
	face,
	bot,
	now,
}: MissionAuthoredEventProps) => {
	const { t } = useTranslation("chat")

	return (
		<div
			className="flex w-full min-w-0 items-end gap-2"
			data-slot="mission-authored-event"
		>
			<MissionEventGutter Mark={face.Mark} bot={bot} />
			<div className="flex w-full min-w-0 flex-col gap-1">
				<MessageHeader className="min-w-0">
					<span className="min-w-0 truncate font-medium text-foreground/80">
						{face.label}
					</span>
					<BotTitleBadge
						className={
							event.kind === "agent_asked" ? "bg-warning/18" : undefined
						}
						title={t(`missions.event.kind.${event.kind}`)}
					/>
					<MissionEventTime event={event} now={now} />
				</MessageHeader>
				<MessageBubble variant="soft">
					<MessageBubbleContent>{event.text}</MessageBubbleContent>
				</MessageBubble>
			</div>
		</div>
	)
}

const MissionEventRow = ({ event, tools, bot, now }: MissionEventRowProps) => {
	const { t } = useTranslation("chat")
	const face = missionEventFace({ source: event.source, tools, bot, t })

	return (
		<div className="w-full min-w-0" data-slot="mission-event-row">
			{event.text === undefined ? (
				<MissionMachineLine event={event} label={face.label} now={now} />
			) : (
				<MissionAuthoredEvent bot={bot} event={event} face={face} now={now} />
			)}
		</div>
	)
}

export { MissionEventRow }
