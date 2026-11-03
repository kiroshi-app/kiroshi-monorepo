import { describe, expect, it } from "vitest"

import { formatActionsOf } from "./library-document-formats"

type Actions = ReturnType<typeof formatActionsOf>

type RangeAction = Exclude<keyof Actions, "onLink">

const rangeOf = (body: string, selected: string, from = 0) => {
	const start = body.indexOf(selected, from)
	return { start, end: start + selected.length }
}

const writtenBy = (body: string, press: (actions: Actions) => void) => {
	const written: string[] = []
	press(formatActionsOf(body, (markdown) => written.push(markdown)))
	return written
}

const pressed = (body: string, action: RangeAction, selected: string) => {
	const [written] = writtenBy(body, (actions) =>
		actions[action](rangeOf(body, selected)),
	)
	return written ?? body
}

const linkedWith = (body: string, url: string, selected: string) => {
	const [written] = writtenBy(body, (actions) =>
		actions.onLink(url, rangeOf(body, selected)),
	)
	return written ?? body
}

const INLINE_CASES: [RangeAction, string][] = [
	["onBold", "**"],
	["onItalic", "*"],
	["onStrikethrough", "~~"],
	["onCode", "`"],
]

describe("formatActionsOf", () => {
	it("writes once through edit for every press", () => {
		const body = "We ship in May"
		const written = writtenBy(body, (actions) => {
			actions.onBold(rangeOf(body, "ship"))
			actions.onLink("https://kiroshi.app", rangeOf(body, "May"))
			actions.onHeading(rangeOf(body, "We"))
		})

		expect(written).toEqual([
			"We **ship** in May",
			"We ship in [May](https://kiroshi.app)",
			"## We ship in May",
		])
	})

	describe.each(INLINE_CASES)("%s", (action, marker) => {
		it("wraps a range without the format", () => {
			expect(pressed("We ship in May", action, "ship")).toBe(
				`We ${marker}ship${marker} in May`,
			)
		})

		it("removes the markers of a range carrying the format", () => {
			const body = `We ${marker}ship${marker} in May`

			expect(pressed(body, action, "ship")).toBe("We ship in May")
			expect(pressed(body, action, `${marker}ship${marker}`)).toBe(
				"We ship in May",
			)
		})

		it("leaves the body byte-identical after two presses", () => {
			const body = "Intro\n\n## Rollout\n\nWe ship in May.\nThen we tune"
			const once = pressed(body, action, "we tune")

			expect(once).not.toBe(body)
			expect(pressed(once, action, "we tune")).toBe(body)
		})
	})

	it("leaves the spaces around a range outside the markers", () => {
		expect(pressed("We ship in May", "onBold", " ship ")).toBe(
			"We **ship** in May",
		)
	})

	it("extends a range ending inside a run to the whole run", () => {
		expect(pressed("We **ship in** May", "onItalic", "We **ship")).toBe(
			"_We **ship in**_ May",
		)
	})

	it("extends a range edge sitting inside a marker", () => {
		const body = "We **ship** in May"
		const start = body.indexOf("**") + 1

		const [written] = writtenBy(body, (actions) =>
			actions.onStrikethrough({ start, end: body.indexOf(" in") }),
		)

		expect(written).toBe("We ~~**ship**~~ in May")
	})

	it("extends a range inside a link to the whole link", () => {
		const body = "Read [the rollout notes](https://kiroshi.app) first"
		const once = pressed(body, "onBold", "rollout")

		expect(once).toBe("Read **[the rollout notes](https://kiroshi.app)** first")
		expect(pressed(once, "onBold", "rollout")).toBe(body)
	})

	it("removes a format nested inside a link", () => {
		expect(
			pressed(
				"Read [the **rollout**](https://kiroshi.app)",
				"onBold",
				"rollout",
			),
		).toBe("Read [the rollout](https://kiroshi.app)")
	})

	it("wraps a bold run in italic markers that still read as italic", () => {
		const body = "We **ship** in May"
		const once = pressed(body, "onItalic", "**ship**")

		expect(once).toBe("We _**ship**_ in May")
		expect(pressed(once, "onItalic", "ship")).toBe(body)
	})

	it("links a range with the confirmed URL", () => {
		expect(linkedWith("Read the notes", "https://kiroshi.app", "notes")).toBe(
			"Read the [notes](https://kiroshi.app)",
		)
	})

	it("replaces the URL of a range already linked", () => {
		expect(
			linkedWith(
				"Read [notes](https://old.app) first",
				" https://new.app ",
				"notes",
			),
		).toBe("Read [notes](https://new.app) first")
	})

	it("keeps a URL with a space readable as a link", () => {
		expect(linkedWith("Read notes", "https://kiroshi.app/a b", "notes")).toBe(
			"Read [notes](https://kiroshi.app/a%20b)",
		)
	})

	it("removes the link and keeps its text on an empty URL", () => {
		expect(
			linkedWith("Read [notes](https://kiroshi.app) first", "", "notes"),
		).toBe("Read notes first")
	})

	it("writes the body unchanged on an empty URL outside a link", () => {
		expect(linkedWith("Read notes", " ", "notes")).toBe("Read notes")
	})

	it("turns a paragraph into a heading and back", () => {
		const body = "Intro\n\nWe ship in May"
		const once = pressed(body, "onHeading", "ship")

		expect(once).toBe("Intro\n\n## We ship in May")
		expect(pressed(once, "onHeading", "ship")).toBe(body)
	})

	it("turns an item into a heading without its item prefix", () => {
		expect(pressed("- We ship in May", "onHeading", "ship")).toBe(
			"## We ship in May",
		)
	})

	it("turns a heading back into a paragraph whatever its level", () => {
		expect(pressed("# Rollout", "onHeading", "Rollout")).toBe("Rollout")
	})

	it("toggles every line the range touches", () => {
		const body = "Intro\n\nWe ship in May\nThen we tune\nThen we rest"
		const range = {
			start: body.indexOf("May"),
			end: body.indexOf("tune"),
		}
		const [once = body] = writtenBy(body, (actions) => actions.onList(range))

		expect(once).toBe("Intro\n\n- We ship in May\n- Then we tune\nThen we rest")
		const [twice] = writtenBy(once, (actions) =>
			actions.onList(rangeOf(once, "May\n- Then we")),
		)
		expect(twice).toBe(body)
	})

	it("turns a heading into an item without its heading prefix", () => {
		expect(pressed("## Rollout", "onList", "Rollout")).toBe("- Rollout")
	})

	it("turns an item back into a paragraph", () => {
		expect(pressed("Intro\n\n* We ship", "onList", "ship")).toBe(
			"Intro\n\nWe ship",
		)
	})
})
