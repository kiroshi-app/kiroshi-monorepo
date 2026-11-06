import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	expectSkeletonFilledTo,
	slotIn,
	slotsIn,
} from "@workspace/storybook/story-utils"
import { AppHeader } from "@workspace/ui/components/app-header"
import { HeaderIdentityButton } from "@workspace/ui/components/header-identity-button"
import { PromptInput } from "@workspace/ui/components/prompt-input"
import { ThreadLayout } from "@workspace/ui/components/thread-layout"
import { ThreadTranscriptSkeleton } from "@workspace/ui/components/thread-transcript-skeleton"

const LOADED = {
	transcriptBottomInset: 16,
	turnGap: 12,
	bubbleRadius: "16px",
	bubblePadding: 18,
	textLineHeight: 24,
	footGap: 8,
	authorLineHeight: 20,
	authorLineGap: 8,
	authorAvatar: [20, 20],
	titleBadgeRadius: "6px",
}

const boxOf = (element: Element) => element.getBoundingClientRect()

const sizeOf = (element: Element) => [
	boxOf(element).width,
	boxOf(element).height,
]

const bubblesIn = (root: Element) =>
	Array.from(root.querySelectorAll<HTMLElement>('[data-slot$="-bubble"]'))

const cornerRadiiOf = (element: Element) => {
	const style = getComputedStyle(element)
	return [
		style.borderTopLeftRadius,
		style.borderTopRightRadius,
		style.borderBottomRightRadius,
		style.borderBottomLeftRadius,
	]
}

const bubbleHeightOf = (lineCount: number, hasAuthorLine: boolean) =>
	LOADED.bubblePadding * 2 +
	lineCount * LOADED.textLineHeight +
	(hasAuthorLine ? LOADED.footGap + LOADED.authorLineHeight : 0)

const gapsBetween = (pieces: Element[]) =>
	pieces
		.slice(1)
		.map((piece, index) => boxOf(piece).left - boxOf(pieces[index]).right)

const expectAuthorLineAtFoot = (bubble: HTMLElement) => {
	const line = slotIn(bubble, "skeleton-author-line")
	expect(boxOf(line).height).toBe(LOADED.authorLineHeight)
	expect(boxOf(bubble).bottom - boxOf(line).bottom).toBe(LOADED.bubblePadding)
	expect(boxOf(line).left - boxOf(bubble).left).toBe(LOADED.bubblePadding)
	return line
}

const meta = preview.meta({
	title: "Feedback/ThreadTranscriptSkeleton",
	component: ThreadTranscriptSkeleton,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The stand-in for a conversation transcript while its first page is on its way, drawn on the loaded turns: a run of companion bubbles on the left, the first and last carrying an author line (hexagon, name, title badge, time) at their foot, then your bubbles and a person's bubble on the right with a round avatar, a name and a time at their foot. Turns sit 12px apart and every bubble keeps the loaded 16px corners. It rests on the composer and rises to the top of the transcript region, the last turn cut by its edge. It takes the transcript's place through `ThreadLayout`'s `skeleton` slot, so the header and the composer stay the loaded components.",
			},
		},
	},
	render: () => (
		<ThreadLayout
			composer={<PromptInput onSubmit={fn()} />}
			header={
				<AppHeader
					leading={
						<HeaderIdentityButton
							connection="ready"
							name="Skippy"
							onOpenSettings={fn()}
							seed="bot-skippy"
							version="2.1.233"
						/>
					}
				/>
			}
			skeleton={<ThreadTranscriptSkeleton />}
		>
			{null}
		</ThreadLayout>
	),
	play: async ({ canvasElement }) => {
		await expectSkeletonFilledTo(canvasElement, "top")
		const list = slotIn(canvasElement, "list-skeleton")
		const rows = slotsIn(list, "list-skeleton-row")
		const [agentClosing, agentMiddle, agentOpening, user, person] = rows

		await expect(list).toHaveAttribute("aria-hidden", "true")
		await expect(boxOf(list).bottom - boxOf(agentClosing).bottom).toBe(
			LOADED.transcriptBottomInset,
		)
		for (const [index, row] of rows.slice(0, 5).entries())
			await expect(boxOf(row).top - boxOf(rows[index + 1]).bottom).toBe(
				LOADED.turnGap,
			)
		for (const bubble of bubblesIn(list))
			await expect(cornerRadiiOf(bubble)).toEqual(
				Array(4).fill(LOADED.bubbleRadius),
			)

		const closingBubble = slotIn(agentClosing, "skeleton-agent-bubble")
		await expect(boxOf(closingBubble).height).toBe(bubbleHeightOf(1, true))
		await expect(boxOf(closingBubble).left).toBe(boxOf(agentClosing).left)
		const agentLine = expectAuthorLineAtFoot(closingBubble)
		const [hexagon, name, badge, time] = slotsIn(agentLine, "skeleton")
		await expect(sizeOf(hexagon)).toEqual(LOADED.authorAvatar)
		await expect(getComputedStyle(hexagon).maskImage).not.toBe("none")
		await expect(boxOf(badge).height).toBe(LOADED.authorLineHeight)
		await expect(getComputedStyle(badge).borderRadius).toBe(
			LOADED.titleBadgeRadius,
		)
		await expect(gapsBetween([hexagon, name, badge, time])).toEqual(
			Array(3).fill(LOADED.authorLineGap),
		)

		const middleBubble = slotIn(agentMiddle, "skeleton-agent-bubble")
		await expect(slotsIn(middleBubble, "skeleton-author-line")).toHaveLength(0)
		await expect(boxOf(middleBubble).height).toBe(bubbleHeightOf(2, false))
		expectAuthorLineAtFoot(slotIn(agentOpening, "skeleton-agent-bubble"))

		for (const [row, slot] of [
			[user, "skeleton-user-bubble"],
			[person, "skeleton-person-bubble"],
		] as const) {
			const bubble = slotIn(row, slot)
			await expect(boxOf(bubble).right).toBe(boxOf(row).right)
			const line = expectAuthorLineAtFoot(bubble)
			const [avatar, ...rest] = slotsIn(line, "skeleton")
			await expect(sizeOf(avatar)).toEqual(LOADED.authorAvatar)
			await expect(getComputedStyle(avatar).borderRadius).not.toBe("0px")
			await expect(boxOf(rest.at(-1) as HTMLElement).right).toBe(
				boxOf(bubble).right - LOADED.bubblePadding,
			)
			await expect(gapsBetween([avatar, ...rest])).toEqual(
				Array(2).fill(LOADED.authorLineGap),
			)
		}
	},
})

export const Light = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The transcript between the thread header and the composer, light theme. Check that the newest turn sits one small gap above the composer, that only the first and last bubbles of the companion run carry an author line, that your bubbles and the person's bubble end on the right with their author line at the foot, and that the topmost turn is cut by the header's edge. Pick `Dark` for the dark theme.",
			},
		},
	},
})

export const Dark = meta.story({
	globals: { theme: "dark", theme_layout: "single" },
	parameters: {
		docs: {
			description: {
				story:
					"The same transcript in the dark theme. Check that the solid avatars and name bars stay apart from the faint bubbles, badges and time bars against the dark ground. Pick `Light` for the light theme.",
			},
		},
	},
})
