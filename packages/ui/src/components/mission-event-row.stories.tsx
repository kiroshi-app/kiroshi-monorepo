import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	listExhaustively,
	slotIn,
	slotsIn,
	tokenStyleIn,
} from "@workspace/storybook/story-utils"
import {
	MessageBubble,
	MessageBubbleContent,
	MessageBubbleGroup,
} from "@workspace/ui/components/message-bubble"
import type {
	MissionEventKind,
	MissionEventModel,
} from "@workspace/ui/components/mission"
import { MissionEventRow } from "@workspace/ui/components/mission-event-row"
import { MissionHeader } from "@workspace/ui/components/mission-header"
import {
	AUTHORED_MISSION_EVENTS,
	MISSION_BOT,
	MISSION_EVENTS,
	MISSION_NOW,
	MISSION_OBJECTIVE,
	MISSION_OPENED_AT,
	MISSION_PULL_REQUEST,
	MISSION_TICKET,
	MISSION_TOOLS,
	MISSION_TOOLS_WITHOUT_A_MARK,
} from "@workspace/ui/components/missions.fixtures"

const MISSION_EVENT_KINDS = listExhaustively<MissionEventKind>({
	opened: true,
	note: true,
	agent_asked: true,
	answered: true,
	escalated: true,
	ready: true,
	checks_failed: true,
	failed: true,
	closed: true,
	dismissed: true,
	reopened: true,
})

const AGENT_QUESTION: MissionEventModel = {
	id: "event-agent-question",
	kind: "agent_asked",
	source: "agent-hook",
	createdAt: MISSION_NOW - 600_000,
	text: "Which branch should the mirror file be resolved on?",
}

const GITHUB_NOTE: MissionEventModel = {
	id: "event-github-note",
	kind: "note",
	source: "github",
	createdAt: MISSION_NOW - 900_000,
	text: "Opened the pull request against the branch the mission was handed.",
}

const PULL_REQUEST_EVENT: MissionEventModel = {
	id: "event-pull-request",
	kind: "ready",
	source: "github",
	createdAt: MISSION_NOW - 300_000,
	link: {
		url: MISSION_PULL_REQUEST.url,
		pullRequest: MISSION_PULL_REQUEST.number,
	},
}

const HUMAN_ANSWER: MissionEventModel = {
	id: "event-human-answer",
	kind: "answered",
	source: "human",
	createdAt: MISSION_NOW - 300_000,
	text: "Resolve it here, the other branch is already merged.",
}

const A_VERY_LONG_BOT_NAME =
	"Anastasia Konstantinopoulou-Whitfield of the Changelog Parsers"

const [MACHINE_EVENT, AUTHORED_EVENT] = MISSION_EVENTS

const PLACED_BY_THE_FEED =
	"`apps/app/src/components/thread-screen.tsx:923` renders one row per stored event of the mission thread."

const agentAskedOnWarning = {
	args: { event: AGENT_QUESTION },
	play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
		const badge = slotIn(canvasElement, "bot-title-badge")
		const { backgroundColor } = getComputedStyle(badge)

		await expect(backgroundColor).toBe(
			tokenStyleIn(badge, "bg-warning/18", "backgroundColor"),
		)
		await expect(backgroundColor).not.toBe(
			tokenStyleIn(badge, "bg-bot-badge-attention/18", "backgroundColor"),
		)
	},
}

const meta = preview.meta({
	title: "Conversation/Missions/MissionEventRow",
	component: MissionEventRow,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"One thing a mission recorded, dropped in the transcript at the moment it landed. The source a mission stores is a machine word, so every row resolves it first: the companion answers with its name and its avatar, the agent hook with the tool the mission carries, GitHub and the reader with their own words. An event whose payload holds text speaks in a soft bubble; every other event is a machine line kept to one line.",
			},
		},
	},
	args: {
		event: MACHINE_EVENT,
		bot: MISSION_BOT,
		tools: MISSION_TOOLS,
		now: MISSION_NOW,
	},
	render: (args) => (
		<div className="w-[36rem] max-w-full">
			<MissionEventRow {...args} />
		</div>
	),
})

export const MachineLine = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The mission being opened, with nothing written into its payload. Check that it reads as one muted line naming the companion rather than the stored source, and that the time sits on the trailing edge. Pick `AuthoredEvent` for the form an event carrying text takes. " +
					PLACED_BY_THE_FEED,
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [line] = slotsIn(canvasElement, "mission-machine-line")

		await expect(line).toHaveTextContent(
			`Mission opened by ${MISSION_BOT.name}`,
		)
		await expect(slotsIn(canvasElement, "mission-authored-event")).toHaveLength(
			0,
		)
	},
})

export const WithPullRequestLink = meta.story({
	args: { event: PULL_REQUEST_EVENT },
	parameters: {
		docs: {
			description: {
				story:
					"A pull request marked ready, with nothing written into its payload. Check that the machine line reads the wording of its kind, then the pull request number as a link opening in a new tab and naming the pull request it opens, then the time. Pick `WithAnUnnumberedLink` for a link that carries no pull request number. " +
					PLACED_BY_THE_FEED,
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const [line] = slotsIn(canvasElement, "mission-machine-line")
		const link = canvas.getByRole("link", { name: "Open pull request #482" })

		await expect(line).toHaveTextContent("Marked ready to merge by GitHub")
		await expect(link).toHaveTextContent("#482")
		await expect(link).toHaveAttribute("href", MISSION_PULL_REQUEST.url)
		await expect(link).toHaveAttribute("target", "_blank")
		await expect(link.nextElementSibling?.tagName).toBe("TIME")
	},
})

export const WithAnUnnumberedLink = meta.story({
	args: {
		event: {
			...PULL_REQUEST_EVENT,
			link: { url: MISSION_PULL_REQUEST.url },
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"An event carrying a link with no pull request number. Check that the link reads the host it leads to, and that its accessible name says it opens that host. Pick `WithPullRequestLink` for a numbered pull request. " +
					PLACED_BY_THE_FEED,
			},
		},
	},
	play: async ({ canvas }) => {
		const link = canvas.getByRole("link", { name: "Open github.example" })

		await expect(link).toHaveTextContent("github.example")
		await expect(link).toHaveAttribute("href", MISSION_PULL_REQUEST.url)
	},
})

export const AuthoredEvent = meta.story({
	args: { event: AUTHORED_EVENT },
	parameters: {
		docs: {
			description: {
				story:
					"A note the companion wrote against the mission. Check that the gutter carries the mission companion avatar, that the author line names the companion, its kind and its time, and that the text lands in the soft bubble the transcript already uses. Pick `FromTheAgent` for an event the coding agent sent. " +
					PLACED_BY_THE_FEED,
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [authored] = slotsIn(canvasElement, "mission-authored-event")
		const [gutter] = slotsIn(canvasElement, "mission-event-gutter")

		await expect(authored).toHaveTextContent(MISSION_BOT.name)
		await expect(gutter).toHaveAttribute("data-gutter", "bot")
	},
})

export const FromTheAgent = meta.story({
	args: { event: AGENT_QUESTION },
	parameters: {
		docs: {
			description: {
				story:
					"A question the agent hook sent, on a mission whose tools name Superset. Check that the row is labelled with that tool rather than with `agent-hook`, and that the Superset mark sits on the round muted gutter. Pick `FromTheAgentWithoutATool` for a mission whose tools the mark table does not name. " +
					PLACED_BY_THE_FEED,
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [authored] = slotsIn(canvasElement, "mission-authored-event")
		const [gutter] = slotsIn(canvasElement, "mission-event-gutter")

		await expect(authored).toHaveTextContent("Superset")
		await expect(authored).not.toHaveTextContent("agent-hook")
		await expect(gutter).toHaveAttribute("data-gutter", "tool")
	},
})

export const AgentAskedOnWarning = meta.story({
	...agentAskedOnWarning,
	parameters: {
		docs: {
			description: {
				story:
					"A question the agent is waiting on the reader to answer. Check that the kind badge on the author line is tinted from `--warning`, the tone of every signal blocked on the reader, and never from `--bot-badge-attention`. Pick `FromTheAgent` for the gutter and the tool name of the same row. " +
					PLACED_BY_THE_FEED,
			},
		},
	},
})

export const AgentAskedOnWarningDark = meta.story({
	...agentAskedOnWarning,
	globals: { theme: "dark" },
})

export const FromTheAgentWithoutATool = meta.story({
	args: { event: AGENT_QUESTION, tools: MISSION_TOOLS_WITHOUT_A_MARK },
	parameters: {
		docs: {
			description: {
				story:
					"The same question, on a mission carrying no tool the mark table names. Check that the row falls back to the words of the catalogue rather than to the stored source, and that the gutter draws the default tool mark. Pick `FromTheAgent` for the mission that names its tool. " +
					PLACED_BY_THE_FEED,
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [authored] = slotsIn(canvasElement, "mission-authored-event")
		const [gutter] = slotsIn(canvasElement, "mission-event-gutter")

		await expect(authored).toHaveTextContent("The coding session")
		await expect(gutter).toHaveAttribute("data-gutter", "tool")
	},
})

export const FromGitHub = meta.story({
	args: { event: GITHUB_NOTE },
	parameters: {
		docs: {
			description: {
				story:
					"A note the GitHub watcher recorded when the pull request opened. Check that the row is labelled GitHub and that the GitHub mark sits on the gutter, so a reader tells a platform event from an agent event without reading the text. " +
					PLACED_BY_THE_FEED,
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [authored] = slotsIn(canvasElement, "mission-authored-event")
		const [gutter] = slotsIn(canvasElement, "mission-event-gutter")

		await expect(authored).toHaveTextContent("GitHub")
		await expect(gutter).toHaveAttribute("data-gutter", "tool")
	},
})

export const FromTheReader = meta.story({
	args: { event: HUMAN_ANSWER },
	parameters: {
		docs: {
			description: {
				story:
					"The answer the reader sent back to the agent. Check that the row is labelled with the word the catalogue gives the reader rather than with `human`, and that the gutter falls back to the default tool mark. Pick `AuthoredEvent` for what the companion itself writes. " +
					PLACED_BY_THE_FEED,
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [authored] = slotsIn(canvasElement, "mission-authored-event")

		await expect(authored).toHaveTextContent("You")
		await expect(authored).not.toHaveTextContent("human")
	},
})

export const ClosedByYou = meta.story({
	args: {
		event: {
			id: "event-closed-by-you",
			kind: "dismissed",
			source: "person",
			createdAt: MISSION_NOW - 60_000,
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"The person closed the mission, recorded as `dismissed`, with nothing written into its payload. Check that the machine line reads Closed by you rather than naming the source. Kind `closed` stays the companion's close and names its source. " +
					PLACED_BY_THE_FEED,
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [line] = slotsIn(canvasElement, "mission-machine-line")

		await expect(line).toHaveTextContent(/^Closed by you/)
	},
})

export const EventKinds = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The ten kinds an event can carry, exhaustively, each once as a machine line and once as a bubble. Check that every machine line draws its dot, its wording and its time, that it names the resolved actor except the answer, whose sentence names none, that every bubble carries its kind as a badge, and that only the agent asked badge is tinted. " +
					PLACED_BY_THE_FEED,
			},
		},
	},
	render: (args) => (
		<div className="flex w-[36rem] max-w-full flex-col gap-3">
			{MISSION_EVENT_KINDS.map((kind, rank) => (
				<div className="flex flex-col gap-2" key={kind}>
					<MissionEventRow
						{...args}
						event={{
							id: `event-${kind}`,
							kind,
							source: "bot",
							createdAt:
								MISSION_NOW - (MISSION_EVENT_KINDS.length - rank) * 60_000,
						}}
					/>
					<MissionEventRow
						{...args}
						event={{
							id: `event-${kind}-text`,
							kind,
							source: "bot",
							createdAt:
								MISSION_NOW - (MISSION_EVENT_KINDS.length - rank) * 30_000,
							text: `What the mission recorded when it was ${kind.replace("_", " ")}.`,
						}}
					/>
				</div>
			))}
		</div>
	),
	play: async ({ canvasElement }) => {
		const lines = slotsIn(canvasElement, "mission-machine-line")
		const [answered] = lines.filter((line) =>
			line.textContent?.startsWith("Answer sent"),
		)

		await expect(lines).toHaveLength(MISSION_EVENT_KINDS.length)
		for (const line of lines) {
			await expect(line.firstElementChild).toHaveAttribute(
				"aria-hidden",
				"true",
			)
			await expect(line.textContent?.trim()).not.toBe(
				line.querySelector("time")?.textContent,
			)
			await expect(line.querySelector("time")).toBeVisible()
		}
		await expect(answered).not.toHaveTextContent(MISSION_BOT.name)
		await expect(slotsIn(canvasElement, "mission-authored-event")).toHaveLength(
			MISSION_EVENT_KINDS.length,
		)
	},
})

export const AuthoredEvents = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A note, a question from the agent, an answer from the reader and an escalation, one after the other. Check that the three actors are told apart by their gutter and their label alone, and that the question stands out by its tinted badge rather than by a louder bubble. " +
					PLACED_BY_THE_FEED,
			},
		},
	},
	render: (args) => (
		<div className="flex w-[36rem] max-w-full flex-col gap-2">
			{AUTHORED_MISSION_EVENTS.map((event) => (
				<MissionEventRow {...args} event={event} key={event.id} />
			))}
		</div>
	),
	play: async ({ canvasElement }) => {
		const authored = slotsIn(canvasElement, "mission-authored-event")

		await expect(authored).toHaveLength(AUTHORED_MISSION_EVENTS.length)

		for (const row of authored) {
			await expect(row).not.toHaveTextContent("agent-hook")
		}
	},
})

export const WithoutABot = meta.story({
	args: { bot: undefined, event: AUTHORED_EVENT },
	parameters: {
		docs: {
			description: {
				story:
					"An event of a mission whose companion is not in the roster, the case a thread falls into while its companions are still being read. Check that the row still renders, that the catalogue names the companion in place of a missing name, and that the gutter keeps a drawn avatar rather than a hole. `apps/app/src/components/thread-screen.tsx:1320` passes no bot while the roster of the thread is still being read, and `apps/app/src/components/thread-screen.tsx:923` renders the row all the same.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [authored] = slotsIn(canvasElement, "mission-authored-event")
		const [gutter] = slotsIn(canvasElement, "mission-event-gutter")

		await expect(authored).toHaveTextContent("The agent")
		await expect(gutter).toHaveAttribute("data-gutter", "bot")
	},
})

export const InAMissionThread = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The header and the rows a mission thread is made of, in a container squeezed to 480 pixels. Check that no row is wider than the container, that the bubbles stop at 85 percent of the width left beside the gutter, and that the header bands hold their two lines. Pick this one before shipping any change to either component. `apps/app/src/components/thread-screen.tsx:308` draws the header and `apps/app/src/components/thread-screen.tsx:923` the rows under it.",
			},
		},
	},
	render: (args) => (
		<div className="flex w-[30rem] max-w-full flex-col gap-2">
			<MissionHeader
				bot={MISSION_BOT}
				isWorking={false}
				now={MISSION_NOW}
				objective={MISSION_OBJECTIVE}
				onBack={fn()}
				openedAt={MISSION_OPENED_AT}
				state="waiting_human"
				ticket={MISSION_TICKET}
				tools={MISSION_TOOLS}
			/>
			{MISSION_EVENTS.map((event) => (
				<MissionEventRow {...args} event={event} key={event.id} />
			))}
		</div>
	),
	play: async ({ canvasElement }) => {
		for (const row of slotsIn(canvasElement, "mission-event-row")) {
			await expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth + 1)
		}
	},
})

export const LongContent = meta.story({
	args: {
		bot: { ...MISSION_BOT, name: A_VERY_LONG_BOT_NAME },
		event: {
			id: "event-long-line",
			kind: "note",
			source: "bot",
			createdAt: MISSION_NOW - 60_000,
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"A machine line whose label is a companion name long enough to fill the row, in a container squeezed to 320 pixels. Check that the line stays on exactly one line and truncates rather than pushing the time out of view. Pick `MachineLine` for realistic lengths. " +
					PLACED_BY_THE_FEED,
			},
		},
	},
	render: (args) => (
		<div className="w-80 max-w-full">
			<MissionEventRow {...args} />
		</div>
	),
	play: async ({ canvasElement }) => {
		const line = slotsIn(canvasElement, "mission-machine-line")[0]

		await expect(line).toBeVisible()
		await expect(line?.scrollWidth).toBeLessThanOrEqual(
			(line?.clientWidth ?? 0) + 1,
		)
	},
})

const SHARED_PARAGRAPH =
	"Freeze writes on the legacy workspace first, then run the export against the frozen copy and check the row counts before you touch the target."

const MISSION_EVENT_GUTTER_INDENT = "ps-12"

const SHARED_PARAGRAPH_EVENT: MissionEventModel = {
	id: "event-shared-paragraph",
	kind: "note",
	source: "bot",
	createdAt: MISSION_NOW - 120_000,
	text: SHARED_PARAGRAPH,
}

export const SameCapAsAChatBubble = meta.story({
	tags: ["test-only"],
	args: { event: SHARED_PARAGRAPH_EVENT },
	parameters: {
		docs: {
			description: {
				story:
					"The same paragraph read twice: once as a mission event, once as a chat bubble indented to where the gutter leaves off. Check that the two surfaces stop on the same trailing edge, since a mission event is capped by the bubble alone and by nothing above it. Pick `InAMissionThread` to read a whole thread instead. No mission thread holds a chat bubble beside an event: `apps/app/src/components/thread-screen.tsx:923` is the only row it renders, so the bubble here is the ruler the assertion measures against.",
			},
		},
	},
	render: (args) => (
		<div className="flex w-[30rem] max-w-full flex-col gap-2">
			<MissionEventRow {...args} />
			<MessageBubbleGroup className={MISSION_EVENT_GUTTER_INDENT}>
				<MessageBubble variant="soft">
					<MessageBubbleContent>{SHARED_PARAGRAPH}</MessageBubbleContent>
				</MessageBubble>
			</MessageBubbleGroup>
		</div>
	),
	play: async ({ canvasElement }) => {
		const [missionBubble, chatBubble] = slotsIn(canvasElement, "message-bubble")

		await expect(missionBubble.getBoundingClientRect().width).toBeCloseTo(
			chatBubble.getBoundingClientRect().width,
			0,
		)
	},
})
