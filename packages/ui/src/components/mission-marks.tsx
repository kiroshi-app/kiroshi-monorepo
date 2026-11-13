import type { ComponentType } from "react"

import { type IconProps, Icons } from "@workspace/ui/components/icons"
import type {
	MissionTicketLink,
	ShownMissionStatus,
} from "@workspace/ui/components/mission"
import { toElapsedTime, toRelativeTime } from "@workspace/ui/lib/time-format"
import { cn } from "@workspace/ui/lib/utils"

type MissionMark = ComponentType<IconProps>

const MISSION_TOOL_MARK: Record<string, MissionMark> = {
	github: Icons.GitHub,
	paper: Icons.Paper,
	superset: Icons.Superset,
}

const MISSION_TICKET_PLATFORM_MARK: Record<string, MissionMark> = {
	github: Icons.GitHub,
	linear: Icons.Linear,
}

const markKeyOf = (name: string) => name.trim().toLowerCase()

const namedMark = (
	table: Record<string, MissionMark>,
	name: string,
): MissionMark | undefined => {
	const key = markKeyOf(name)
	return Object.hasOwn(table, key) ? table[key] : undefined
}

type MissionTicketPlatform = {
	Mark: MissionMark
	isNamed: boolean
}

const missionToolMark = (tool: string): MissionMark =>
	namedMark(MISSION_TOOL_MARK, tool) ?? Icons.Tool

const isNamedMissionTool = (tool: string): boolean =>
	namedMark(MISSION_TOOL_MARK, tool) !== undefined

type MissionSourceKind = "bot" | "reader" | "agent" | "github" | "unknown"

const MISSION_SOURCE_KIND: Record<string, MissionSourceKind> = {
	bot: "bot",
	human: "reader",
	person: "reader",
	"agent-hook": "agent",
	github: "github",
}

const missionSourceKind = (source: string): MissionSourceKind => {
	const key = markKeyOf(source)
	return Object.hasOwn(MISSION_SOURCE_KIND, key)
		? MISSION_SOURCE_KIND[key]
		: "unknown"
}

const missionAgentTool = (tools: string[]): string | undefined =>
	tools.find(isNamedMissionTool)

const missionTicketPlatform = (platform: string): MissionTicketPlatform => {
	const mark = namedMark(MISSION_TICKET_PLATFORM_MARK, platform)
	return { Mark: mark ?? Icons.Bookmark, isNamed: mark !== undefined }
}

const missionTicketPlatformMark = (platform: string): MissionMark =>
	missionTicketPlatform(platform).Mark

type MissionToolMarkProps = {
	tool: string
	className?: string
}

const MissionToolMark = ({ tool, className }: MissionToolMarkProps) => {
	const Mark = missionToolMark(tool)

	return (
		<span
			aria-label={tool}
			className={cn(
				"inline-flex size-4 shrink-0 items-center justify-center text-muted-foreground",
				className,
			)}
			data-slot="mission-tool-mark"
			role="img"
		>
			<Mark aria-hidden="true" className="size-full" />
		</span>
	)
}

type MissionTicketLayout = "wrap" | "line"

type MissionTicketLineStyle = {
	root: string
	mark?: string
	identifier: string
	title: string
}

const MISSION_TICKET_LINE_STYLE: Record<
	MissionTicketLayout,
	MissionTicketLineStyle
> = {
	wrap: {
		root: "flex w-fit max-w-full flex-wrap items-center gap-x-1.5 text-muted-foreground text-xs",
		mark: "size-3",
		identifier: "",
		title: "wrap-break-word",
	},
	line: {
		root: "flex min-w-0 items-center gap-2 text-xs leading-4",
		identifier: "text-foreground",
		title: "truncate text-soft-foreground",
	},
}

type MissionTicketLineProps = {
	ticket: MissionTicketLink
	layout?: MissionTicketLayout
}

const MissionTicketLine = ({
	ticket,
	layout = "wrap",
}: MissionTicketLineProps) => {
	const Mark = missionTicketPlatformMark(ticket.platform)
	const style = MISSION_TICKET_LINE_STYLE[layout]
	const line = (
		<>
			{style.mark ? (
				<Mark aria-hidden="true" className={cn("shrink-0", style.mark)} />
			) : null}
			{ticket.externalId ? (
				<span
					className={cn("shrink-0 font-medium tabular-nums", style.identifier)}
				>
					{ticket.externalId}
				</span>
			) : null}
			{ticket.title ? (
				<span className={cn("min-w-0", style.title)}>{ticket.title}</span>
			) : null}
		</>
	)

	if (!ticket.url) {
		return (
			<span className={style.root} data-slot="mission-ticket-line">
				{line}
			</span>
		)
	}

	return (
		<a
			className={cn(
				"relative rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
				style.root,
			)}
			data-slot="mission-ticket-line"
			href={ticket.url}
			rel="noreferrer noopener"
			target="_blank"
		>
			{line}
		</a>
	)
}

type MissionStatusTimeProps = {
	status: ShownMissionStatus
	isElapsed?: boolean
	className?: string
}

const MissionStatusTime = ({
	status,
	isElapsed = false,
	className,
}: MissionStatusTimeProps) => (
	<time
		className={cn("tabular-nums", className)}
		data-slot="mission-status-time"
		dateTime={new Date(status.writtenAt).toISOString()}
	>
		{(isElapsed ? toElapsedTime : toRelativeTime)(status.writtenAt, status.now)}
	</time>
)

export {
	type MissionMark,
	MissionStatusTime,
	MissionTicketLine,
	MissionToolMark,
	missionAgentTool,
	missionSourceKind,
	missionTicketPlatform,
	missionToolMark,
}
