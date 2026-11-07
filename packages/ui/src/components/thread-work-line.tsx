"use client"

import type { TFunction } from "i18next"
import { Fragment, type ReactNode, useId } from "react"
import { useTranslation } from "react-i18next"

import {
	ActivityClock,
	ActivityIndicator,
	type ActivityIndicatorKind,
	type ActivityIndicatorLayout,
	type ActivityIndicatorWait,
	secondsSince,
	WORK_LINE_AVATAR_SIZE,
} from "@workspace/ui/components/activity-indicator"
import {
	AuthorLineDivider,
	AuthorLineName,
} from "@workspace/ui/components/author-line"
import {
	BotIdentityAvatar,
	type BotStopProps,
} from "@workspace/ui/components/bot-identity-avatar"
import { ConversationBotPile } from "@workspace/ui/components/conversation-bot-pile"
import { Icons } from "@workspace/ui/components/icons"
import {
	TextShimmer,
	WORKING_SHIMMER_DURATION,
} from "@workspace/ui/components/motion/text-shimmer"
import { Button } from "@workspace/ui/components/ui/button"
import { cn } from "@workspace/ui/lib/utils"

type ThreadWorkLineActivity =
	| { state: "thinking" | "writing" | "upNext" | "waiting" }
	| { state: "tool"; label: string }
	| { state: "failed"; onRetry: () => void }

type ThreadWorkLineAgent = ThreadWorkLineActivity & {
	id: string
	name: string
	blot?: number | null
	image?: string
	startedAt?: number
	elapsedSeconds?: number
	onStop?: () => void
}

type ThreadWorkLineState = ThreadWorkLineAgent["state"]

type ThreadWorkLineProps = {
	agents: ThreadWorkLineAgent[]
	isOpen: boolean
	onOpenChange: (isOpen: boolean) => void
}

type FailedAgent = Extract<ThreadWorkLineAgent, { state: "failed" }>

type WorkingAgent = Exclude<ThreadWorkLineAgent, FailedAgent>

type BreakdownState = Exclude<ThreadWorkLineState, "failed" | "waiting">

const BREAKDOWN_ORDER: BreakdownState[] = [
	"writing",
	"tool",
	"thinking",
	"upNext",
]

const NO_ELAPSED = -1

type Indicator = {
	kind: ActivityIndicatorKind
	label?: string
	waitingOn?: ActivityIndicatorWait
}

const indicatorOf = (agent: WorkingAgent): Indicator => {
	switch (agent.state) {
		case "tool":
			return { kind: "working", label: agent.label }
		case "upNext":
			return { kind: "waiting", waitingOn: "next" }
		case "waiting":
			return { kind: "waiting", waitingOn: "you" }
		default:
			return { kind: agent.state }
	}
}

const isFailed = (agent: ThreadWorkLineAgent): agent is FailedAgent =>
	agent.state === "failed"

const isWorking = (agent: ThreadWorkLineAgent): agent is WorkingAgent =>
	!isFailed(agent)

const isBusy = ({ state }: ThreadWorkLineAgent) =>
	state === "thinking" || state === "writing" || state === "tool"

const elapsedOf = ({ elapsedSeconds, startedAt }: ThreadWorkLineAgent) =>
	elapsedSeconds ??
	(startedAt === undefined ? NO_ELAPSED : secondsSince(startedAt))

const rankOf = (agent: ThreadWorkLineAgent) =>
	agent.state === "upNext" ? NO_ELAPSED - 1 : elapsedOf(agent)

const longestFirst = (a: ThreadWorkLineAgent, b: ThreadWorkLineAgent) =>
	rankOf(b) - rankOf(a)

const stopOf = (onStop?: () => void): BotStopProps =>
	onStop ? { stoppable: true, onStop } : {}

type AgentIndicatorProps = {
	agent: WorkingAgent
	layout: ActivityIndicatorLayout
	className?: string
}

const AgentIndicator = ({ agent, layout, className }: AgentIndicatorProps) => (
	<ActivityIndicator
		{...indicatorOf(agent)}
		{...stopOf(agent.onStop)}
		blot={agent.blot}
		botId={agent.id}
		className={className}
		elapsedSeconds={agent.elapsedSeconds}
		image={agent.image}
		layout={layout}
		name={agent.name}
		seed={agent.id}
		startedAt={agent.startedAt}
	/>
)

type FailureProps = { agent: FailedAgent }

const Failure = ({ agent }: FailureProps) => {
	const { t } = useTranslation("chat")

	return (
		<>
			<BotIdentityAvatar
				hue={agent.blot}
				image={agent.image}
				name={agent.name}
				seed={agent.id}
				size={WORK_LINE_AVATAR_SIZE}
			/>
			<AuthorLineName tone="agent" name={agent.name} hue={agent.blot} />
			<span
				data-slot="thread-work-line-failed"
				className="min-w-0 truncate text-destructive text-xs leading-5"
			>
				{t("turn.footer.failed")}
			</span>
			<Button
				variant="ghost"
				aria-label={t("workLine.retry", { name: agent.name })}
				onClick={agent.onRetry}
				className="relative z-1 h-5.5 shrink-0 rounded-sm border-foreground/15 px-2 font-medium text-foreground text-xs transition-none"
			>
				{t("turn.retry")}
			</Button>
		</>
	)
}

type StateTextProps = { children: ReactNode }

const StateText = ({ children }: StateTextProps) => (
	<span className="min-w-0 truncate text-compact text-soft-foreground leading-5">
		<TextShimmer className="inline" duration={WORKING_SHIMMER_DURATION}>
			{children}
		</TextShimmer>
	</span>
)

type HeadlineProps = { agents: WorkingAgent[] }

const Headline = ({ agents }: HeadlineProps) => {
	const { t } = useTranslation("chat")
	const [first, second] = agents
	const state = (
		<StateText>{t("workLine.state", { count: agents.length })}</StateText>
	)

	if (agents.length === 2)
		return (
			<>
				<span className="flex min-w-0 items-center gap-1">
					<AuthorLineName tone="agent" name={first.name} hue={first.blot} />
					<span className="shrink-0 text-compact text-soft-foreground leading-5">
						{t("workLine.and")}
					</span>
					<AuthorLineName tone="agent" name={second.name} hue={second.blot} />
				</span>
				{state}
			</>
		)

	return (
		<>
			<span className="shrink-0 font-semibold text-compact text-foreground leading-5">
				{t("workLine.agents", { count: agents.length })}
			</span>
			{state}
		</>
	)
}

type WaitingHeadlineProps = { agent: WorkingAgent }

const WaitingHeadline = ({ agent }: WaitingHeadlineProps) => {
	const { t } = useTranslation("chat")

	return (
		<>
			<AuthorLineName tone="agent" name={agent.name} hue={agent.blot} />
			<span className="min-w-0 truncate text-compact text-waiting-foreground leading-5">
				{t("working.line.state", { verb: t("working.verb.waiting") })}
			</span>
		</>
	)
}

type BreakdownInput = {
	agents: WorkingAgent[]
	waiter?: WorkingAgent
}

type BreakdownOfInput = BreakdownInput & { t: TFunction<"chat"> }

const breakdownOf = ({ t, agents, waiter }: BreakdownOfInput) => {
	if (waiter) {
		const others = agents.length - 1
		return others > 0 ? [t("workLine.others", { count: others })] : []
	}
	return BREAKDOWN_ORDER.flatMap((state) => {
		const count = agents.filter((agent) => agent.state === state).length
		return count > 0 ? [t(`workLine.breakdown.${state}`, { count })] : []
	})
}

type TailProps = BreakdownInput & { isOpen: boolean }

const Tail = ({ agents, waiter, isOpen }: TailProps) => {
	const { t } = useTranslation("chat")
	const parts = breakdownOf({ t, agents, waiter })
	const separator = t("working.line.separator")
	const clockAgent = agents.filter(isBusy).sort(longestFirst)[0]

	return (
		<span
			data-slot="thread-work-line-tail"
			className={cn(
				"flex h-5 shrink-1000 flex-row-reverse flex-wrap content-start items-center gap-x-2 overflow-hidden",
				isOpen ? "grow justify-between" : "justify-end",
			)}
		>
			{parts.length > 0 ? (
				<span
					data-slot="thread-work-line-breakdown"
					className="order-last whitespace-normal text-muted-foreground text-xs leading-5"
				>
					{[separator, parts.join(` ${separator} `)].join(" ")}
				</span>
			) : null}
			{clockAgent ? (
				<ActivityClock
					elapsedSeconds={clockAgent.elapsedSeconds}
					startedAt={clockAgent.startedAt}
				/>
			) : null}
		</span>
	)
}

type GroupLineProps = { agents: WorkingAgent[]; isOpen: boolean }

const GroupLine = ({ agents, isOpen }: GroupLineProps) => {
	const waiter = agents.find((agent) => agent.state === "waiting")
	const piled = waiter
		? [waiter, ...agents.filter((agent) => agent !== waiter)]
		: agents

	return (
		<>
			<ConversationBotPile
				bots={piled.map((agent) => ({
					id: agent.id,
					name: agent.name,
					image: agent.image,
					blot: agent.blot,
					kind: indicatorOf(agent).kind,
					working: isBusy(agent),
				}))}
			/>
			{waiter ? (
				<WaitingHeadline agent={waiter} />
			) : (
				<Headline agents={agents} />
			)}
			<Tail agents={agents} waiter={waiter} isOpen={isOpen} />
		</>
	)
}

type ToggleProps = {
	isOpen: boolean
	detailId: string
	onOpenChange: (isOpen: boolean) => void
}

const Toggle = ({ isOpen, detailId, onOpenChange }: ToggleProps) => {
	const { t } = useTranslation("chat")

	return (
		<button
			type="button"
			data-slot="thread-work-line-toggle"
			aria-controls={isOpen ? detailId : undefined}
			aria-expanded={isOpen}
			aria-label={t("workLine.toggle")}
			onClick={() => onOpenChange(!isOpen)}
			className={cn(
				"ms-auto flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none after:absolute after:inset-0 after:rounded-sm after:border after:border-transparent hover:bg-foreground/8 hover:text-foreground focus-visible:after:border-ring focus-visible:after:ring-3 focus-visible:after:ring-ring/30 active:bg-foreground/12",
				isOpen && "bg-foreground/8 text-foreground",
			)}
		>
			<Icons.Expand
				aria-hidden="true"
				className={cn("size-3.5", isOpen && "rotate-180")}
			/>
		</button>
	)
}

type DetailRowProps = { agent: ThreadWorkLineAgent }

const DetailRow = ({ agent }: DetailRowProps) =>
	isFailed(agent) ? (
		<li className="flex h-5 min-w-0 items-center gap-2 pe-7">
			<Failure agent={agent} />
		</li>
	) : (
		<li className="min-w-0">
			<AgentIndicator agent={agent} layout="row" className="pe-7" />
		</li>
	)

const ThreadWorkLine = ({
	agents,
	isOpen,
	onOpenChange,
}: ThreadWorkLineProps) => {
	const detailId = useId()
	const failed = agents.filter(isFailed)
	const rest = agents.filter(isWorking)
	const hasDetail = agents.length > 1
	const isDetailShown = hasDetail && isOpen

	if (agents.length === 0) return null

	const line = (
		<div
			data-slot="thread-work-line-line"
			className={cn(
				"flex h-5 min-w-0 items-center gap-2 whitespace-nowrap",
				hasDetail &&
					"relative isolate rounded-sm has-[[data-slot=thread-work-line-toggle]:hover]:bg-muted/50 [&_[data-slot=bot-working-stop]]:z-1",
			)}
		>
			{failed.map((agent) => (
				<Fragment key={agent.id}>
					<Failure agent={agent} />
					<AuthorLineDivider />
				</Fragment>
			))}
			{rest.length === 1 ? (
				<AgentIndicator agent={rest[0]} layout="line" />
			) : null}
			{rest.length > 1 ? (
				<GroupLine agents={rest} isOpen={isDetailShown} />
			) : null}
			{hasDetail ? (
				<Toggle
					detailId={detailId}
					isOpen={isDetailShown}
					onOpenChange={onOpenChange}
				/>
			) : null}
		</div>
	)

	if (!isDetailShown)
		return (
			<div data-slot="thread-work-line" className="min-w-0 ps-4.5">
				{line}
			</div>
		)

	return (
		<div
			data-slot="thread-work-line"
			data-open=""
			className="flex min-w-0 flex-col gap-2 rounded-control bg-foreground/4 p-3"
		>
			{line}
			<span aria-hidden="true" className="h-px shrink-0 bg-foreground/8" />
			<ul id={detailId} className="flex min-w-0 flex-col gap-2">
				{[...agents].sort(longestFirst).map((agent) => (
					<DetailRow key={agent.id} agent={agent} />
				))}
			</ul>
		</div>
	)
}

export {
	ThreadWorkLine,
	type ThreadWorkLineAgent,
	type ThreadWorkLineProps,
	type ThreadWorkLineState,
}
