import { history, undo } from "@codemirror/commands"
import { markdown, markdownLanguage } from "@codemirror/lang-markdown"
import {
	EditorSelection,
	EditorState,
	type SelectionRange,
	type StateCommand,
	type Transaction,
} from "@codemirror/state"
import { describe, expect, it } from "vitest"

import {
	isFormatOn,
	isFormatToRemove,
	selectedLinkOf,
	setLink,
	toggleBold,
	toggleBulletList,
	toggleCodeBlock,
	toggleHeading1,
	toggleHeading2,
	toggleHeading3,
	toggleInlineCode,
	toggleItalic,
	toggleNumberedList,
	toggleQuote,
	toggleStrikethrough,
	toggleTask,
} from "@workspace/ui/components/library-document-commands"

const OPEN = "‹"

const CLOSE = "›"

const stateOf = (marked: string) => {
	const ranges: SelectionRange[] = []
	let doc = ""
	let anchor = 0
	for (const character of marked) {
		if (character === OPEN) anchor = doc.length
		else if (character === CLOSE)
			ranges.push(EditorSelection.range(anchor, doc.length))
		else doc += character
	}
	return EditorState.create({
		doc,
		selection: EditorSelection.create(ranges),
		extensions: [
			markdown({ base: markdownLanguage }),
			EditorState.allowMultipleSelections.of(true),
			history(),
		],
	})
}

const shownOf = (state: EditorState) => {
	let shown = state.doc.toString()
	for (const { from, to } of [...state.selection.ranges].reverse())
		shown = `${shown.slice(0, from)}${OPEN}${shown.slice(from, to)}${CLOSE}${shown.slice(to)}`
	return shown
}

type Run = {
	shown: string
	transactions: Transaction[]
	undone: () => string
}

const run = (marked: string, ...commands: StateCommand[]): Run => {
	let state = stateOf(marked)
	const transactions: Transaction[] = []
	const target = {
		get state() {
			return state
		},
		dispatch: (transaction: Transaction) => {
			transactions.push(transaction)
			state = transaction.state
		},
	}
	for (const command of commands) command(target)
	return {
		shown: shownOf(state),
		transactions,
		undone: () => {
			undo(target)
			return shownOf(state)
		},
	}
}

const formatted = (marked: string, command: StateCommand) =>
	run(marked, command).shown

describe("isFormatToRemove", () => {
	it("removes only when every part carries the format", () => {
		expect(isFormatToRemove([true, true])).toBe(true)
		expect(isFormatToRemove([true, false])).toBe(false)
	})
})

describe("inline commands", () => {
	it.each([
		[toggleBold, "Ship the ‹launch› today.", "Ship the **‹launch›** today."],
		[toggleItalic, "Ship the ‹launch› today.", "Ship the *‹launch›* today."],
		[
			toggleStrikethrough,
			"Ship the ‹launch› today.",
			"Ship the ~~‹launch›~~ today.",
		],
		[
			toggleInlineCode,
			"Ship the ‹launch› today.",
			"Ship the `‹launch›` today.",
		],
		[toggleBold, "Ship the la‹unc›h today.", "Ship the la**‹unc›**h today."],
	])("wraps the selected text", (command, before, after) => {
		expect(formatted(before, command)).toBe(after)
	})

	it("keeps selected spaces outside the markers", () => {
		expect(formatted("Ship the‹ launch ›today.", toggleBold)).toBe(
			"Ship the‹ **launch** ›today.",
		)
	})

	it("removes the format the whole selection carries, double underscore included", () => {
		expect(formatted("Ship the **‹launch›** today.", toggleBold)).toBe(
			"Ship the ‹launch› today.",
		)
		expect(formatted("Ship the __la‹unc›h__ today.", toggleBold)).toBe(
			"Ship the la‹unc›h today.",
		)
		expect(formatted("Ship _‹the launch›_ today.", toggleItalic)).toBe(
			"Ship ‹the launch› today.",
		)
	})

	it("gives a mixed selection the format once, with no nested markers", () => {
		expect(formatted("Ship ‹the **launch** today›.", toggleBold)).toBe(
			"Ship **‹the launch today›**.",
		)
		expect(formatted("Ship **the la‹unch** to›day.", toggleBold)).toBe(
			"Ship **the la‹unch to›**day.",
		)
	})

	it("widens over a format the selection would split", () => {
		expect(formatted("Ship *the la‹unch* to›day.", toggleBold)).toBe(
			"Ship ***the la‹unch* to›**day.",
		)
	})

	it("formats each block of a selection spanning several", () => {
		expect(
			formatted(
				"# Launch ‹plan\n\n- Ship it\n- [ ] Copy\n\n> Quiet› now",
				toggleBold,
			),
		).toBe(
			"# Launch **‹plan**\n\n- **Ship it**\n- [ ] **Copy**\n\n> **Quiet›** now",
		)
	})

	it("removes the format from every block once all carry it", () => {
		const all = "‹**One** here\n\n## **Two**›"
		expect(formatted(all, toggleBold)).toBe("‹**One here**\n\n## **Two**›")
		expect(formatted("‹**One**\n\n## **Two**›", toggleBold)).toBe(
			"‹One\n\n## Two›",
		)
	})

	it("leaves fenced code untouched", () => {
		expect(formatted("‹Intro\n\n```\ncode\n```›", toggleBold)).toBe(
			"**‹Intro**\n\n```\ncode\n```›",
		)
	})

	it("formats every selection range in one transaction undone in one step", () => {
		const result = run("‹One› and ‹two›", toggleItalic)
		expect(result.shown).toBe("*‹One›* and *‹two›*")
		expect(result.transactions).toHaveLength(1)
		expect(result.undone()).toBe("‹One› and ‹two›")
	})

	it("does nothing on a collapsed selection", () => {
		expect(run("Ship‹› it", toggleBold).transactions).toHaveLength(0)
	})
})

describe("setLink", () => {
	it("links the selection", () => {
		expect(
			formatted("Read the ‹brief› today.", setLink("https://k.app/b")),
		).toBe("Read the [‹brief›](https://k.app/b) today.")
	})

	it("replaces the url of the link the selection sits in", () => {
		expect(
			formatted(
				"Read the [‹brief›](https://k.app/a) today.",
				setLink("https://k.app/b"),
			),
		).toBe("Read the [‹brief›](https://k.app/b) today.")
	})

	it("removes the link on an empty url and keeps its text", () => {
		expect(
			formatted("Read the [‹brief›](https://k.app/a) today.", setLink(" ")),
		).toBe("Read the ‹brief› today.")
	})

	it("links a mixed selection once", () => {
		expect(
			formatted(
				"‹Read the [brief](https://k.app/a) today›.",
				setLink("https://k.app/b"),
			),
		).toBe("[‹Read the brief today›](https://k.app/b).")
	})

	it("escapes the spaces of the url", () => {
		expect(formatted("‹brief›", setLink("https://k.app/a b(1)"))).toBe(
			"[‹brief›](https://k.app/a%20b(1))",
		)
	})
})

describe("line commands", () => {
	it.each([
		[toggleHeading1, "Ship ‹it›", "# Ship ‹it›"],
		[toggleHeading2, "Ship ‹it›", "## Ship ‹it›"],
		[toggleHeading3, "Ship ‹it›", "### Ship ‹it›"],
		[toggleBulletList, "Ship ‹it›", "- Ship ‹it›"],
		[toggleNumberedList, "Ship ‹it›", "1. Ship ‹it›"],
		[toggleTask, "Ship ‹it›", "- [ ] Ship ‹it›"],
		[toggleQuote, "Ship ‹it›", "> Ship ‹it›"],
	])("prefixes the line", (command, before, after) => {
		const result = run(before, command)
		expect(result.shown).toBe(after)
		expect(formatted(after, command)).toBe(before)
		expect(result.undone()).toBe(before)
	})

	it("replaces a heading of another level", () => {
		expect(formatted("‹# One\n\n### Two›", toggleHeading2)).toBe(
			"‹## One\n\n## Two›",
		)
	})

	it("replaces a list prefix of the same family", () => {
		expect(formatted("‹1. One\n- [x] Two\n* Three›", toggleBulletList)).toBe(
			"‹- One\n- Two\n- Three›",
		)
		expect(formatted("‹- One\n- [ ] Two\nThree›", toggleNumberedList)).toBe(
			"‹1. One\n2. Two\n3. Three›",
		)
		expect(formatted("‹1. One\n- Two›", toggleTask)).toBe(
			"‹- [ ] One\n- [ ] Two›",
		)
	})

	it("numbers the touched lines from 1 across blank lines", () => {
		expect(formatted("‹One\n\nTwo\n\n4. Three›", toggleNumberedList)).toBe(
			"1. ‹One\n\n2. Two\n\n3. Three›",
		)
	})

	it("removes the format once every touched line carries it", () => {
		expect(formatted("‹- [ ] One\n- [x] Two›", toggleTask)).toBe("‹One\nTwo›")
		expect(formatted("‹> One\n> Two›", toggleQuote)).toBe("‹One\nTwo›")
	})

	it("keeps the other families on the line", () => {
		expect(formatted("> - ‹Ship›", toggleHeading2)).toBe("> - ## ‹Ship›")
		expect(formatted("## ‹Ship›", toggleBulletList)).toBe("- ## ‹Ship›")
	})

	it("ignores a selection ending at the start of the next line", () => {
		expect(formatted("‹One\n›Two", toggleQuote)).toBe("> ‹One\n›Two")
	})

	it("acts on the caret line", () => {
		expect(formatted("One\nTw‹›o", toggleHeading1)).toBe("One\n# Tw‹›o")
	})
})

describe("toggleCodeBlock", () => {
	it("wraps the touched lines in one fence", () => {
		const result = run("Intro\n‹One\n\nTwo›\nEnd", toggleCodeBlock)
		expect(result.shown).toBe("Intro\n```\n‹One\n\nTwo›\n```\nEnd")
		expect(result.undone()).toBe("Intro\n‹One\n\nTwo›\nEnd")
	})

	it("removes the fence the lines sit in", () => {
		expect(formatted("Intro\n```ts\n‹code›\n```\nEnd", toggleCodeBlock)).toBe(
			"Intro\n‹code›\nEnd",
		)
		expect(formatted("‹```\ncode\n```›", toggleCodeBlock)).toBe("‹code›")
	})

	it("merges a fence the selection reaches into one", () => {
		expect(formatted("‹Intro\n```\ncode›\n```", toggleCodeBlock)).toBe(
			"```\n‹Intro\ncode›\n```",
		)
	})
})

const INLINE_COMMANDS: [name: string, command: StateCommand][] = [
	["bold", toggleBold],
	["italic", toggleItalic],
	["strikethrough", toggleStrikethrough],
	["inline code", toggleInlineCode],
]

const PUNCTUATION_CASES = [
	"Hello‹, world›",
	"Read ‹the brief.›Then ship.",
	"Ship ‹(soon)›now",
	"a‹,›b",
	'Say ‹"yes"›please',
	"‹done!›",
	"end‹.›",
	"snake‹_case›name",
]

const BESIDE_FORMAT_CASES = [
	"**a**‹b›",
	"‹a›**b**",
	"*a*‹b›",
	"~~a~~‹b›",
	"`a`‹b›",
	"**bold**‹ text›",
	"*it*‹ and› more",
	"‹Ship› the **launch**",
]

describe.each(INLINE_COMMANDS)(
	"%s beside punctuation and other formats",
	(_, command) => {
		it.each([...PUNCTUATION_CASES, ...BESIDE_FORMAT_CASES])(
			"reads the format over every character of %s",
			(marked) => {
				const formattedState = stateOf(run(marked, command).shown)
				expect(isFormatOn(formattedState, command)).toBe(true)
			},
		)

		it.each(PUNCTUATION_CASES)("restores %s on a second press", (marked) => {
			expect(formatted(formatted(marked, command), command)).toBe(marked)
		})
	},
)

describe("a run of the same format touching the selection", () => {
	it("merges into one run instead of doubling the markers", () => {
		expect(formatted("**a**‹b›", toggleBold)).toBe("**a‹b›**")
		expect(formatted("‹a›~~b~~", toggleStrikethrough)).toBe("~~‹a›b~~")
	})
})

describe.each([
	[toggleBold, "**"],
	[toggleItalic, "*"],
	[toggleStrikethrough, "~~"],
	[toggleInlineCode, "`"],
])("%s pressed twice beside a run of the same format", (command, marker) => {
	const wrap = (text: string) => `${marker}${text}${marker}`

	it.each([
		["overlapping", `Ship ${wrap("the ‹launch")} today›.`],
		["containing", `‹Ship ${wrap("the")} launch›.`],
		["touching after", `${wrap("Ship")}‹the› launch.`],
		["touching before", `Ship ‹the›${wrap("launch")}.`],
	])(
		"gives back the markdown and the selection of a run %s it",
		(_, before) => {
			const joined = run(before, command).shown
			const result = run(before, command, command)
			expect(joined).not.toBe(before)
			expect(result.shown).toBe(before)
			expect(result.transactions).toHaveLength(2)
			expect(result.undone()).toBe(joined)
		},
	)

	it("follows the add or remove rule once the selection moved in between", () => {
		const before = `${wrap("Ship")}‹the› launch.`
		const moved: StateCommand = (target) => {
			const { selection } = target.state
			target.dispatch(target.state.update({ selection: { anchor: 0 } }))
			target.dispatch(target.state.update({ selection }))
			return true
		}
		expect(run(before, command, moved, command).shown).not.toBe(before)
	})
})

describe("flanking", () => {
	it("widens the markers to the word a punctuation edge touches", () => {
		expect(formatted("Hello‹, world›", toggleBold)).toBe("**Hello‹, world›**")
		expect(formatted("Read ‹the brief.›Then ship.", toggleItalic)).toBe(
			"Read *‹the brief.›Then* ship.",
		)
		expect(formatted("Hello‹, world›", toggleInlineCode)).toBe(
			"Hello`‹, world›`",
		)
	})
})

describe("isFormatOn", () => {
	it("agrees with the inline command over a selection of several paragraphs", () => {
		const bold = stateOf("‹**First note.**\n\n**Second note.**›")
		expect(isFormatOn(bold, toggleBold)).toBe(true)
		expect(isFormatOn(bold, toggleItalic)).toBe(false)
		expect(
			isFormatOn(stateOf("‹**First note.**\n\nSecond note.›"), toggleBold),
		).toBe(false)
	})

	it("answers for the heading level and the list kind the command toggles", () => {
		expect(isFormatOn(stateOf("## ‹Plan›"), toggleHeading2)).toBe(true)
		expect(isFormatOn(stateOf("# ‹Plan›"), toggleHeading2)).toBe(false)
		expect(isFormatOn(stateOf("- ‹Draft›"), toggleBulletList)).toBe(true)
		expect(isFormatOn(stateOf("1. ‹Draft›"), toggleBulletList)).toBe(false)
		expect(isFormatOn(stateOf("1. ‹Draft›"), toggleNumberedList)).toBe(true)
	})
})

describe("selectedLinkOf", () => {
	it("gives the url of the link carrying the selection", () => {
		expect(
			selectedLinkOf(
				stateOf("We met on **the [‹brief›](https://k.app/b) date**."),
			),
		).toEqual({ url: "https://k.app/b" })
	})

	it("gives nothing for a selection reaching outside every link", () => {
		expect(
			selectedLinkOf(stateOf("We ‹met on [the brief](https://k.app/b)›.")),
		).toBe(undefined)
	})
})

describe("a document written outside the app", () => {
	const OUTSIDE = [
		"Launch plan",
		"===========",
		"",
		"* Ship on the __14th__  ",
		"+ Copy is _final_\t",
		"",
		"1) Draft  the notes",
		"",
		"    indented code",
		"",
		"Read the brief ‹today›.   ",
		"",
	].join("\n")

	it.each([
		[toggleBold, "**", "**"],
		[toggleStrikethrough, "~~", "~~"],
		[setLink("https://k.app/b"), "[", "](https://k.app/b)"],
	])("changes nothing but the markers", (command, open, close) => {
		expect(formatted(OUTSIDE, command)).toBe(
			OUTSIDE.replace("‹today›", `${open}‹today›${close}`),
		)
	})

	it("changes nothing but the prefix of a line", () => {
		expect(formatted(OUTSIDE, toggleQuote)).toBe(
			OUTSIDE.replace("Read the", "> Read the"),
		)
	})
})
