"use client"

import type { MouseEventHandler, ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { ConversationSubjectIcon } from "@workspace/ui/components/conversation-subject-icon"
import type { GreetingPeriod } from "@workspace/ui/components/greeting-period"
import type { HomeAgent } from "@workspace/ui/components/home-agent-picker"
import { hueStyle } from "@workspace/ui/components/hue-palette"
import { Icons } from "@workspace/ui/components/icons"
import { MessageClock } from "@workspace/ui/components/message"
import { AGENT_BUBBLE_WIDTH } from "@workspace/ui/components/turn"
import { cn } from "@workspace/ui/lib/utils"

type HomeRoom = {
	title: string
	href: string
	icon?: string
	hue?: number | null
}

type HomeRoomLinkTone = "live" | "done" | "small"

type HomeRoomLinkProps = {
	room: HomeRoom
	tone: HomeRoomLinkTone
	onOpen?: MouseEventHandler<HTMLAnchorElement>
}

const ROOM_LINK_TONE = {
	live: {
		title:
			"font-medium text-foreground text-sm leading-5 decoration-foreground/25",
		side: 20,
	},
	done: {
		title:
			"font-medium text-muted-foreground text-sm leading-5 decoration-foreground/20",
		side: 20,
	},
	small: {
		title:
			"-mb-1 pb-1 font-medium text-soft-foreground text-xs leading-4 decoration-foreground/25",
		side: 16,
	},
} as const satisfies Record<HomeRoomLinkTone, { title: string; side: number }>

const LINE = "flex w-full min-w-0 items-center gap-2 p-3"

const LINE_TEXT = "shrink-0 text-sm leading-5"

const TIME = "shrink-0 text-faint-foreground text-xs leading-5 tabular-nums"

const ICON_SLOT = "flex size-5 shrink-0 items-center justify-center"

const HomeRoomLink = ({ room, tone, onOpen }: HomeRoomLinkProps) => {
	const style = ROOM_LINK_TONE[tone]

	return (
		<a
			className="flex min-w-0 items-center gap-1.5 rounded-sm outline-offset-2"
			data-slot="home-room-link"
			href={room.href}
			onClick={onOpen}
		>
			<ConversationSubjectIcon
				hue={room.hue}
				icon={room.icon}
				side={style.side}
			/>
			<span
				className={cn(
					"min-w-0 truncate underline decoration-1 underline-offset-3",
					style.title,
				)}
			>
				{room.title}
			</span>
			{tone === "small" ? null : (
				<Icons.ArrowUpRight
					aria-hidden="true"
					className="size-3 shrink-0 text-faint-foreground"
				/>
			)}
		</a>
	)
}

type HomeThinkingLineProps = { agent: HomeAgent }

const HomeThinkingLine = ({ agent }: HomeThinkingLineProps) => {
	const { t } = useTranslation("chat")

	return (
		<div className={LINE} data-slot="home-thinking-line" role="status">
			<span aria-hidden="true" className="flex shrink-0">
				<BotIdentityAvatar
					hue={agent.hue}
					image={agent.image}
					kind="thinking"
					name={agent.name}
					seed={agent.id}
					size={20}
					working
				/>
			</span>
			<span className="min-w-0 truncate font-medium text-muted-foreground text-sm leading-5">
				{t("home.thinking", { name: agent.name })}
			</span>
		</div>
	)
}

type HomeRoomLineProps = {
	agent: HomeAgent
	room: HomeRoom
	onOpenRoom?: MouseEventHandler<HTMLAnchorElement>
} & ({ state: "working" } | { state: "done"; at: number })

const HomeRoomLine = (props: HomeRoomLineProps) => {
	const { t } = useTranslation("chat")
	const { agent, room, onOpenRoom } = props

	if (props.state === "working") {
		return (
			<div className={LINE} data-slot="home-room-line" data-state="working">
				<span aria-hidden="true" className="flex shrink-0">
					<BotIdentityAvatar
						hue={agent.hue}
						image={agent.image}
						kind="working"
						name={agent.name}
						seed={agent.id}
						size={20}
						working
					/>
				</span>
				<span className={cn(LINE_TEXT, "text-muted-foreground")}>
					{t("home.room.working", { name: agent.name })}
				</span>
				<HomeRoomLink onOpen={onOpenRoom} room={room} tone="live" />
			</div>
		)
	}

	return (
		<div className={LINE} data-slot="home-room-line" data-state="done">
			<span aria-hidden="true" className={ICON_SLOT}>
				<Icons.Check className="size-3.5 text-faint-foreground" />
			</span>
			<span className={cn(LINE_TEXT, "text-faint-foreground")}>
				{t("home.room.worked", { name: agent.name })}
			</span>
			<HomeRoomLink onOpen={onOpenRoom} room={room} tone="done" />
			<MessageClock at={props.at} className={TIME} />
		</div>
	)
}

type HomeMissionState = "completed" | "blocked"

const MISSION_STATE = {
	completed: { Icon: Icons.Success, tone: "text-success" },
	blocked: { Icon: Icons.AlertCircle, tone: "text-destructive" },
} as const satisfies Record<
	HomeMissionState,
	{ Icon: typeof Icons.Success; tone: string }
>

type HomeMissionLineProps = {
	title: string
	state: HomeMissionState
	room: HomeRoom
	at: number
	onOpenRoom?: MouseEventHandler<HTMLAnchorElement>
}

const HomeMissionLine = ({
	title,
	state,
	room,
	at,
	onOpenRoom,
}: HomeMissionLineProps) => {
	const { t } = useTranslation("chat")
	const { Icon, tone } = MISSION_STATE[state]

	return (
		<div className={LINE} data-slot="home-mission-line" data-state={state}>
			<span aria-hidden="true" className={ICON_SLOT}>
				<Icon className={cn("size-4", tone)} />
			</span>
			<span className="min-w-0 truncate font-medium text-foreground text-sm leading-5">
				{title}
			</span>
			<span className={cn(LINE_TEXT, tone)}>{t(`home.mission.${state}`)}</span>
			<span className={cn(LINE_TEXT, "text-muted-foreground")}>
				{t("home.in")}
			</span>
			<HomeRoomLink onOpen={onOpenRoom} room={room} tone="live" />
			<MessageClock at={at} className={TIME} />
		</div>
	)
}

type HomeAskedByLineProps = {
	agent: HomeAgent
	room: HomeRoom
	onOpenRoom?: MouseEventHandler<HTMLAnchorElement>
}

const HomeAskedByLine = ({ agent, room, onOpenRoom }: HomeAskedByLineProps) => {
	const { t } = useTranslation("chat")
	const { hue } = agent
	const isTinted = hue != null

	return (
		<div
			className="flex min-w-0 items-center gap-1.5 text-xs leading-4"
			data-slot="home-asked-by-line"
		>
			<span aria-hidden="true" className="flex shrink-0">
				<BotIdentityAvatar
					hue={agent.hue}
					image={agent.image}
					name={agent.name}
					seed={agent.id}
					size={16}
				/>
			</span>
			<span
				className="min-w-0 truncate font-semibold text-primary"
				data-hue={isTinted ? hue : undefined}
				style={isTinted ? hueStyle(hue) : undefined}
			>
				{agent.name}
			</span>
			<span className="shrink-0 text-muted-foreground">{t("home.in")}</span>
			<HomeRoomLink onOpen={onOpenRoom} room={room} tone="small" />
		</div>
	)
}

type HomeRequestProps = {
	askedBy: ReactNode
	children: ReactNode
}

const HomeRequest = ({ askedBy, children }: HomeRequestProps) => (
	<div className="flex flex-col gap-4" data-slot="home-request">
		<div className="px-3">{askedBy}</div>
		<div className={AGENT_BUBBLE_WIDTH}>{children}</div>
	</div>
)

type HomeArchivedLineProps = {
	agentName: string
	period: GreetingPeriod
	onOpen: () => void
}

const HomeArchivedLine = ({
	agentName,
	period,
	onOpen,
}: HomeArchivedLineProps) => {
	const { t } = useTranslation("chat")

	return (
		<div
			className="flex flex-wrap items-center justify-center gap-1.5 pt-1 text-compact leading-4"
			data-slot="home-archived-line"
		>
			<Icons.Archive
				aria-hidden="true"
				className="size-3.5 shrink-0 text-faint-foreground"
			/>
			<p className="text-muted-foreground">
				{t(`home.archived.${period}`, { name: agentName })}
			</p>
			<button
				className="relative rounded-sm font-medium text-foreground underline decoration-1 underline-offset-3 outline-offset-2 after:absolute after:-inset-y-1 after:inset-x-0"
				onClick={onOpen}
				type="button"
			>
				{t("home.archived.open")}
			</button>
		</div>
	)
}

export {
	HomeArchivedLine,
	type HomeArchivedLineProps,
	HomeAskedByLine,
	type HomeAskedByLineProps,
	HomeMissionLine,
	type HomeMissionLineProps,
	type HomeMissionState,
	HomeRequest,
	type HomeRequestProps,
	type HomeRoom,
	HomeRoomLine,
	type HomeRoomLineProps,
	HomeThinkingLine,
	type HomeThinkingLineProps,
}
