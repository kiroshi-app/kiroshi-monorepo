import { expect, fn, userEvent, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { ImportRow } from "@workspace/ui/components/import-row"
import { i18n } from "@workspace/ui/lib/i18n"

const LONG_TITLE =
	"release-notes-from-every-merged-pull-request-since-the-last-tag"

const LONG_DETAIL =
	"Reads every merged pull request since the last tag, groups them by scope, writes the release notes in the voice of the changelog, then opens a draft for review before anything ships. It never tags on its own."

const meta = preview.meta({
	title: "Feedback/ImportRow",
	component: ImportRow,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"One thing found in ~/.claude on the Import from Claude Code screen: a companion, the CLAUDE.md instructions or a skill. While the reader picks, the lead slot holds a checkbox named after the row title; once the import runs it holds a status icon instead, labelled done, in progress or failed. A row already in Kiroshi keeps its checkbox unchecked and disabled, and reads Already in Kiroshi. Every row names its type at the right edge: Agent, Instructions or Skills.",
			},
		},
	},
	args: {
		kind: "companion" as const,
		title: "Atlas",
		detail: "Reviews pull requests and flags risky changes.",
		checked: true,
		onCheckedChange: fn(),
	},
	render: (args) => (
		<div className="w-140 rounded-xl border border-border bg-card">
			<ImportRow {...args} />
		</div>
	),
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A companion the reader has not unchecked yet. Check that the checkbox carries the accent fill and the row title as its name, and that unchecking it hands false to `onCheckedChange`.",
			},
		},
	},
	play: async ({ canvasElement, args }) => {
		const checkbox = within(canvasElement).getByRole("checkbox", {
			name: "Atlas",
		})
		await expect(checkbox).toBeChecked()
		await userEvent.click(checkbox)
		await expect(args.onCheckedChange).toHaveBeenCalledWith(false)
	},
})

export const States = meta.story({
	render: (args) => (
		<div className="flex w-140 flex-col overflow-hidden rounded-xl border border-border bg-card [&>*+*]:border-border [&>*+*]:border-t">
			<ImportRow {...args} />
			<ImportRow
				{...args}
				checked={false}
				detail="Writes release notes from merged work."
				hue={150}
				title="Wren"
			/>
			<ImportRow
				{...args}
				detail="Your standing instructions, 42 lines. Kept as yours, for every companion."
				isInKiroshi
				kind="instructions"
				title="CLAUDE.md"
			/>
			<ImportRow
				{...args}
				detail="commit-style, test-first, review-checklist, changelog"
				kind="skill"
				title={i18n.t("common:claudeImport.row.skills", { count: 4 })}
			/>
			<ImportRow
				{...args}
				detail="Triages new issues every morning."
				hue={30}
				status="done"
				title="Bramble"
			/>
			<ImportRow
				{...args}
				detail="Keeps the API reference in sync."
				hue={280}
				status="pending"
				title="Cedar"
			/>
			<ImportRow
				{...args}
				detail={i18n.t("common:claudeImport.row.unparsable", {
					file: "SKILL.md",
				})}
				kind="skill"
				status="failed"
				title="changelog"
			/>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Every lead the row takes, top to bottom: checked, unchecked, the CLAUDE.md row in Geist Mono already in Kiroshi, the skills on one row titled with their count, then done, in progress and failed once the import runs. Check that the row already in Kiroshi stays unchecked when clicked, that each status icon carries its label, and that every row, failed and already in Kiroshi included, keeps its type at the right edge.",
			},
		},
	},
	play: async ({ canvasElement, args }) => {
		const canvas = within(canvasElement)
		const alreadyIn = canvas.getByRole("checkbox", { name: "CLAUDE.md" })
		await expect(alreadyIn).not.toBeChecked()
		await userEvent.click(alreadyIn, { pointerEventsCheck: 0 })
		await expect(alreadyIn).not.toBeChecked()
		await expect(args.onCheckedChange).not.toHaveBeenCalled()
		await expect(canvas.getByText("Already in Kiroshi.")).toBeVisible()
		await expect(canvas.getByRole("img", { name: "Done" })).toBeVisible()
		await expect(canvas.getByRole("img", { name: "In progress" })).toBeVisible()
		await expect(canvas.getByRole("img", { name: "Failed" })).toBeVisible()
		await expect(canvas.getAllByText("Agent")).toHaveLength(4)
		await expect(canvas.getByText("Instructions")).toBeVisible()
		await expect(canvas.getAllByText("Skills")).toHaveLength(2)
	},
})

export const LongContent = meta.story({
	args: {
		kind: "skill",
		title: LONG_TITLE,
		detail: LONG_DETAIL,
	},
	parameters: {
		docs: {
			description: {
				story:
					"A skill whose name is one unbreakable string and whose description runs several sentences. Check that both wrap inside the 560 px card, title above detail, and that nothing spills past its edge.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const row = canvasElement.querySelector<HTMLElement>(
			'[data-slot="import-row"]',
		)
		if (!row) throw new Error("Nothing here draws an import row")
		await expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth)
	},
})
