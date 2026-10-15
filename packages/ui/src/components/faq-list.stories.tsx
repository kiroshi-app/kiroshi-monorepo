import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { type FaqItem, FaqList } from "@workspace/ui/components/faq-list"

const ARTBOARD_ITEMS: readonly FaqItem[] = [
	{
		question: "What is Kiroshi?",
		answer:
			"A desktop app where you keep a team of companions. Each one has its own skills, memory and history, works in your tools, and keeps going while you do something else.",
	},
	{
		question: "Do I need a subscription?",
		answer:
			"Yes, a Claude subscription you're signed in to. Kiroshi ships the agent that answers and runs it on your own sign-in, so there's no API key to paste. Kiroshi itself is free.",
	},
	{
		question: "Where do my conversations live?",
		answer:
			"On your computer. Conversations, companions and what they learn are kept in a local folder, and they're all there on the next launch. Replies are written by the agent, so what you send goes through your model provider.",
	},
	{
		question: "Which macOS versions can run it?",
		answer: "macOS 10.15 Catalina or later, Apple silicon and Intel alike.",
	},
	{
		question: "Is there a Windows or Linux version?",
		answer:
			"Yes. Windows and Linux builds are also available for download, on the Download page.",
	},
	{
		question: "Can I undo what a companion learned?",
		answer:
			"Yes. Everything a companion writes down is saved as its own change in that companion's History, where you can read it and undo it, one change at a time.",
	},
	{
		question: "Is Kiroshi open source?",
		answer:
			"Yes, under the MIT license. The code is on GitHub, and issues and pull requests are welcome.",
	},
]

const UNBREAKABLE_ITEM: FaqItem = {
	question: "Where is the log file?",
	answer: `~/Library/Logs/${"kiroshi-companion-history-".repeat(12)}latest.log`,
}

const ALL_QUESTIONS = ARTBOARD_ITEMS.map(({ question }) => question)

const resolvedColor = (token: string) => {
	const probe = document.createElement("span")
	probe.style.color = `var(${token})`
	document.body.append(probe)
	const color = getComputedStyle(probe).color
	probe.remove()
	return color
}

const listIn = (canvasElement: HTMLElement) =>
	canvasElement.querySelector<HTMLElement>("[data-slot=accordion]")

const meta = preview.meta({
	title: "Primitives/FaqList",
	component: FaqList,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"A list of question and answer items drawn as the house accordion: hairline rules between items, the question at the body step in medium weight, the answer one step down in the muted foreground. Several answers stay open at once. It renders only the items it is given; the section title and page layout belong to the page.",
			},
		},
	},
})

export const Default = meta.story({
	args: { items: ARTBOARD_ITEMS },
	parameters: {
		docs: {
			description: {
				story:
					"Every question closed, the state a visitor lands on. Check the hairline above the first question and below each one, and that a click or Enter opens an answer while the others keep their state. Pick `AllOpen` to compare against the artboard.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const [first, second] = canvas.getAllByRole("button")
		if (!first || !second)
			throw new Error("FaqList rendered fewer than two triggers")
		await expect(first.closest("h3")).not.toBeNull()
		await expect(first).toHaveAttribute("aria-expanded", "false")

		await userEvent.click(first)
		await expect(first).toHaveAttribute("aria-expanded", "true")
		await expect(
			canvas.getByText(ARTBOARD_ITEMS[0]?.answer ?? ""),
		).toBeVisible()
		await userEvent.click(first)
		await expect(first).toHaveAttribute("aria-expanded", "false")

		first.focus()
		await userEvent.keyboard("{ArrowDown}")
		await expect(second).toHaveFocus()
		await userEvent.keyboard("{ArrowUp}")
		await expect(first).toHaveFocus()

		await userEvent.keyboard("{Enter}")
		await expect(first).toHaveAttribute("aria-expanded", "true")
		await userEvent.keyboard("{ArrowDown}")
		await userEvent.keyboard(" ")
		await expect(second).toHaveAttribute("aria-expanded", "true")
		await expect(first).toHaveAttribute("aria-expanded", "true")
		await userEvent.keyboard(" ")
		await expect(second).toHaveAttribute("aria-expanded", "false")
	},
})

export const AllOpen = meta.story({
	args: { items: ARTBOARD_ITEMS, defaultOpen: ALL_QUESTIONS },
	parameters: {
		docs: {
			description: {
				story:
					"The seven artboard questions, every answer open, which is how the artboard draws the list. Check it side by side with the Landing artboard: 20px above each question, 6px to its answer, 20px to the rule, in both themes. Pick `Default` for the landing state.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const list = listIn(canvasElement)
		if (!list) throw new Error("FaqList rendered no accordion")
		const border = resolvedColor("--border")
		const listStyle = getComputedStyle(list)
		await expect(listStyle.borderTopWidth).toBe("1px")
		await expect(listStyle.borderTopColor).toBe(border)
		await expect(listStyle.borderBottomWidth).toBe("0px")

		const item = canvasElement.querySelector<HTMLElement>(
			"[data-slot=accordion-item]",
		)
		if (!item) throw new Error("FaqList rendered no item")
		const itemStyle = getComputedStyle(item)
		await expect(itemStyle.borderBottomWidth).toBe("1px")
		await expect(itemStyle.borderBottomColor).toBe(border)
		await expect(itemStyle.paddingBottom).toBe("20px")

		const question = getComputedStyle(
			canvas.getByRole("button", { name: ARTBOARD_ITEMS[0]?.question }),
		)
		await expect(question.paddingTop).toBe("20px")
		await expect(question.paddingInlineStart).toBe("0px")
		await expect(question.fontSize).toBe("16px")
		await expect(question.lineHeight).toBe("24px")
		await expect(question.fontWeight).toBe("500")
		await expect(question.color).toBe(resolvedColor("--foreground"))

		const answer = getComputedStyle(
			canvas.getByText(ARTBOARD_ITEMS[0]?.answer ?? ""),
		)
		await expect(answer.paddingTop).toBe("6px")
		await expect(answer.fontSize).toBe("15px")
		await expect(answer.lineHeight).toBe("22px")
		await expect(answer.fontWeight).toBe("400")
		await expect(answer.color).toBe(resolvedColor("--muted-foreground"))

		for (const trigger of canvas.getAllByRole("button")) {
			await expect(trigger).toHaveAttribute("aria-expanded", "true")
		}
	},
})

export const LongContent = meta.story({
	args: {
		items: [UNBREAKABLE_ITEM],
		defaultOpen: [UNBREAKABLE_ITEM.question],
	},
	globals: { viewport: { value: "mobile" } },
	parameters: {
		docs: {
			description: {
				story:
					"An answer holding a path with no break opportunity, far wider than a phone. Check that it wraps inside the column and that the page gains no horizontal scroll. Pick `AllOpen` for realistic copy.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const list = listIn(canvasElement)
		const answer = canvas.getByText(UNBREAKABLE_ITEM.answer)
		await expect(answer.scrollWidth).toBeLessThanOrEqual(answer.clientWidth)
		await expect(list?.scrollWidth).toBe(list?.clientWidth)
	},
})
