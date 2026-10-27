import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotIn } from "@workspace/storybook/story-utils"
import type { ApplicationCardProps } from "@workspace/ui/components/application-card"
import {
	type ApplicationInstallNotice,
	ApplicationInstallTurn,
} from "@workspace/ui/components/application-install-turn"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import type { MessageAuthor } from "@workspace/ui/components/message"
import { CATALOGUE_APPLICATIONS } from "@workspace/ui/components/plugin-settings/applications.fixtures"
import { AssistantTurn, TurnGroup } from "@workspace/ui/components/turn"
import { bots } from "@workspace/ui/lib/i18n-en/bots"

const SENTRY_MARK = CATALOGUE_APPLICATIONS.find(
	({ id }) => id === "sentry",
)?.mark

const INSTALLER: MessageAuthor = {
	id: "bot-atlas",
	name: "Atlas",
	blot: BLOT_HUES.blue,
}

const ANNOUNCEMENT =
	"Sentry is in now, so I can read the errors behind a release from here."

const RECEIPT: ApplicationCardProps = {
	name: "Sentry",
	mark: SENTRY_MARK,
	description: "Pulls the errors and traces behind a release.",
	footnote: {
		sentence: "Shoto has Sentry in every conversation.",
		actionLabel: "Open Settings",
		onAction: fn(),
	},
}

const NARROW_SENTENCE =
	"Shoto has Sentry in every conversation, and so does every companion you add later."

const NARROW_RECEIPT: ApplicationCardProps = {
	...RECEIPT,
	footnote: {
		sentence: NARROW_SENTENCE,
		actionLabel: "Open Settings",
		onAction: fn(),
	},
}

const LEFT_OUT_KEY: ApplicationInstallNotice = {
	title: "Sentry",
	secrets: ["SENTRY_AUTH_TOKEN"],
	onOpenSettings: fn(),
}

const PLACED_BY_THE_FEED =
	"`apps/app/src/components/thread-screen.tsx:846` places the row in the feed with the install `apps/app/src/components/application-install-row.tsx:42` maps."

const CONNECTION_WORDING = [
	bots.applications.catalogue.setup.apiKey,
	bots.applications.catalogue.setup.signIn,
	bots.applications.catalogue.setup.unavailable,
	bots.applications.connection.state.connected,
]

const startEdgeOf = (element: Element) => element.getBoundingClientRect().left

const meta = preview.meta({
	title: "Conversation/Tools/ApplicationInstallTurn",
	component: ApplicationInstallTurn,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"The receipt of an install as it lands in the transcript: an assistant row on the same two-column grid as every other assistant turn, with the gutter left empty because no companion signs a receipt, and the card posted bare in the bubble column — its own border, its own footnote rule, no bubble around it. When the key the install needed was left out, the notice bubble rides the same column above it.",
			},
		},
	},
	args: { receipt: RECEIPT },
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The receipt on its own, the way an install that needed nothing lands. Check that the card carries its border and separates its footnote by one rule, that no bubble surface wraps it, and that the gutter column stays empty rather than borrowing the avatar of whoever ran the install. Pick `WhenTheKeyWasLeftOut` for the install that could not read its key. " +
					PLACED_BY_THE_FEED,
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const receipt = slotIn(canvasElement, "application-receipt")
		const gutter = slotIn(canvasElement, "message-gutter")
		const footnote = receipt.lastElementChild as HTMLElement
		const openSettings = canvas.getByRole("button", { name: "Open Settings" })

		await expect(canvas.getByLabelText("assistant message")).toBeVisible()
		await expect(receipt.closest('[data-slot="message-bubble"]')).toBeNull()
		await expect(getComputedStyle(receipt).borderTopWidth).toBe("1px")
		await expect(getComputedStyle(footnote).borderTopWidth).toBe("1px")
		await expect(gutter).toBeEmptyDOMElement()
		await expect(gutter).toHaveAttribute("aria-hidden", "true")
		for (const wording of CONNECTION_WORDING) {
			await expect(receipt).not.toHaveTextContent(wording)
		}

		openSettings.focus()
		await expect(openSettings.matches(":focus-visible")).toBe(true)
		await expect(getComputedStyle(openSettings).boxShadow).not.toBe("none")
		await userEvent.keyboard("{Enter}")
		await expect(args.receipt.footnote?.onAction).toHaveBeenCalledTimes(1)
	},
})

export const WhenTheKeyWasLeftOut = meta.story({
	args: { notice: LEFT_OUT_KEY },
	parameters: {
		docs: {
			description: {
				story:
					"Artboard E11: the install landed but the key it needed was left out, so a notice bubble names the failure and the way to Settings with no key field, and the receipt follows under it. Check that the bubble and the receipt share one start edge, the bubble above, and that the notice asks nothing. Pick `Default` for the install that needed no key. " +
					PLACED_BY_THE_FEED,
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const receipt = slotIn(canvasElement, "application-receipt")
		const bubble = slotIn(canvasElement, "message-bubble")

		await expect(startEdgeOf(bubble)).toBeCloseTo(startEdgeOf(receipt), 1)
		await expect(bubble.getBoundingClientRect().bottom).toBeLessThanOrEqual(
			receipt.getBoundingClientRect().top,
		)
		await expect(canvas.queryByRole("textbox")).not.toBeInTheDocument()
		await expect(canvas.getByRole("form")).toHaveAccessibleName(
			"Sentry was left out",
		)
	},
})

export const InATranscript = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The receipt among the turns that surround it in a thread. Check that its start edge lands on the start edge of the bubbles above and below rather than a gutter width earlier, and that nothing is drawn in its gutter. " +
					PLACED_BY_THE_FEED,
			},
		},
	},
	render: (args) => (
		<div className="flex flex-col gap-6">
			<TurnGroup>
				<AssistantTurn author={INSTALLER}>{ANNOUNCEMENT}</AssistantTurn>
			</TurnGroup>
			<ApplicationInstallTurn {...args} />
			<TurnGroup>
				<AssistantTurn author={INSTALLER}>
					Ask me for a release and I will pull its errors.
				</AssistantTurn>
			</TurnGroup>
		</div>
	),
	play: async ({ canvasElement }) => {
		const receipt = slotIn(canvasElement, "application-receipt")
		const [above, below] = Array.from(
			canvasElement.querySelectorAll('[data-slot="message-bubble"]'),
		)

		await expect(startEdgeOf(receipt)).toBeCloseTo(
			startEdgeOf(above as Element),
			1,
		)
		await expect(startEdgeOf(receipt)).toBeCloseTo(
			startEdgeOf(below as Element),
			1,
		)
	},
})

export const InANarrowColumn = meta.story({
	args: { receipt: NARROW_RECEIPT },
	decorators: [
		(Story) => (
			<div className="w-[320px]" data-testid="column">
				<Story />
			</div>
		),
	],
	parameters: {
		docs: {
			description: {
				story:
					"The row in a 320px column, which is also what 200 percent zoom leaves. Check that the footnote sentence wraps and its control keeps its full label at the inline end, both inside the column, with the gutter still holding its width. Pick `Default` for the room a thread usually gives it. " +
					PLACED_BY_THE_FEED,
			},
		},
	},
	play: async ({ canvas }) => {
		const column = canvas.getByTestId("column")
		const sentence = canvas.getByText(NARROW_SENTENCE)
		const control = canvas.getByRole("button", { name: "Open Settings" })

		await expect(startEdgeOf(sentence)).toBeGreaterThanOrEqual(
			startEdgeOf(column),
		)
		await expect(control.getBoundingClientRect().right).toBeLessThanOrEqual(
			column.getBoundingClientRect().right,
		)
		await expect(control.scrollWidth).toBeLessThanOrEqual(control.clientWidth)
		await expect(column.scrollWidth).toBeLessThanOrEqual(column.clientWidth)
	},
})
