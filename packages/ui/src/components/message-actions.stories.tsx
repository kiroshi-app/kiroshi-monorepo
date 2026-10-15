import type { ReactNode } from "react"
import { expect, fn, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { Icons } from "@workspace/ui/components/icons"
import { Message, MessageContent } from "@workspace/ui/components/message"
import {
	MessageAction,
	MessageActions,
} from "@workspace/ui/components/message-actions"
import {
	MessageBubble,
	MessageBubbleContent,
} from "@workspace/ui/components/message-bubble"
import { ContextMenuItem } from "@workspace/ui/components/ui/context-menu"

const ANSWER =
	"The workspace has two packages: `@workspace/ui` holds the design system, `app` holds the Tauri shell."

const LONG =
	"Walk me through every package in the workspace, starting with the design system, then the Tauri shell, and call out anything that crosses between them in either direction."

const RUN = [
	"Two packages, and the line between them only runs one way.",
	"`@workspace/ui` holds the design system: primitives, tokens and the stories that document them.",
	"`app` holds the Tauri shell and consumes that system.",
]

type FlankedProps = {
	from: "user" | "assistant"
	text: string
	actions?: ReactNode
}

const noop = fn()

const ActionsMenu = () => (
	<ContextMenuItem label="Copy" onClick={noop}>
		<Icons.Copy aria-hidden="true" className="size-3.5" />
		Copy
	</ContextMenuItem>
)

const Flanked = ({ from, text, actions }: FlankedProps) => (
	<Message from={from}>
		<MessageContent>
			<MessageBubble variant={from === "user" ? "solid" : "soft"}>
				<MessageActions
					actions={actions}
					menu={actions ? <ActionsMenu /> : undefined}
				>
					<MessageBubbleContent>{text}</MessageBubbleContent>
				</MessageActions>
			</MessageBubble>
		</MessageContent>
	</Message>
)

const CopyAction = () => (
	<MessageAction label="Copy" onClick={noop}>
		<Icons.Copy />
	</MessageAction>
)

const RetryAction = () => (
	<MessageAction alwaysVisible label="Retry" onClick={noop}>
		<Icons.Retry />
	</MessageAction>
)

const meta = preview.meta({
	title: "Conversation/Message/MessageActions",
	component: MessageActions,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"A bubble's actions, put on the far side of it: right of the companion, left of the reader. It reads the side off `MessageSideContext`, so no caller says which way round it is — the row itself is mirrored on the reader's side, so the first action given is always the one nearest the bubble whichever way round the row runs — and it wraps the bubble body rather than sitting beside it — that is what keeps the row as narrow as the bubble, so the buttons land against the bubble's own edge and never against the transcript's. Their room is held from the first paint: revealing them reflows nothing, and a bubble that runs the full width still leaves them inside the transcript. They fade in whenever the pointer rests anywhere on the line the bubble sits on — the row stays as narrow as the bubble, so widening the reach moves no button — and stay put whenever anything inside the message holds focus, so a keyboard reaches them; under reduced motion they simply appear. Each `MessageAction` decides that for itself: `alwaysVisible` pins the one action a reader must not have to hunt for, and the rest of the row still waits to be pointed at. Hand the row nothing that renders and it collapses, leaving no gap behind. `AI/Turn` composes it with the copy and retry a real transcript offers.",
			},
		},
	},
})

export const Default = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<Flanked from="assistant" text={ANSWER} actions={<CopyAction />} />
			<Flanked from="user" text="How is this workspace laid out?" />
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The companion's side. Hover the bubble and check that the copy button fades in to its right, level with the first line, and that nothing on the row moves as it does. The keyboard path is the same one: the row is faded, never removed, so tabbing reaches the action and it stays lit with its ring in full while it holds focus — which is how the play drives it, since a synthetic pointer never raises a real `:hover`. A bubble handed no actions pays for none: the row below it is the plain bubble it always was. `packages/ui/src/components/turn.tsx:499` hands the row the copy of an answer, and `apps/app/src/components/thread-prompt.tsx:133` is the turn that hands it nothing at all.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const before = canvas.getByText(ANSWER).getBoundingClientRect()
		const copy = canvas.getByRole("button", { name: "Copy" })

		await userEvent.tab()
		await expect(copy).toHaveFocus()
		await waitFor(() => expect(copy).toBeVisible())

		const after = canvas.getByText(ANSWER).getBoundingClientRect()

		await expect(after.left).toBe(before.left)
		await expect(after.width).toBe(before.width)
	},
})

export const Sides = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<Flanked from="assistant" text={ANSWER} actions={<CopyAction />} />
			<Flanked
				from="user"
				text="How is this workspace laid out?"
				actions={<RetryAction />}
			/>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Both speakers at once, neither told which side it is on. Every row reads from the start edge, so the companion's actions and the reader's both sit to the right of their bubble — always on the outside, so they never cover the words and never collide with the gutter the avatar occupies. `AssistantTurn` fills the companion row and `UserTurn` the reader row in `packages/ui/src/components/turn.tsx`, neither saying which side it is on.",
			},
		},
	},
	play: async ({ canvas }) => {
		const edgeOf = (name: string) =>
			canvas.getByRole("button", { name }).getBoundingClientRect()

		await expect(edgeOf("Copy").left).toBeGreaterThan(
			canvas.getByText(ANSWER).getBoundingClientRect().right,
		)
		await expect(edgeOf("Retry").left).toBeGreaterThan(
			canvas
				.getByText("How is this workspace laid out?")
				.getBoundingClientRect().right,
		)
	},
})

export const Pinned = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<Flanked
				from="user"
				text="How is this workspace laid out?"
				actions={
					<>
						<RetryAction />
						<CopyAction />
					</>
				}
			/>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Two actions on one bubble that must not behave alike. The retry is `alwaysVisible` — a prompt that never reached the agent has to show its way out before the reader goes looking — while the copy beside it stays behind a hover like every other. Check that the pinned one sits nearest the bubble, so the faded one never puts a gap between it and the words it acts on — it is given first, so it lands against the bubble on the reader's row as on every other. `packages/ui/src/components/turn.tsx:354` pins the retry of a prompt that failed, ahead of the copy `packages/ui/src/components/turn.tsx:363` adds.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("button", { name: "Retry" })).toBeVisible()
		await expect(canvas.getByRole("button", { name: "Copy" })).not.toBeVisible()

		const retry = canvas.getByRole("button", { name: "Retry" })
		const copy = canvas.getByRole("button", { name: "Copy" })

		await expect(retry.getBoundingClientRect().left).toBeLessThan(
			copy.getBoundingClientRect().left,
		)
	},
})

export const PerBubble = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			{RUN.map((paragraph) => (
				<Flanked
					key={paragraph}
					from="assistant"
					text={paragraph}
					actions={<CopyAction />}
				/>
			))}
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"An answer that arrived in three parts, one bubble each. Every bubble carries its own copy and copies only the paragraph it shows — there is no action anywhere for the answer entire, because the reader points at the part they want. The hover zone is the whole line the bubble sits on, not the bubble alone, so the reader reaches an action without landing on the words first — the reveal is keyed off the line rather than off the row of buttons, which the play reads back since a synthetic pointer never raises a real `:hover`. Check that it lights that line's action alone and leaves its neighbours faded. An answer split into blocks by `apps/app/src/lib/chat/screen-model.ts:97` gives each bubble its own row through `packages/ui/src/components/turn.tsx:499`.",
			},
		},
	},
	play: async ({ canvas }) => {
		const copies = canvas.getAllByRole("button", { name: "Copy" })

		await expect(copies).toHaveLength(RUN.length)

		const line = canvas.getAllByLabelText("assistant message")[0]

		await expect(line).toHaveClass(/group\/message/)
		await expect(copies[0]).toHaveClass("group-hover/message:opacity-100")
		await expect(copies[0].closest("[data-slot='message']")).toBe(line)
		await expect(line.getBoundingClientRect().width).toBeGreaterThan(
			canvas.getByText(RUN[0]).getBoundingClientRect().width,
		)
		await expect(copies[0]).not.toBeVisible()
	},
})

export const LongContent = meta.story({
	render: () => (
		<div className="mx-auto flex max-w-sm flex-col gap-6">
			<Flanked from="user" text={LONG} actions={<RetryAction />} />
			<Flanked from="assistant" text={LONG} actions={<CopyAction />} />
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The narrow case both sides have to survive: a bubble long enough to claim every pixel it is offered. Check that both action rows stay inside the column rather than hanging off it or being clipped away, and that the transcript never gains a sideways scrollbar — the room for them is taken out of the bubble's width once, not conjured on hover. Same rows as `packages/ui/src/components/turn.tsx:341` and `packages/ui/src/components/turn.tsx:499` build, in the narrowest column the app runs in.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const bounds = canvasElement.getBoundingClientRect()

		for (const name of ["Copy", "Retry"]) {
			const action = canvas
				.getByRole("button", { name })
				.getBoundingClientRect()
			await expect(action.left).toBeGreaterThanOrEqual(bounds.left)
			await expect(action.right).toBeLessThanOrEqual(bounds.right)
		}
	},
})
