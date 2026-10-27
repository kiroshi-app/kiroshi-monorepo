import { useState } from "react"
import { expect, fn, screen, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	botIdentityAvatars,
	companionGlyphOf,
	companionGlyphs,
	companionHueOf,
	expectCompanionPictureShape,
	slotIn,
	slotsIn,
	UPLOADED_AVATAR_IMAGE,
} from "@workspace/storybook/story-utils"
import {
	ActivityIndicator,
	type ActivityIndicatorKind,
} from "@workspace/ui/components/activity-indicator"
import {
	BLOT_HUES,
	BLOT_TINTS,
} from "@workspace/ui/components/companion-colour"
import { MarkProvider } from "@workspace/ui/components/mark-context"
import { TURN_AVATAR_SIZE, UserTurn } from "@workspace/ui/components/turn"
import { Button } from "@workspace/ui/components/ui/button"

const BUSY_BOT = { blot: "blue", seed: "bot-7" } as const

const SECOND = 1000

const startedSecondsAgo = (seconds: number) => Date.now() - seconds * SECOND

const LONG_TOOL_LABEL =
	"Bash · bun run --filter @workspace/ui test:storybook --reporter verbose --coverage --update-snapshots --project chromium --shard 1/4 --retry 2"

const MCP_TOOL_LABEL = "mcp__linear__create_issue"

const EDGE = 8

const PAST_ONE_TICK = 1200

const ROOM_BOTS = [
	{ botId: "bot-lyra", name: "Lyra", blot: "blue" },
	{ botId: "bot-orion", name: "Orion", blot: "orange" },
	{ botId: "bot-vega", name: "Vega", blot: "purple" },
] as const

const [SPEAKING_BOT, ...WAITING_BOTS] = ROOM_BOTS

const stopOrion = fn()

const stopVega = fn()

const SEAT_STOPS: Record<string, typeof stopOrion> = {
	"bot-orion": stopOrion,
	"bot-vega": stopVega,
}

const ROOMS = [
	{
		id: "room-standup",
		bot: ROOM_BOTS[0],
		prompts: ["Where did we land on the mark?"],
	},
	{
		id: "room-release",
		bot: ROOM_BOTS[1],
		prompts: [
			"What is left before the release?",
			"And who is holding the changelog?",
			"Anything blocked on the host?",
		],
	},
] as const

const BOT_WORKING_KINDS: ActivityIndicatorKind[] = [
	"thinking",
	"searching",
	"working",
	"writing",
	"waiting",
]

const RoomWorkers = () => (
	<MarkProvider transcriptKey={ROOMS[0].id}>
		<div className="flex flex-col gap-4">
			<ActivityIndicator
				{...SPEAKING_BOT}
				kind="working"
				seed={SPEAKING_BOT.botId}
				startedAt={startedSecondsAgo(12)}
			/>
			{WAITING_BOTS.map((bot) => (
				<ActivityIndicator
					{...bot}
					key={bot.botId}
					kind="waiting"
					seed={bot.botId}
				/>
			))}
			<ActivityIndicator kind="waiting" name="Unknown" />
		</div>
	</MarkProvider>
)

const ConversationSwap = () => {
	const [isSecond, setIsSecond] = useState(false)
	const room = isSecond ? ROOMS[1] : ROOMS[0]

	return (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<Button
				size="sm"
				variant="outline"
				className="self-start"
				onClick={() => setIsSecond(!isSecond)}
			>
				Open the other conversation
			</Button>
			<MarkProvider transcriptKey={room.id}>
				<div className="flex flex-col gap-4">
					{room.prompts.map((prompt) => (
						<UserTurn key={prompt}>{prompt}</UserTurn>
					))}
					<ActivityIndicator
						{...room.bot}
						kind="thinking"
						seed={room.bot.botId}
					/>
				</div>
			</MarkProvider>
		</div>
	)
}

const meta = preview.meta({
	title: "Feedback/ActivityIndicator",
	component: ActivityIndicator,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"What the transcript shows while the companion is busy: its avatar in the pose that matches the work, the words that say who is busy and at what, and the time the run has taken so far at the end of the row. The label is always on the screen, shimmering while the companion works, so nothing has to be pointed at to be read; a busy row given a `startedAt` instant counts up from it every second, and a row without one shows the label alone. The avatar is also the stop control — given `stoppable`, pointing at it or reaching it by keyboard covers the avatar with a stop glyph, so the composer below stays free for the next prompt. A waiting row carries neither shimmer nor clock: `waitingOn` says whether the companion is waiting for the reader or queued for the next wave. The kind comes from the running tool, so reading turns the avatar to `searching` and a shell command to `working`. Nothing here polls the transport; a screen maps its own state onto `kind` and `label`. Inside a transcript the avatar is the same mark the `AssistantTurn` gutter shows once the turn lands: give both rows the same `botId` and the gutter claims it within that one conversation, appearing there at rest rather than travelling. See `Mark`, `MarkPerBot` for a room where several companions are busy at once, and `ConversationChange` for what a swapped conversation does to them.",
			},
		},
	},
	args: { kind: "thinking", name: "No name" },
	argTypes: {
		kind: { control: "select", options: BOT_WORKING_KINDS },
		waitingOn: { control: "inline-radio", options: ["you", "next"] },
		botId: { control: "text" },
		blot: { control: "select", options: [undefined, ...BLOT_TINTS] },
		seed: { control: "text" },
		size: { control: { type: "range", min: 20, max: 64, step: 2 } },
	},
})

export const Variants = meta.story({
	tags: ["test-only"],
	args: { name: "Atlas" },
	render: (args) => (
		<div className="flex flex-col gap-4">
			{BOT_WORKING_KINDS.map((kind) => (
				<ActivityIndicator
					{...args}
					key={kind}
					kind={kind}
					startedAt={startedSecondsAgo(8)}
				/>
			))}
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Every kind of work, in the order a turn tends to walk through them, each solo and each given the same start instant. Check that all five rows read their words with no pointer anywhere near them, that the four busy kinds shimmer and count while `waiting` does neither, and that every clock sits at the end of its own row. Pick `InWave` for the same rows stacked as one wave.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const labels = slotsIn(canvasElement, "bot-working-label")
		const clocks = slotsIn(canvasElement, "bot-working-elapsed")

		await expect(labels).toHaveLength(BOT_WORKING_KINDS.length)
		for (const label of labels) await expect(label).toBeVisible()

		await expect(clocks).toHaveLength(BOT_WORKING_KINDS.length - 1)
		for (const clock of clocks) await expect(clock).toHaveTextContent(/^\d+s$/)
	},
})

export const InWave = meta.story({
	render: () => (
		<MarkProvider transcriptKey={ROOMS[0].id}>
			<div className="flex w-[420px] flex-col gap-4">
				{ROOM_BOTS.map((bot, index) => (
					<ActivityIndicator
						{...bot}
						key={bot.botId}
						kind="working"
						label={index === 1 ? "Read · src/components/turn.tsx" : undefined}
						seed={bot.botId}
						startedAt={startedSecondsAgo(3 + index * 5)}
					/>
				))}
			</div>
		</MarkProvider>
	),
	parameters: {
		docs: {
			description: {
				story:
					"A wave of three companions working at once, each with a start instant of its own. Check that all three labels are readable with the pointer off the panel, that each row carries exactly one clock and that the three clocks line up on the end edge — the tabular figures are there so a digit rolling over does not move the column. Pick `MarkPerBot` for a wave where only one companion holds the turn.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const clocks = slotsIn(canvasElement, "bot-working-elapsed")
		const ends = clocks.map((clock) =>
			Math.round(clock.getBoundingClientRect().right),
		)

		await expect(clocks).toHaveLength(ROOM_BOTS.length)
		await expect(new Set(ends).size).toBe(1)
		for (const label of slotsIn(canvasElement, "bot-working-label"))
			await expect(label).toBeVisible()
	},
})

export const Blot = meta.story({
	tags: ["test-only"],
	args: { blot: "blue" },
	render: (args) => (
		<div className="flex flex-col gap-4">
			<ActivityIndicator {...args} blot={undefined} />
			{BOT_WORKING_KINDS.map((kind) => (
				<ActivityIndicator {...args} key={kind} kind={kind} />
			))}
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The colour a companion was marked with, held through every kind of work. The first row carries none and draws its glyph on no tile; the rest carry the same colour, untouched by the work. Pick `Branding/BotIdentityAvatar → EveryTint` for the eight colours themselves.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [bare, ...tinted] = botIdentityAvatars(canvasElement)

		await expect(companionHueOf(companionGlyphOf(bare))).toBeUndefined()
		for (const avatar of tinted) {
			await expect(companionHueOf(companionGlyphOf(avatar))).toBe(
				BLOT_HUES.blue,
			)
		}
	},
})

export const WithTool = meta.story({
	args: {
		...BUSY_BOT,
		kind: "working",
		name: "Atlas",
		label: "Bash · npm test",
		startedAt: startedSecondsAgo(8),
	},
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when a tool is running: the label names the step itself rather than a verb, joined to the companion name by the middle dot, and the clock says how long the run has been going. Check that the seconds rise at least once a second and that they read as whole seconds under a minute. Pick `PastAMinute` for the longer form, `WithMcpTool` for a tool served by an MCP server.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const clock = slotIn(canvasElement, "bot-working-elapsed")
		const first = clock.textContent

		await expect(canvas.getByText("Atlas · Bash · npm test")).toBeVisible()
		await expect(clock).toHaveTextContent(/^\d+s$/)
		await waitFor(() => expect(clock.textContent).not.toBe(first), {
			timeout: 2 * SECOND,
		})
	},
})

export const WithMcpTool = meta.story({
	args: {
		...BUSY_BOT,
		kind: "working",
		name: "Atlas",
		label: MCP_TOOL_LABEL,
		startedAt: startedSecondsAgo(4),
	},
	parameters: {
		docs: {
			description: {
				story:
					"A tool served by an MCP server, which the transport names `mcp__server__tool`. Check that the row reads the server and the tool as two parts of the same path rather than the raw token, and that anything else in the label is left exactly as it was given.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByText("Atlas · linear · create_issue"),
		).toBeVisible()
	},
})

export const PastAMinute = meta.story({
	args: {
		...BUSY_BOT,
		kind: "working",
		name: "Atlas",
		label: "Bash · bun test",
	},
	render: (args) => (
		<ActivityIndicator {...args} startedAt={startedSecondsAgo(68)} />
	),
	parameters: {
		docs: {
			description: {
				story:
					"A run that started over a minute before the row was drawn, which is what a reopened conversation shows. Check that the clock reads minutes then two-digit seconds — `1m 08s`, not `68s` and not `1m 8s` — and that it starts from the age of the run rather than from the moment the row mounted.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(
			slotIn(canvasElement, "bot-working-elapsed"),
		).toHaveTextContent(/^1m 0[89]s$/)
	},
})

export const NoStartInstant = meta.story({
	args: { ...BUSY_BOT, kind: "thinking", name: "Atlas" },
	parameters: {
		docs: {
			description: {
				story:
					"A busy row whose host has no start instant to give — a turn picked up from a transport that never reported when it began. Check that the label still reads and still shimmers, and that no clock is drawn rather than one counting from the mount, which would date the row to when the reader opened it.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(canvas.getByText("Atlas is thinking…")).toBeVisible()
		await expect(slotsIn(canvasElement, "bot-working-elapsed")).toHaveLength(0)
	},
})

export const HeldClock = meta.story({
	args: {
		...BUSY_BOT,
		kind: "working",
		name: "Atlas",
		elapsedSeconds: 7,
		startedAt: startedSecondsAgo(42),
	},
	parameters: {
		docs: {
			description: {
				story:
					"A row whose clock is read from `elapsedSeconds` instead of counting on its own, which is what the website scene gives it: a host driving its own timeline hands the seconds it is on rather than the instant the run began. Check that the clock reads `7s` and stays there once a tick has passed, and that `startedAt` is ignored while `elapsedSeconds` is given.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const clock = slotIn(canvasElement, "bot-working-elapsed")

		await expect(clock).toHaveTextContent("7s")
		await new Promise((resolve) => setTimeout(resolve, PAST_ONE_TICK))
		await expect(clock).toHaveTextContent("7s")
	},
})

export const LongContent = meta.story({
	args: {
		...BUSY_BOT,
		kind: "working",
		name: "Atlas",
		label: LONG_TOOL_LABEL,
		startedAt: startedSecondsAgo(42),
	},
	render: (args) => (
		<div className="w-[320px]">
			<ActivityIndicator {...args} />
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"A tool title far wider than the row it sits in, and wider than the window itself, in a 320px column. Check that the label gives way alone — one line, ending in an ellipsis — while the clock stays whole at the end edge, and that hovering the label opens the repo tooltip with the title in full, wrapped over several lines and clear of both window edges. Pick `WithTool` for a title the row can hold.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const label = slotIn(canvasElement, "bot-working-label")
		const clock = slotIn(canvasElement, "bot-working-elapsed")

		await expect(label.scrollWidth).toBeGreaterThan(label.clientWidth)
		await expect(getComputedStyle(label).textOverflow).toBe("ellipsis")
		await expect(clock).toHaveTextContent(/^\d+s$/)
		await expect(clock.scrollWidth).toBe(clock.clientWidth)

		await userEvent.hover(label)
		const tip = await screen.findByRole("tooltip")
		const box = tip.getBoundingClientRect()

		await expect(tip).toHaveTextContent(LONG_TOOL_LABEL)
		await expect(box.left).toBeGreaterThanOrEqual(EDGE)
		await expect(box.right).toBeLessThanOrEqual(window.innerWidth - EDGE)
		await expect(box.height).toBeGreaterThan(
			2 * Number.parseFloat(getComputedStyle(tip).lineHeight),
		)
	},
})

export const WaitingForYou = meta.story({
	args: {
		...BUSY_BOT,
		kind: "waiting",
		name: "Atlas",
		label: "Which wall holds?",
	},
	render: (args) => (
		<div className="flex flex-col gap-4">
			<ActivityIndicator {...args} />
			<ActivityIndicator {...args} label={undefined} />
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The companion has a question or a permission pending and cannot go on without the reader. The first row carries the title of what is being asked, a question ending on its own question mark, the second has none. Check that the ellipsis closes the waiting clause rather than the row, so the title stands last with nothing appended to it and the question mark is the final character; that neither row shimmers and neither carries a clock — nothing is running, so there is nothing to time. Pick `UpNext` for a seat waiting on the wave rather than on the reader.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const titled = canvas.getByText(
			"Atlas is waiting for you… · Which wall holds?",
		)

		await expect(titled).toBeVisible()
		await expect(titled.textContent?.endsWith("?")).toBe(true)
		await expect(canvas.getByText("Atlas is waiting for you…")).toBeVisible()
		await expect(slotsIn(canvasElement, "bot-working-elapsed")).toHaveLength(0)
		await expect(slotsIn(canvasElement, "text-shimmer")).toHaveLength(0)
	},
})

export const UpNext = meta.story({
	args: { ...BUSY_BOT, kind: "waiting", name: "Atlas", waitingOn: "next" },
	parameters: {
		docs: {
			description: {
				story:
					"A seat queued for the next wave: the companion is not working and is not blocked on the reader, it is simply not its turn yet. Check that the row reads `is up next` rather than `is waiting for you`, and that it carries neither shimmer nor clock. The distinction rides on `waitingOn`, not on a sixth kind, so the avatar pose is the same one every waiting seat wears.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(canvas.getByText("Atlas is up next…")).toBeVisible()
		await expect(slotsIn(canvasElement, "bot-working-elapsed")).toHaveLength(0)
	},
})

export const ReducedMotion = meta.story({
	args: {
		...BUSY_BOT,
		kind: "searching",
		name: "Atlas",
		label: "Grep · turn.tsx",
		startedAt: startedSecondsAgo(15),
	},
	parameters: {
		docs: {
			description: {
				story:
					"The row under `prefers-reduced-motion: reduce`, which is how the test browser renders every story here. Check that the label drops its sweep and its gradient for the flat muted colour, that it stays fully readable, and that the clock keeps counting — the elapsed time is the state, not decoration, so it is the one thing that must not stop when motion does.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const shimmer = slotIn(canvasElement, "text-shimmer")
		const clock = slotIn(canvasElement, "bot-working-elapsed")
		const first = clock.textContent

		await expect(getComputedStyle(shimmer).animationName).toBe("none")
		await expect(getComputedStyle(shimmer).backgroundImage).toBe("none")
		await waitFor(() => expect(clock.textContent).not.toBe(first), {
			timeout: 2 * SECOND,
		})
	},
})

export const MarkPerBot = meta.story({
	tags: ["test-only"],
	render: () => <RoomWorkers />,
	parameters: {
		docs: {
			description: {
				story:
					"A room where several companions are busy at once: one is speaking and the others are waiting their turn. Each row is told which companion it draws, so each holds a mark of its own and lands in its own gutter when its answer arrives — one mark shared between them would put every waiting companion on the speaking companion's row. The last row names no companion, which is what a transcript that cannot name the worker gets: a plain slot. Check that every named row carries a different mark and that the unnamed one carries none.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const marks = slotsIn(canvasElement, "shared-mark")
		const named = marks.slice(0, -1).map((mark) => mark.dataset.mark)

		await expect(new Set(named).size).toBe(ROOM_BOTS.length)
		await expect(marks.at(-1)).toHaveAttribute("data-state", "plain")
	},
})

export const ConversationChange = meta.story({
	tags: ["test-only"],
	render: () => <ConversationSwap />,
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the host swaps the conversation under a chat it keeps mounted, which is what a workspace does when the reader opens another room. A mark is named by its companion and its transcript together, so the swap draws a different mark: check that the working row of the second conversation appears where it belongs, at rest, with no avatar gliding across the window from where the first one stood.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const mark = () => slotsIn(canvasElement, "shared-mark")[0]
		const left = mark()
		const leftName = left.getAttribute("data-mark")
		const leftTop = left.getBoundingClientRect().top

		await userEvent.click(
			canvas.getByRole("button", { name: "Open the other conversation" }),
		)

		const opened = mark()

		await expect(opened.getAttribute("data-mark")).not.toBe(leftName)
		await expect(getComputedStyle(opened).transform).toBe("none")
		await expect(opened.getBoundingClientRect().top).not.toBe(leftTop)
	},
})

export const Default = meta.story({
	args: {
		...BUSY_BOT,
		kind: "searching",
		name: "Atlas",
		startedAt: startedSecondsAgo(8),
	},
	parameters: {
		docs: {
			description: {
				story:
					"The nominal busy row: avatar, label and clock, with the pointer nowhere near it. Check that the words are on the screen from the first frame rather than on hover, that they shimmer at the shared working duration, and that the clock reads whole seconds at the end of the row.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const clock = slotIn(canvasElement, "bot-working-elapsed")

		await expect(canvas.getByText("Atlas is searching…")).toBeVisible()
		await expect(clock).toHaveTextContent(/^\d+s$/)
		await expect(getComputedStyle(clock).fontVariantNumeric).toContain(
			"tabular-nums",
		)
	},
})

export const Marked = meta.story({
	tags: ["test-only"],
	args: { ...BUSY_BOT, kind: "searching", name: "Atlas" },
	render: (args) => (
		<div className="flex flex-col gap-4">
			{BOT_WORKING_KINDS.map((kind) => (
				<ActivityIndicator {...args} key={kind} kind={kind} />
			))}
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The companion doing the work, wearing exactly what it wears at rest: its own glyph on its own colour. A run may change the motion and nothing else: a working row that dropped the colour would put a different companion on the screen at the one moment the reader is watching it. Check that the mark is identical across all five kinds and that only the motion differs.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [thinking, ...rest] = companionGlyphs(canvasElement)

		await expect(rest).toHaveLength(BOT_WORKING_KINDS.length - 1)
		for (const glyph of rest) {
			await expect(glyph.getAttribute("aria-label")).toBe(
				thinking.getAttribute("aria-label"),
			)
			await expect(companionHueOf(glyph)).toBe(companionHueOf(thinking))
		}
	},
})

export const Stop = meta.story({
	args: {
		...BUSY_BOT,
		kind: "working",
		name: "Atlas",
		label: "Bash · npm test",
		stoppable: true,
		onStop: fn(),
	},
	render: (args) => (
		<div className="flex flex-col gap-4">
			<ActivityIndicator {...args} />
			<ActivityIndicator {...args} image={UPLOADED_AVATAR_IMAGE} />
			<ActivityIndicator {...args} stoppable={false} />
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Interrupting the run, from the row that is running it: the first two avatars are `stoppable` and become controls, the last is not and stays a drawing. Check that the veil holds to the rounded square of the glyph and of the uploaded picture alike, that it appears the instant the avatar is pointed at with no fade — pointing at the words beside it reveals them and nothing else — that Tab reaches each control and lights the same glyph, and that the last row exposes no button at all.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const [stop, uploaded] = canvas.getAllByRole("button", {
			name: "Stop Atlas",
		})
		const [glyph, uploadedGlyph] = slotsIn(
			canvasElement,
			"bot-working-stop-glyph",
		)
		const label = canvas.getAllByText("Atlas · Bash · npm test")[0]

		await expect(canvas.getAllByRole("button")).toHaveLength(2)
		const [drawn, picture] = botIdentityAvatars(canvasElement)

		await expect(getComputedStyle(glyph).borderRadius).toBe(
			getComputedStyle(drawn).borderRadius,
		)
		await expectCompanionPictureShape(picture)
		await expect(getComputedStyle(uploadedGlyph).borderRadius).toBe(
			getComputedStyle(picture).borderRadius,
		)

		await userEvent.hover(uploaded)
		await waitFor(() => expect(uploadedGlyph).toBeVisible())
		await userEvent.unhover(uploaded)

		stop.blur()
		await userEvent.hover(stop)
		await waitFor(() => expect(glyph).toBeVisible())

		await userEvent.hover(label)
		await waitFor(() => expect(label).toBeVisible())
		await waitFor(() => expect(glyph).not.toBeVisible())

		await userEvent.tab()
		await expect(stop).toHaveFocus()
		await waitFor(() => expect(glyph).toBeVisible())

		await userEvent.click(stop)
		await expect(args.onStop).toHaveBeenCalledTimes(1)
	},
})

export const WaitingSeatStop = meta.story({
	tags: ["test-only"],
	render: () => (
		<MarkProvider transcriptKey={ROOMS[0].id}>
			<div className="flex flex-col gap-4">
				{WAITING_BOTS.map((bot) => (
					<ActivityIndicator
						{...bot}
						key={bot.botId}
						kind="waiting"
						onStop={SEAT_STOPS[bot.botId]}
						seed={bot.botId}
						stoppable
					/>
				))}
			</div>
		</MarkProvider>
	),
	parameters: {
		docs: {
			description: {
				story:
					"A wave seats several companions at once, and each seat carries its own way out: every waiting row is `stoppable`, so the reader stops one companion without ending the wave. Check that each control is named after the companion it holds, that it is the size of the avatar it rides, that Tab reaches it and lights the glyph, and that stopping one leaves the other seat drawn exactly as it was.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		stopOrion.mockClear()
		stopVega.mockClear()

		const orion = canvas.getByRole("button", { name: "Stop Orion" })
		const vega = canvas.getByRole("button", { name: "Stop Vega" })
		const [glyph] = slotsIn(canvasElement, "bot-working-stop-glyph")

		await expect(Math.round(orion.getBoundingClientRect().height)).toBe(
			TURN_AVATAR_SIZE,
		)

		await userEvent.tab()
		await expect(orion).toHaveFocus()
		await waitFor(() => expect(glyph).toBeVisible())

		await userEvent.click(orion)
		await expect(stopOrion).toHaveBeenCalledTimes(1)
		await expect(stopVega).not.toHaveBeenCalled()
		await expect(vega).toBeVisible()
	},
})
