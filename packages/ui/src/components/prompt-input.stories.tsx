import { type ComponentProps, useState } from "react"
import { expect, fn, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	expectFieldFrame,
	expectFocusRing,
	expectInverseAtRest,
	isInBrowserRunner,
	realPointer,
	tokenStyleIn,
} from "@workspace/storybook/story-utils"
import { Icons } from "@workspace/ui/components/icons"
import { PromptAttachButton } from "@workspace/ui/components/prompt-attach-button"
import { PromptAttachments } from "@workspace/ui/components/prompt-attachments"
import {
	DROPPED_PROMPT_FILE,
	PASTED_PROMPT_FILE,
	PROMPT_ATTACHMENTS,
} from "@workspace/ui/components/prompt-attachments.fixtures"
import { PromptInput } from "@workspace/ui/components/prompt-input"
import { Button } from "@workspace/ui/components/ui/button"

type ComposerProps = ComponentProps<typeof PromptInput>

const Composer = ({
	value: seed = "",
	onValueChange,
	onSubmit,
	...props
}: ComposerProps) => {
	const [value, setValue] = useState(seed)

	return (
		<PromptInput
			{...props}
			onSubmit={(text) => {
				setValue("")
				onSubmit?.(text)
			}}
			onValueChange={(next) => {
				setValue(next)
				onValueChange?.(next)
			}}
			value={value}
		/>
	)
}

const MAX_ROWS = 8

const DRAFT = "Summarise the release notes for v0.1"

const FILLING_DRAFT =
	"Summarise the release notes and flag every public export that has moved"

const WRAPPED_DRAFT =
	"Summarise the release notes for v0.1 and tell me which entries changed a public export"

const leadingControls = (
	<Button type="button" variant="ghost" size="icon" aria-label="Add context">
		<Icons.Add />
	</Button>
)

const attachControl = <PromptAttachButton onAttach={fn()} />

const stagedFiles = (
	<PromptAttachments items={PROMPT_ATTACHMENTS} onRemove={fn()} />
)

const formOf = (element: HTMLElement) =>
	element.closest("form") as HTMLFormElement

const filesTransfer = (files: File[]) => {
	const transfer = new DataTransfer()
	for (const file of files) transfer.items.add(file)
	return transfer
}

const textTransfer = (text: string) => {
	const transfer = new DataTransfer()
	transfer.setData("text/plain", text)
	return transfer
}

const drag = (
	kind: "dragover" | "dragleave" | "dragend" | "drop",
	target: HTMLElement,
	init: DragEventInit = {},
) =>
	!target.dispatchEvent(
		new DragEvent(kind, { bubbles: true, cancelable: true, ...init }),
	)

const pasteInto = (target: HTMLElement, clipboardData: DataTransfer) =>
	!target.dispatchEvent(
		new ClipboardEvent("paste", {
			bubbles: true,
			cancelable: true,
			clipboardData,
		}),
	)

const draggingFile = () => ({
	dataTransfer: filesTransfer([DROPPED_PROMPT_FILE]),
})

const named = (file: File) => [expect.objectContaining({ name: file.name })]

const isExpanded = (element: HTMLElement) =>
	formOf(element).dataset.expanded === "true"

const box = (element: HTMLElement) => element.getBoundingClientRect()

const isBefore = (element: HTMLElement, next: HTMLElement) =>
	box(element).right <= box(next).left

const isBelow = (element: HTMLElement, previous: HTMLElement) =>
	box(element).top >= box(previous).bottom

const rowsOf = (textarea: HTMLElement) =>
	Math.round(
		textarea.scrollHeight /
			Number.parseFloat(getComputedStyle(textarea).lineHeight),
	)

const LONG_DRAFT = [
	"Review the release branch and write the changelog for v0.1.",
	"",
	"Cover the desktop shell, the design foundations and the chat surface.",
	"Group the entries by package, newest first, and keep each line under",
	"twelve words so the notes stay scannable in the terminal.",
	"",
	"Flag anything that changes a public export, then list the follow-ups",
	"we deliberately left out of this milestone.",
	"",
	"Name the packages that gained a public surface, and say in one line",
	"what a reader of the notes is expected to do with each entry.",
].join("\n")

const MOUNTED_BY_THE_COMPOSER =
	"`apps/app/src/components/thread-composer.tsx:117` mounts the composer of every thread, holding the draft it passes back through `value`."

const meta = preview.meta({
	title: "Conversation/Prompt/PromptInput",
	component: PromptInput,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The composer for a prompt: write it and send it, whatever the session is doing. At rest it is a one-line pill — the `leading` slot, the prompt, then the send button, all on the same row. The moment the prompt no longer fits beside them the bar expands: the prompt takes a row of its own and the controls drop below it, `leading` on the leading edge, send at the far end. Enter sends and Shift+Enter breaks a line in both layouts. It knows nothing about a running turn: a prompt written mid-run is sent like any other and waits in the transcript as a pending `UserTurn`, and stopping the run belongs to the working companion's avatar in `Feedback/ActivityIndicator`.",
			},
		},
	},
	args: {
		onSubmit: fn(),
		onValueChange: fn(),
		onAttach: fn(),
	},
	argTypes: {
		disabled: { control: "boolean" },
		placeholder: { control: "text" },
	},
	decorators: [
		(Story) => (
			<div className="w-[34rem] max-w-full">
				<Story />
			</div>
		),
	],
	render: (args) => <Composer {...args} />,
})

export const Playground = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The knob story, and the keyboard contract in one pass: typing, Shift+Enter for a second line, Enter to send. Check that Shift+Enter never fires `onSubmit`, that Enter sends the trimmed value, that the bar expands on the second line and folds back into a pill once the field is cleared, and that the host clearing its draft after a send empties the field. `apps/app/src/components/thread-composer.tsx:117` holds the draft and clears it once a prompt was sent, which is what this story reproduces.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const textarea = canvas.getByRole("textbox", { name: "Message" })

		await userEvent.click(textarea)
		await userEvent.type(textarea, "Draft the changelog")

		await expect(isExpanded(textarea)).toBe(false)

		await userEvent.keyboard("{Shift>}{Enter}{/Shift}")
		await userEvent.type(textarea, "for v0.1")

		await expect(textarea).toHaveValue("Draft the changelog\nfor v0.1")
		await expect(isExpanded(textarea)).toBe(true)
		await expect(args.onSubmit).not.toHaveBeenCalled()

		await userEvent.keyboard("{Enter}")

		await expect(args.onSubmit).toHaveBeenCalledWith(
			"Draft the changelog\nfor v0.1",
		)
		await expect(textarea).toHaveValue("")
		await expect(isExpanded(textarea)).toBe(false)
	},
})

export const Default = meta.story({
	args: { value: DRAFT },
	parameters: {
		docs: {
			description: {
				story:
					"The nominal case: a draft short enough to sit beside the send button, so the composer stays the one-line pill it is at rest. This is the story to open when reviewing the focus ring, the fully rounded container and the enabled send button. Check that the ring reads on the whole composer rather than on the textarea alone, that prompt and button share a row, and that Enter sends without a click. `LongContent` covers the same input once the prompt wraps. " +
					MOUNTED_BY_THE_COMPOSER,
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const textarea = canvas.getByRole("textbox", { name: "Message" })
		const send = canvas.getByRole("button", { name: "Send" })

		await expect(formOf(textarea)).not.toHaveAttribute("aria-label")
		await expect(canvas.queryByRole("status")).toBeNull()

		await userEvent.click(textarea)
		await expect(textarea).toHaveFocus()
		await expect(send).toBeEnabled()
		await expect(isExpanded(textarea)).toBe(false)
		await expect(box(send).top).toBeLessThan(box(textarea).bottom)

		await userEvent.keyboard("{Enter}")

		await expect(args.onSubmit).toHaveBeenCalledWith(DRAFT)
		await expect(textarea).toHaveValue("")
	},
})

export const WithControls = meta.story({
	args: { value: DRAFT, leading: leadingControls },
	parameters: {
		docs: {
			description: {
				story:
					"The `leading` slot filled while the pill is still one line: it opens the pill before the text, send closes it. Reach for it when adding a control to the composer — it is the layout that runs out of room first. Check that `leading` reads on the leading edge rather than beside the send button, that send holds the far end with the prompt taking the width left between them, and that filling the slot shortens the prompt's single line rather than wrapping the bar early. `LongContent` shows where the same control lands once the prompt wraps. " +
					MOUNTED_BY_THE_COMPOSER,
			},
		},
	},
	play: async ({ canvas }) => {
		const textarea = canvas.getByRole("textbox", { name: "Message" })
		const addContext = canvas.getByRole("button", { name: "Add context" })
		const send = canvas.getByRole("button", { name: "Send" })

		await expect(isExpanded(textarea)).toBe(false)
		await expect(isBefore(addContext, textarea)).toBe(true)
		await expect(isBefore(textarea, send)).toBe(true)
	},
})

export const FullWidthLine = meta.story({
	args: { value: FILLING_DRAFT, leading: leadingControls },
	parameters: {
		docs: {
			description: {
				story:
					"The hinge between the two layouts: a single line too wide to share its row with the controls, but short enough to still read as one line once it owns the full width. This is where the composer used to strand `leading` at the far end of the text. Check that the prompt keeps a single row across the whole width, that `leading` has dropped to the control row on the leading edge rather than staying beside the prompt, and that send holds the far end of that same row. `WithControls` is the last state that still fits on one row, `LongContent` the first that wraps the prompt itself. " +
					MOUNTED_BY_THE_COMPOSER,
			},
		},
	},
	play: async ({ canvas }) => {
		const textarea = canvas.getByRole("textbox", { name: "Message" })
		const addContext = canvas.getByRole("button", { name: "Add context" })
		const send = canvas.getByRole("button", { name: "Send" })

		await expect(isExpanded(textarea)).toBe(true)
		await expect(rowsOf(textarea)).toBe(1)
		await expect(isBelow(addContext, textarea)).toBe(true)
		await expect(box(addContext).left).toBeLessThanOrEqual(box(textarea).left)
		await expect(isBefore(addContext, send)).toBe(true)
		await expect(box(send).right).toBeCloseTo(box(textarea).right, 0)
	},
})

export const LongContent = meta.story({
	args: { value: WRAPPED_DRAFT, leading: leadingControls },
	parameters: {
		docs: {
			description: {
				story:
					"A prompt long enough to wrap, so the bar has expanded: the textarea owns the top row and the control row sits under it, `leading` on the leading edge, send at the far end. Check that the corner radius is the one the pill already had rather than a second value, that `leading` holds the same leading edge it had in the pill, that the prompt now uses the full width, and that deleting back to a short prompt folds it into `Default` again. `FullWidthLine` is the same layout one line earlier, `Overflow` pushes it past the row cap. " +
					MOUNTED_BY_THE_COMPOSER,
			},
		},
	},
	play: async ({ canvas }) => {
		const textarea = canvas.getByRole("textbox", { name: "Message" })
		const send = canvas.getByRole("button", { name: "Send" })
		const addContext = canvas.getByRole("button", { name: "Add context" })

		await expect(isExpanded(textarea)).toBe(true)
		await expect(isBelow(addContext, textarea)).toBe(true)
		await expect(isBelow(send, textarea)).toBe(true)
		await expect(box(addContext).left).toBeLessThanOrEqual(box(textarea).left)
		await expect(isBefore(addContext, send)).toBe(true)
	},
})

export const Empty = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Nothing typed yet — the resting state of a new turn, and the narrowest the composer ever gets. Check that the placeholder stays readable against the surface and that the send button stays enabled while pressing it does nothing: no call to `onSubmit`, no error, since there is neither a prompt nor a staged file to send yet and a blank value must never reach `onSubmit` on its own. `Default` covers the same input once a draft exists, `FilesOnly` once a chip alone carries the turn. " +
					MOUNTED_BY_THE_COMPOSER,
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const send = canvas.getByRole("button", { name: "Send" })
		await expect(send).toBeEnabled()

		await userEvent.click(send)
		await expect(args.onSubmit).not.toHaveBeenCalled()
		await expect(canvas.queryByRole("alert")).toBeNull()
		await expect(
			isExpanded(canvas.getByRole("textbox", { name: "Message" })),
		).toBe(false)
	},
})

export const States = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Every state of the composer stacked, idle to disabled. Reach for it when changing the border, ring or opacity tokens: the second instance is focused by the play function, so the focus ring can be compared against the resting border without touching the canvas. Check that disabled dims the whole composer, blocks the textarea and takes its `leading` control and its staged chips out of reach of both pointer and Tab, and that the send button stays enabled on the idle instance and disabled only on the disabled one. " +
					MOUNTED_BY_THE_COMPOSER,
			},
		},
	},
	render: (args) => (
		<div className="flex flex-col gap-4">
			<Composer {...args} aria-label="Idle prompt" />
			<Composer {...args} aria-label="Focused prompt" value={DRAFT} />
			<Composer
				{...args}
				aria-label="Disabled prompt"
				attachments={stagedFiles}
				disabled
				leading={leadingControls}
				value={DRAFT}
			/>
		</div>
	),
	play: async ({ canvas, userEvent }) => {
		const focused = canvas.getByRole("textbox", { name: "Focused prompt" })

		await userEvent.click(focused)
		await expect(focused).toHaveFocus()
		await expect(
			canvas.getByRole("textbox", { name: "Disabled prompt" }),
		).toBeDisabled()
		const sends = canvas.getAllByRole("button", { name: "Send" })
		await expect(sends).toHaveLength(3)
		await expect(sends[0]).toBeEnabled()
		await expect(sends[2]).toBeDisabled()

		const addContext = canvas.getByRole("button", { name: "Add context" })
		const remove = canvas.getByRole("button", {
			name: `Remove ${PROMPT_ATTACHMENTS[0].name}`,
		})

		addContext.focus()
		await expect(addContext).not.toHaveFocus()

		remove.focus()
		await expect(remove).not.toHaveFocus()
	},
})

const SEND_SELECTOR = 'button[aria-label="Send"]'

const INVERSE_SEND =
	"The send button in the inverse treatment of artboards V1e and V1f, light and dark side by side: filled with the `foreground` token, its arrow drawn with the `background` token, so it reads ink on white in light and white on ink in dark. "

const sendsIn = (canvasElement: HTMLElement) => [
	...canvasElement.querySelectorAll<HTMLButtonElement>(SEND_SELECTOR),
]

export const SendIdle = meta.story({
	globals: { theme_layout: "side-by-side" },
	parameters: {
		docs: { description: { story: `${INVERSE_SEND}At rest.` } },
	},
	play: async ({ canvasElement }) => {
		const sends = sendsIn(canvasElement)
		await expect(sends.length).toBe(2)
		for (const send of sends) await expectInverseAtRest(send)
	},
})

export const SendHover = meta.story({
	globals: { theme_layout: "side-by-side" },
	parameters: {
		pseudo: { hover: SEND_SELECTOR },
		docs: {
			description: {
				story: `${INVERSE_SEND}Under the pointer, which the play drives only in the Vitest browser runner, the fill moves a fifth of the way toward the \`background\` token, a solid colour, so the arrow keeps its contrast.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		if (!isInBrowserRunner()) return
		const pointer = await realPointer()
		for (const send of sendsIn(canvasElement)) {
			const rest = tokenStyleIn(send, "bg-foreground", "backgroundColor")
			await pointer.hover(send)
			await waitFor(() => expect(send.matches(":hover")).toBe(true))
			await waitFor(() =>
				expect(getComputedStyle(send).backgroundColor).not.toBe(rest),
			)
			await expect(getComputedStyle(send).color).toBe(
				tokenStyleIn(send, "text-background", "color"),
			)
			await pointer.unhover(send)
		}
	},
})

export const SendFocusVisible = meta.story({
	globals: { theme_layout: "side-by-side" },
	parameters: {
		pseudo: { focusVisible: SEND_SELECTOR },
		docs: {
			description: {
				story: `${INVERSE_SEND}Keyboard focus draws the primitive's own ring: the \`ring\` border on the fill and the translucent halo around it.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		for (const send of sendsIn(canvasElement)) {
			const ring = tokenStyleIn(send, "border-ring", "borderTopColor")
			send.focus()
			await expect(send.matches(":focus-visible")).toBe(true)
			await waitFor(() =>
				expect(getComputedStyle(send).borderTopColor).toBe(ring),
			)
			await expect(getComputedStyle(send).backgroundColor).toBe(
				tokenStyleIn(send, "bg-foreground", "backgroundColor"),
			)
		}
	},
})

export const SendDisabled = meta.story({
	globals: { theme_layout: "side-by-side" },
	args: { disabled: true, value: DRAFT },
	parameters: {
		docs: {
			description: {
				story: `${INVERSE_SEND}Disabled, the primitive halves the opacity of the whole button, fill and arrow together, so the arrow stays apart from its fill.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		for (const send of sendsIn(canvasElement)) {
			await expect(send).toBeDisabled()
			await expect(getComputedStyle(send).opacity).toBe("0.5")
			await expectInverseAtRest(send)
		}
	},
})

export const Overflow = meta.story({
	args: { value: LONG_DRAFT, leading: leadingControls },
	parameters: {
		docs: {
			description: {
				story:
					"A multi-paragraph prompt past the eighth row, the far end of the expanded layout. Check that the field grows line by line up to the cap and then scrolls instead of pushing the control row off screen, and that caret and last typed line stay visible while typing. `LongContent` covers the prompt that only just wraps. " +
					MOUNTED_BY_THE_COMPOSER,
			},
		},
	},
	play: async ({ canvas }) => {
		const textarea = canvas.getByRole("textbox", { name: "Message" })
		const send = canvas.getByRole("button", { name: "Send" })
		const form = formOf(textarea)

		await expect(isExpanded(textarea)).toBe(true)
		await expect(rowsOf(textarea)).toBeGreaterThan(MAX_ROWS)
		await expect(textarea.scrollHeight).toBeGreaterThan(textarea.clientHeight)
		await expect(isBelow(send, textarea)).toBe(true)
		await expect(box(send).bottom).toBeLessThanOrEqual(box(form).bottom)

		textarea.scrollTop = textarea.scrollHeight
		await expect(textarea.scrollTop + textarea.clientHeight).toBe(
			textarea.scrollHeight,
		)
	},
})

export const WithAttachments = meta.story({
	args: {
		value: DRAFT,
		leading: attachControl,
		attachments: stagedFiles,
	},
	parameters: {
		docs: {
			description: {
				story:
					"Files staged for the turn: the chips take the top of the composer, inside the same container as the text, and the composer holds its expanded shape whatever the prompt is worth. This is also the story for the two silent ways in — a drop on the composer and a paste into the textarea both report their files to `onAttach` and suppress the browser's own handling, while a drop carrying no file and a paste carrying text are handed straight back to it. Check that the row never overlaps the text, that dropping is suppressed rather than opening the file in a new tab, and that the composer folds back to the pill once the last chip is taken back — `PromptAttachments → InComposer` does the removing. " +
					MOUNTED_BY_THE_COMPOSER,
			},
		},
	},
	play: async ({ args, canvas }) => {
		const textarea = canvas.getByRole("textbox", { name: "Message" })
		const form = formOf(textarea)
		const chip = canvas.getAllByRole("listitem")[0]

		await expect(isExpanded(textarea)).toBe(true)
		await expect(box(chip).bottom).toBeLessThanOrEqual(box(textarea).top)

		await expect(drag("drop", form, draggingFile())).toBe(true)
		await expect(pasteInto(textarea, filesTransfer([PASTED_PROMPT_FILE]))).toBe(
			true,
		)
		await expect(args.onAttach).toHaveBeenCalledWith(named(DROPPED_PROMPT_FILE))
		await expect(args.onAttach).toHaveBeenCalledWith(named(PASTED_PROMPT_FILE))

		await expect(drag("drop", form, { dataTransfer: new DataTransfer() })).toBe(
			false,
		)
		await expect(pasteInto(textarea, textTransfer("plain words"))).toBe(false)
		await expect(args.onAttach).toHaveBeenCalledTimes(2)
	},
})

export const DragOver = meta.story({
	args: { value: DRAFT, leading: attachControl },
	parameters: {
		docs: {
			description: {
				story:
					"A file is being dragged over the composer and has not been let go yet. Check that the whole composer takes the highlight — border and surface together, so the target reads as one place to drop — that the highlight survives the drag crossing the textarea and the buttons inside it, and that it clears the moment the pointer leaves the composer or the drag ends over it, whether or not the composer went disabled midway. Reach for it when tuning the drop tokens; `WithAttachments` covers what the drop itself does. " +
					MOUNTED_BY_THE_COMPOSER,
			},
		},
	},
	play: async ({ canvas }) => {
		const textarea = canvas.getByRole("textbox", { name: "Message" })
		const form = formOf(textarea)

		await expect(drag("dragover", form, draggingFile())).toBe(true)
		await waitFor(() => expect(form.dataset.dropTarget).toBe("true"))

		drag("dragleave", form, { relatedTarget: textarea })
		await expect(form.dataset.dropTarget).toBe("true")

		drag("dragleave", form, { relatedTarget: document.body })
		await waitFor(() => expect(form.dataset.dropTarget).toBe("false"))

		drag("dragover", form, draggingFile())
		await waitFor(() => expect(form.dataset.dropTarget).toBe("true"))

		drag("dragend", form)
		await waitFor(() => expect(form.dataset.dropTarget).toBe("false"))
	},
})

export const MarkedFromOutside = meta.story({
	args: { value: DRAFT, leading: attachControl, dropTarget: true },
	parameters: {
		docs: {
			description: {
				story:
					"The same highlight, asked for by the host rather than by the composer's own drag events — a file dragged anywhere over the surface around it lights the composer up as the place to drop. Check that the mark is the one `DragOver` produces, and that a drag crossing the composer and leaving it again cannot take it away while the host still asks for it. The second instance is disabled: a composer that has nowhere to put the file stays unmarked whatever the host asks, so nothing invites a drop the browser would end up opening itself. " +
					MOUNTED_BY_THE_COMPOSER,
			},
		},
	},
	render: (args) => (
		<div className="flex flex-col gap-4">
			<Composer {...args} aria-label="Message" />
			<Composer {...args} aria-label="Disabled prompt" disabled />
		</div>
	),
	play: async ({ canvas }) => {
		const form = formOf(canvas.getByRole("textbox", { name: "Message" }))
		const disabled = formOf(
			canvas.getByRole("textbox", { name: "Disabled prompt" }),
		)

		await expect(form.dataset.dropTarget).toBe("true")
		await expect(disabled.dataset.dropTarget).toBe("false")

		drag("dragover", form, draggingFile())
		drag("dragleave", form, { relatedTarget: document.body })
		drag("dragend", form)
		await expect(form.dataset.dropTarget).toBe("true")
	},
})

export const FilesOnly = meta.story({
	args: { leading: attachControl, attachments: stagedFiles },
	parameters: {
		docs: {
			description: {
				story:
					"Files staged with nothing typed: the turn is worth sending on the chips alone, so the send button is there even though the prompt is blank and `onSubmit` receives an empty string. Check that the button appears with the first chip and that `Empty` still hides it when the composer carries neither. " +
					MOUNTED_BY_THE_COMPOSER,
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const send = await canvas.findByRole("button", { name: "Send" })

		await expect(send).toBeEnabled()
		await userEvent.click(send)
		await expect(args.onSubmit).toHaveBeenCalledWith("")
	},
})

const ARTBOARD_COMPOSER =
	"The composer of artboard V1e, light and dark side by side: a `muted` fill and a 1px `border` outline around the pill, 8px of padding, the plus button leading and the send button trailing. "

const composersIn = (canvasElement: HTMLElement) => [
	...canvasElement.querySelectorAll<HTMLElement>('[data-slot="prompt-input"]'),
]

const expectArtboardComposer = async (composer: HTMLElement) => {
	await expectFieldFrame(composer, "border-border")
	await expect(getComputedStyle(composer).padding).toBe("8px")
}

export const ThemesAtRest = meta.story({
	globals: { theme_layout: "side-by-side" },
	args: { leading: leadingControls },
	parameters: {
		docs: { description: { story: `${ARTBOARD_COMPOSER}Empty.` } },
	},
	play: async ({ canvasElement }) => {
		const composers = composersIn(canvasElement)
		await expect(composers.length).toBe(2)
		for (const composer of composers) await expectArtboardComposer(composer)
	},
})

export const ThemesFilled = meta.story({
	globals: { theme_layout: "side-by-side" },
	args: { leading: leadingControls, value: DRAFT },
	parameters: {
		docs: { description: { story: `${ARTBOARD_COMPOSER}Holding a draft.` } },
	},
	play: async ({ canvasElement }) => {
		for (const composer of composersIn(canvasElement))
			await expectArtboardComposer(composer)
	},
})

export const ThemesFocusVisible = meta.story({
	globals: { theme_layout: "side-by-side" },
	args: { leading: leadingControls, value: DRAFT },
	parameters: {
		docs: {
			description: {
				story: `${ARTBOARD_COMPOSER}Focus in the prompt keeps the existing \`ring\` outline and halo on the whole pill.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		for (const composer of composersIn(canvasElement)) {
			composer.querySelector("textarea")?.focus()
			await expectFocusRing(composer)
		}
	},
})

export const ThemesDisabled = meta.story({
	globals: { theme_layout: "side-by-side" },
	args: { leading: leadingControls, value: DRAFT, disabled: true },
	parameters: {
		docs: {
			description: {
				story: `${ARTBOARD_COMPOSER}Disabled, the whole pill keeps its existing half opacity over the same fill.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		for (const composer of composersIn(canvasElement)) {
			await expectArtboardComposer(composer)
			await expect(getComputedStyle(composer).opacity).toBe("0.5")
			await expect(composer).not.toHaveAttribute("aria-label")
			await expect(within(composer).queryByRole("status")).toBeNull()
		}
	},
})

const OFFLINE_HOST = { spaceName: "Studio", hostName: "Steve" }

const OFFLINE_WORDING =
	"Studio is offline. You can write again once Steve’s computer is back."

export const Offline = meta.story({
	globals: { theme: "dark" },
	args: { leading: attachControl, offline: OFFLINE_HOST },
	parameters: {
		docs: {
			description: {
				story:
					"Measured against the Paper page `Iteration 5` of `Kiroshi, Invitations`, artboard 5.7, dark only. The open space is joined and its host's computer is offline, so there is nowhere to send to. Check the field gives its place to the offline wording in the muted 14px line on 24px, that nothing can be typed, attached or sent, that only the attach and send controls drop to 40% while the box keeps full opacity, unlike `ThemesDisabled`, which dims the whole pill, and that the wording is a polite status inside the form named `Message`, so a screen reader hears the change and still finds the composer.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await expect(canvas.queryByRole("textbox")).toBeNull()
		const wording = canvas.getByText(OFFLINE_WORDING)
		const style = getComputedStyle(wording)
		await expect(style.fontSize).toBe("14px")
		await expect(style.lineHeight).toBe("24px")
		await expect(style.color).toBe("rgb(163, 163, 163)")

		const form = formOf(wording)
		await expect(wording).toHaveAttribute("role", "status")
		await expect(canvas.getByRole("status")).toBe(wording)
		await expect(canvas.getByRole("form", { name: "Message" })).toBe(form)
		await expect(getComputedStyle(form).opacity).toBe("1")
		const attach = canvas.getByRole("button", {
			hidden: true,
			name: "Attach files",
		})
		const send = canvas.getByRole("button", { hidden: true, name: "Send" })
		for (const control of [attach, send]) {
			const group = control.closest<HTMLElement>("[inert]")
			if (!group) throw new Error("The control is not blocked")
			await expect(getComputedStyle(group).opacity).toBe("0.4")
		}

		await userEvent.tab()
		await expect(form.contains(document.activeElement)).toBe(false)
		await userEvent.keyboard("Hello{Enter}")
		await userEvent.click(send)
		await expect(args.onSubmit).not.toHaveBeenCalled()
		await expect(args.onValueChange).not.toHaveBeenCalled()
		drag("drop", form, draggingFile())
		await expect(args.onAttach).not.toHaveBeenCalled()
	},
})
