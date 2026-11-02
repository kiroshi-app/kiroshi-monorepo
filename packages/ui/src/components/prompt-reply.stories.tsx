import { useState } from "react"
import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { PromptAttachButton } from "@workspace/ui/components/prompt-attach-button"
import { PromptInput } from "@workspace/ui/components/prompt-input"
import { PromptReply } from "@workspace/ui/components/prompt-reply"

const AUTHOR = "Skippy"

const EXCERPT =
	"The whole migration runs inside one transaction, so a failure rolls back every statement including the drop."

const PROMPT = "Then what happens to the invites table?"

const jump = fn()

const Composer = () => (
	<PromptInput
		aria-label="Message"
		defaultValue={PROMPT}
		leading={<PromptAttachButton onAttach={fn()} />}
	/>
)

const ReplyingComposer = () => {
	const [isReplying, setIsReplying] = useState(true)

	return (
		<PromptReply
			quote={
				isReplying
					? {
							author: AUTHOR,
							excerpt: EXCERPT,
							from: "assistant",
							onJump: jump,
							onDismiss: () => setIsReplying(false),
						}
					: undefined
			}
		>
			<Composer />
		</PromptReply>
	)
}

const NamingComposer = () => {
	const [isReplying, setIsReplying] = useState(false)

	return (
		<>
			<button
				type="button"
				onMouseDown={(event) => event.preventDefault()}
				onClick={() => setIsReplying(!isReplying)}
			>
				Toggle reply
			</button>
			<PromptReply
				quote={
					isReplying
						? {
								author: AUTHOR,
								excerpt: EXCERPT,
								from: "assistant",
								onJump: jump,
								onDismiss: () => setIsReplying(false),
							}
						: undefined
				}
			>
				<Composer />
			</PromptReply>
		</>
	)
}

const meta = preview.meta({
	title: "Conversation/Prompt/PromptReply",
	component: PromptReply,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The frame the composer wears while the next prompt answers one message: it wraps the composer rather than sitting inside it, so the quoted message reads above the pill and the two are one block. It holds the reply glyph, the quoted author with the first line of what they wrote, and the one control that takes the reply back. Its corner is the composer's own plus the padding around it, so the two curves stay concentric whether the composer is a pill or has grown into its expanded shape. It draws only — the host holds which message is being answered, writes the excerpt, moves the transcript when the quote is pressed and drops the frame when the cross is. `AI/MessageQuote` is the frame underneath it, `AI/Turn → Quoted` is the same frame around a bubble.",
			},
		},
	},
	args: {
		quote: {
			author: AUTHOR,
			excerpt: EXCERPT,
			from: "assistant" as const,
			onJump: fn(),
			onDismiss: fn(),
		},
		children: <Composer />,
	},
	decorators: [
		(Story) => (
			<div className="w-[34rem] max-w-full">
				<Story />
			</div>
		),
	],
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The nominal frame. Check that the quote sits above the composer and that the frame encloses it on its secondary fill instead of the strip living inside the pill, that the excerpt keeps to one line however long the quoted message is, and that the two controls report different things: pressing the quote asks for a jump, pressing the cross asks for the reply to be dropped. Neither does anything to the composer on its own — the group reads `Replying to Skippy` for a screen reader. `packages/ui/src/components/thread-layout.tsx:107` wraps the composer in it with the reply `apps/app/src/components/thread-screen.tsx:1428` holds.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const frame = canvas.getByRole("group", { name: `Replying to ${AUTHOR}` })
		const composer = canvas.getByRole("textbox", { name: "Message" })

		await expect(frame).toContainElement(composer)
		await expect(
			canvas.getByText(EXCERPT).getBoundingClientRect().bottom,
		).toBeLessThanOrEqual(composer.getBoundingClientRect().top)

		await userEvent.click(canvas.getByRole("button", { name: /Skippy/ }))
		await expect(args.quote?.onJump).toHaveBeenCalledTimes(1)

		await userEvent.click(canvas.getByRole("button", { name: "Cancel reply" }))
		await expect(args.quote?.onDismiss).toHaveBeenCalledTimes(1)
	},
})

export const Alignment = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The gutters the frame shares with the composer it wraps. The reply glyph sits in the box the attach button sits in and the cross sits in the box the send button sits in, both 32px holding a 16px glyph, so the two rows read as one column of controls; the author and the excerpt start where the placeholder starts. Eight pixels sit above the quote and eight between it and the pill, the same air the composer keeps around its own row. Check the four edges line up and that the quote still costs two clipped lines whatever it holds. `packages/ui/src/components/thread-layout.tsx:107` wraps the composer in it with the reply `apps/app/src/components/thread-screen.tsx:1428` holds.",
			},
		},
	},
	play: async ({ canvas }) => {
		const frame = canvas.getByRole("group")
		const textarea = canvas.getByRole("textbox", { name: "Message" })
		const glyph = frame.querySelector("span")?.getBoundingClientRect()
		const quote = canvas
			.getByRole("button", { name: /Skippy/ })
			.getBoundingClientRect()
		const dismiss = canvas
			.getByRole("button", { name: "Cancel reply" })
			.getBoundingClientRect()
		const attach = canvas
			.getByRole("button", { name: "Attach files" })
			.getBoundingClientRect()
		const send = canvas
			.getByRole("button", { name: "Send" })
			.getBoundingClientRect()
		const composer = textarea
			.closest('[data-slot="prompt-input"]')
			?.getBoundingClientRect()
		const placeholderLeft =
			textarea.getBoundingClientRect().left +
			Number.parseFloat(getComputedStyle(textarea).paddingLeft)

		await expect(glyph?.width).toBe(32)
		await expect(glyph?.height).toBe(32)
		await expect(glyph?.left).toBeCloseTo(attach.left, 1)
		await expect(dismiss.width).toBe(32)
		await expect(dismiss.right).toBeCloseTo(send.right, 1)
		await expect(quote.left).toBeCloseTo(placeholderLeft, 1)
		await expect(quote.top - frame.getBoundingClientRect().top).toBeCloseTo(
			12,
			1,
		)
		await expect((composer?.top ?? 0) - quote.bottom).toBeCloseTo(12, 1)
	},
})

export const Dismissed = meta.story({
	render: () => <ReplyingComposer />,
	parameters: {
		docs: {
			description: {
				story:
					"Taking the reply back, live: the host stops rendering the frame and the composer is left alone. Check that the prompt already typed survives the frame going away and that the composer keeps its own shape once unwrapped — the frame owns no state of the composer. `packages/ui/src/components/thread-layout.tsx:107` wraps the composer in it with the reply `apps/app/src/components/thread-screen.tsx:1428` holds.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await expect(canvas.getByRole("group")).toBeVisible()

		await userEvent.click(canvas.getByRole("button", { name: "Cancel reply" }))
		await expect(canvas.queryByRole("group")).not.toBeInTheDocument()
		await expect(canvas.getByRole("textbox", { name: "Message" })).toHaveValue(
			PROMPT,
		)
	},
})

export const Naming = meta.story({
	render: () => <NamingComposer />,
	parameters: {
		docs: {
			description: {
				story:
					"The frame arriving and leaving around a composer the reader is already using. The frame is always mounted and only its quote comes and goes, so the textarea is never rebuilt: check that what was typed survives the quote appearing and the cross taking it away, that the composer keeps the focus it held while the quote arrives, and that it carries no frame of its own while nothing is quoted. Where the focus lands once the cross removes itself is the host's to say, not the frame's. `packages/ui/src/components/thread-layout.tsx:107` wraps the composer in it with the reply `apps/app/src/components/thread-screen.tsx:1428` holds.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const textarea = canvas.getByRole("textbox", { name: "Message" })

		await userEvent.click(textarea)
		await userEvent.type(textarea, " Twice?")
		await expect(canvas.queryByRole("group")).not.toBeInTheDocument()

		const toggle = canvas.getByRole("button", { name: "Toggle reply" })

		await userEvent.click(toggle)
		await expect(canvas.getByRole("group")).toBeVisible()
		await expect(canvas.getByRole("textbox", { name: "Message" })).toBe(
			textarea,
		)
		await expect(textarea).toHaveFocus()

		await userEvent.click(canvas.getByRole("button", { name: "Cancel reply" }))
		await expect(canvas.queryByRole("group")).not.toBeInTheDocument()
		await expect(canvas.getByRole("textbox", { name: "Message" })).toBe(
			textarea,
		)
		await expect(textarea).toHaveValue(`${PROMPT} Twice?`)
	},
})
