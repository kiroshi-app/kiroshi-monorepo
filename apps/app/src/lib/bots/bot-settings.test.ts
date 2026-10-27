import { describe, expect, it } from "vitest"

import {
	BLANK_BOT_PERMISSIONS,
	BLOT_TINTS,
} from "@workspace/ui/components/bot-settings"
import { HUE_PRESETS } from "@workspace/ui/components/hue-tones"

import {
	BOT_NAMES,
	CHANGING_TOOLS,
	changesRuntime,
	deniesChanges,
	FALLBACK_MODELS,
	modelOptionsFor,
	newBotIdentity,
	toIdentity,
	toRosterBots,
	toSettingsValue,
} from "./bot-settings"

import { avatarSrc } from "../host"
import type { Bot } from "../conversations/store-contract"
import { botIdentity } from "../conversations/transcript-fixtures"

const bot = (overrides: Partial<Bot> = {}): Bot => {
	const described = {
		...botIdentity(),
		id: "b-1",
		createdAt: 1,
		memory: "",
		sectionId: null,
		pinPosition: null,
		...overrides,
	}
	return { ...described, changesNothing: deniesChanges(described.deniedTools) }
}

describe("toSettingsValue", () => {
	it("hands the panel every field a companion was described with", () => {
		expect(
			toSettingsValue(
				bot({
					name: "Nyx",
					title: "Reviewer",
					instructions: "Answer briefly.",
					model: "haiku",
					avatarBlot: 132,
				}),
			),
		).toEqual({
			identity: { blot: 132, image: undefined },
			name: "Nyx",
			title: "Reviewer",
			instructions: "Answer briefly.",
			model: "haiku",
			effort: null,
			permissions: BLANK_BOT_PERMISSIONS,
		})
	})

	it("reads the effort the companion was saved with", () => {
		expect(toSettingsValue(bot({ effort: "xhigh" })).effort).toBe("xhigh")
	})

	it("hands the panel a hue outside the presets as it was stored", () => {
		expect(toSettingsValue(bot({ avatarBlot: 210 })).identity.blot).toBe(210)
	})

	it("reads a companion nobody marked as wearing no blot", () => {
		expect(toSettingsValue(bot({ avatarBlot: null })).identity.blot).toBeNull()
	})
})

describe("changesRuntime", () => {
	const stored = bot({ instructions: "Answer briefly." })
	const value = toSettingsValue(stored)

	it("says so for the effort, like the model", () => {
		expect(changesRuntime(stored, { ...value, effort: "high" })).toBe(true)
		expect(
			changesRuntime(bot({ effort: "high" }), {
				...toSettingsValue(bot({ effort: "high" })),
				effort: null,
			}),
		).toBe(true)
	})

	it("says so for the instructions, the model and the permissions", () => {
		expect(
			changesRuntime(stored, { ...value, instructions: "Answer at length." }),
		).toBe(true)
		expect(changesRuntime(stored, { ...value, model: "haiku" })).toBe(true)
		expect(
			changesRuntime(stored, {
				...value,
				permissions: { ...BLANK_BOT_PERMISSIONS, deny: CHANGING_TOOLS },
			}),
		).toBe(true)
		expect(
			changesRuntime(stored, {
				...value,
				permissions: { ...BLANK_BOT_PERMISSIONS, defaultMode: "plan" },
			}),
		).toBe(true)
		expect(
			changesRuntime(bot({ deniedTools: ["WebFetch"] }), {
				...toSettingsValue(bot({ deniedTools: ["WebFetch"] })),
			}),
		).toBe(false)
	})

	it("says nothing for a field the process was never started with", () => {
		expect(changesRuntime(stored, value)).toBe(false)
		expect(changesRuntime(stored, { ...value, name: "Nyx" })).toBe(false)
		expect(
			changesRuntime(stored, {
				...value,
				identity: { blot: 257 },
			}),
		).toBe(false)
	})
})

describe("toIdentity", () => {
	const stored = bot({ avatarImagePath: "/pictures/owl.png" })

	it("keeps the stored path while the value still carries a picture", () => {
		const value = toSettingsValue(stored)

		expect(toIdentity(value, stored).avatarImagePath).toBe("/pictures/owl.png")
	})

	it("takes the picture off when the value carries none", () => {
		const value = toSettingsValue(stored)

		expect(
			toIdentity({ ...value, identity: { blot: 82 } }, stored),
		).toMatchObject({
			avatarBlot: 82,
			avatarImagePath: null,
		})
	})

	it("writes a blot the reader cleared as an absence", () => {
		const value = toSettingsValue(stored)

		expect(toIdentity({ ...value, identity: {} }, stored).avatarBlot).toBeNull()
	})

	it("writes a blot the reader set to no colour as an absence", () => {
		const value = toSettingsValue(stored)

		expect(
			toIdentity({ ...value, identity: { blot: null } }, stored).avatarBlot,
		).toBeNull()
	})

	it("writes a hue outside the presets over the preset it replaces", () => {
		const blue = bot({ avatarBlot: 257 })
		const value = toSettingsValue(blue)

		expect(
			toIdentity({ ...value, identity: { blot: 210 } }, blue).avatarBlot,
		).toBe(210)
	})

	it("carries the style the companion already answers under", () => {
		const styled = bot({ outputStyle: "default" })

		expect(
			toIdentity({ ...toSettingsValue(styled), name: "Nyx" }, styled)
				.outputStyle,
		).toBe("default")
	})

	it("writes the effort the panel was left with, Default as null", () => {
		const tuned = bot({ effort: "high" })
		const value = toSettingsValue(tuned)

		expect(toIdentity({ ...value, effort: "max" }, tuned).effort).toBe("max")
		expect(toIdentity({ ...value, effort: null }, tuned).effort).toBeNull()
	})

	it("writes the model label it was given, whatever it is", () => {
		const value = toSettingsValue(stored)

		for (const model of [...FALLBACK_MODELS, "claude-opus-4-1-20250805"]) {
			expect(toIdentity({ ...value, model }, stored).model).toBe(model)
		}
	})
})

describe("toIdentity, on the tools a companion is denied", () => {
	it("hands the four tools of the retired switch over to the deny list", () => {
		const thrown = bot({ deniedTools: [...CHANGING_TOOLS, "WebFetch"] })
		const value = toSettingsValue(thrown)

		expect(toIdentity(value, thrown).deniedTools).toEqual(["WebFetch"])
	})

	it("writes the rules the panel was left with", () => {
		const held = bot()
		const permissions = {
			...BLANK_BOT_PERMISSIONS,
			defaultMode: "plan" as const,
			deny: ["Bash(rm:*)"],
		}

		expect(
			toIdentity({ ...toSettingsValue(held), permissions }, held).permissions,
		).toEqual(permissions)
	})

	it("carries the companion's own denials through a write that says nothing about them", () => {
		const held = bot({ deniedTools: ["WebFetch"] })

		expect(
			toIdentity({ ...toSettingsValue(held), name: "Nyx" }, held).deniedTools,
		).toEqual(["WebFetch"])
	})
})

describe("modelOptionsFor", () => {
	const CATALOGUE = [
		"quasar",
		"quasar[1m]",
		"claude-quasar-5",
		"claude-quasar-4-1",
		"sonnet",
		"claude-sonnet-5",
		"best",
	]
	const OFFERED = CATALOGUE.map((value) => ({
		value,
		supportedEffortLevels: [],
	}))

	it("offers what the machine carries, in the order it was given", () => {
		expect(
			modelOptionsFor("sonnet", OFFERED).map((option) => option.value),
		).toEqual(CATALOGUE)
	})

	it("labels every value with itself", () => {
		expect(modelOptionsFor("quasar", OFFERED)).toContainEqual({
			label: "claude-quasar-5",
			value: "claude-quasar-5",
			supportedEfforts: [],
		})
	})

	it("falls back to the aliases every build knows when nothing was read", () => {
		expect(modelOptionsFor("sonnet", []).map((option) => option.value)).toEqual(
			FALLBACK_MODELS,
		)
	})

	it("offers a label of its own back so the companion can be seen on it", () => {
		const read = modelOptionsFor("claude-mythos-preview", OFFERED)
		const fallen = modelOptionsFor("claude-mythos-preview", [])

		expect(read).toHaveLength(CATALOGUE.length + 1)
		expect(read.at(-1)).toEqual({
			label: "claude-mythos-preview",
			value: "claude-mythos-preview",
			supportedEfforts: [],
		})
		expect(fallen.at(-1)?.value).toBe("claude-mythos-preview")
	})

	it("puts opus first on the fallback list", () => {
		expect(modelOptionsFor("sonnet", [])[0]?.value).toBe("opus")
	})

	it("carries the effort levels every model supports", () => {
		expect(
			modelOptionsFor("opus", [
				{ value: "opus", supportedEffortLevels: ["low", "high", "max"] },
				{ value: "haiku", supportedEffortLevels: [] },
			]).map((option) => option.supportedEfforts),
		).toEqual([["low", "high", "max"], []])
	})

	it("offers no effort level on the fallback list", () => {
		expect(
			modelOptionsFor("sonnet", []).every(
				(option) => option.supportedEfforts.length === 0,
			),
		).toBe(true)
	})

	it("leaves default out of what the catalogue carries", () => {
		const values = modelOptionsFor("sonnet", [
			{ value: "default", supportedEffortLevels: ["high"] },
			...OFFERED,
		]).map((option) => option.value)

		expect(values).toEqual(CATALOGUE)
	})

	it("does not offer default back when the companion carries it", () => {
		expect(
			modelOptionsFor("default", OFFERED).map((option) => option.value),
		).toEqual(CATALOGUE)
		expect(
			modelOptionsFor("default", []).map((option) => option.value),
		).toEqual(FALLBACK_MODELS)
	})
})

describe("newBotIdentity", () => {
	const rosterCarrying = (names: readonly string[]): Bot[] =>
		names.map((name, index) => bot({ id: `b-${index}`, name }))

	it("names a companion before it is named", () => {
		const created = newBotIdentity([bot({ avatarBlot: 42 })])

		expect(BOT_NAMES).toContain(created.name)
		expect(created).toMatchObject({
			title: "",
			instructions: "",
			avatarImagePath: null,
		})
	})

	it("marks a companion with a tint nobody in the roster is marked with", () => {
		const [spared, ...marked] = BLOT_TINTS

		expect(newBotIdentity([]).avatarBlot).toBe(HUE_PRESETS[spared])
		expect(
			newBotIdentity(
				marked.map((blot, index) =>
					bot({ id: `b-${index}`, avatarBlot: HUE_PRESETS[blot] }),
				),
			).avatarBlot,
		).toBe(HUE_PRESETS[spared])
	})

	it("marks from the whole list once every tint is taken", () => {
		const roster = BLOT_TINTS.map((blot, index) =>
			bot({ id: `b-${index}`, avatarBlot: HUE_PRESETS[blot] }),
		)

		expect(BLOT_TINTS.map((blot) => HUE_PRESETS[blot])).toContain(
			newBotIdentity(roster).avatarBlot,
		)
	})

	it("marks each new companion with the next preset hue nobody wears", () => {
		const roster: Bot[] = []
		for (const index of BLOT_TINTS.keys()) {
			roster.push(bot({ id: `b-${index}`, ...newBotIdentity(roster) }))
		}

		expect(roster.map((companion) => companion.avatarBlot)).toEqual([
			42, 82, 132, 186, 257, 296, 358, 63,
		])
	})

	it("creates a companion on the concise style", () => {
		expect(newBotIdentity([]).outputStyle).toBe("Concise")
	})

	it("offers at least thirty names to draw from", () => {
		expect(new Set(BOT_NAMES).size).toBeGreaterThanOrEqual(30)
	})

	it("draws a name nobody in the roster carries", () => {
		const [spared, ...carried] = BOT_NAMES

		expect(newBotIdentity(rosterCarrying(carried)).name).toBe(spared)
	})

	it("draws from the whole list once every name is carried", () => {
		expect(BOT_NAMES).toContain(newBotIdentity(rosterCarrying(BOT_NAMES)).name)
	})

	it("drafts a companion on opus", () => {
		expect(newBotIdentity([]).model).toBe("opus")
	})

	it("records an alias rather than a versioned name", () => {
		const { model } = newBotIdentity([])

		expect(FALLBACK_MODELS).toContain(model)
		expect(model).not.toMatch(/\d/)
	})
})

describe("toRosterBots", () => {
	const roster = [
		bot({
			id: "b-1",
			name: "Atlas",
			title: "Research",
			sectionId: "n-1",
			pinPosition: 2,
		}),
		bot({ id: "b-2", name: "Beacon", title: "" }),
	]

	const NOW = new Date(2025, 2, 12, 21, 30).getTime()
	const TODAY = new Date(2025, 2, 12, 9, 24).getTime()
	const YESTERDAY = new Date(2025, 2, 11).getTime()

	it("reads the name, the title, the face and the pin off the record", () => {
		const [atlas, beacon] = toRosterBots(
			roster,
			{ working: {}, previews: {} },
			NOW,
		)

		expect(atlas).toMatchObject({
			id: "b-1",
			name: "Atlas",
			title: "Research",
			blot: 132,
			sectionId: "n-1",
			pinPosition: 2,
		})
		expect(beacon.title).toBeUndefined()
		expect(beacon.pinPosition).toBeNull()
	})

	it("gives every companion the working state of its own process", () => {
		const [atlas, beacon] = toRosterBots(
			roster,
			{
				working: {
					"b-1": { isWorking: true, kind: "writing" },
					"b-2": { isWorking: true, kind: "searching" },
				},
				previews: {},
			},
			NOW,
		)

		expect(atlas).toMatchObject({ status: "working", pose: "writing" })
		expect(beacon).toMatchObject({ status: "working", pose: "searching" })
	})

	it("gives every companion the last word of its own conversation", () => {
		const [atlas, beacon] = toRosterBots(
			roster,
			{
				working: {},
				previews: { "b-1": { text: "Pulled the three papers.", at: TODAY } },
			},
			NOW,
		)

		expect(atlas.lastMessage).toBe("Pulled the three papers.")
		expect(beacon.lastMessage).toBeUndefined()
	})

	it("labels a row with the age of the word it previews", () => {
		const [atlas, beacon] = toRosterBots(
			roster,
			{
				working: {},
				previews: { "b-1": { text: "Pulled the three papers.", at: TODAY } },
			},
			NOW,
		)

		expect(atlas.timestamp).toBe("12h")
		expect(beacon.timestamp).toBeUndefined()
	})

	it("labels a row whose last message said nothing", () => {
		const [atlas] = toRosterBots(
			roster,
			{ working: {}, previews: { "b-1": { at: TODAY } } },
			NOW,
		)

		expect(atlas.lastMessage).toBeUndefined()
		expect(atlas.timestamp).toBe("12h")
	})

	it("labels every row of one roster from the one clock it was given", () => {
		const [atlas, beacon] = toRosterBots(
			roster,
			{
				working: {},
				previews: {
					"b-1": { text: "Today", at: TODAY },
					"b-2": { text: "A day back", at: YESTERDAY },
				},
			},
			NOW,
		)

		expect(atlas.timestamp).toBe("12h")
		expect(beacon.timestamp).toBe("1d")
	})

	it("leaves a companion with no process of its own idle", () => {
		const [atlas, beacon] = toRosterBots(
			roster,
			{ working: { "b-1": { isWorking: false } }, previews: {} },
			NOW,
		)

		expect(atlas).toMatchObject({ status: "idle", pose: undefined })
		expect(beacon).toMatchObject({ status: "idle", pose: undefined })
	})

	it("leaves a companion nobody marked without a blot rather than with a default one", () => {
		const [bare] = toRosterBots(
			[bot({ avatarBlot: null })],
			{ working: {}, previews: {} },
			NOW,
		)

		expect(bare.blot).toBeNull()
	})

	it("hands the roster a hue outside the presets as it was stored", () => {
		const [free] = toRosterBots(
			[bot({ avatarBlot: 210 })],
			{ working: {}, previews: {} },
			NOW,
		)

		expect(free.blot).toBe(210)
	})

	it("puts the companion that spoke last above the one that spoke earlier", () => {
		const ordered = toRosterBots(
			roster,
			{
				working: {},
				previews: {
					"b-1": { text: "A day back", at: YESTERDAY },
					"b-2": { text: "Today", at: TODAY },
				},
			},
			NOW,
		)

		expect(ordered.map((bot) => bot.id)).toEqual(["b-2", "b-1"])
	})

	it("sorts a companion that never spoke on the day it was created", () => {
		const ordered = toRosterBots(
			[
				bot({ id: "b-1", createdAt: new Date(2025, 2, 10).getTime() }),
				bot({ id: "b-2", createdAt: TODAY }),
			],
			{
				working: {},
				previews: {
					"b-1": { text: "Yesterday", at: YESTERDAY },
				},
			},
			NOW,
		)

		expect(ordered.map((bot) => bot.id)).toEqual(["b-2", "b-1"])
	})

	it("holds two companions carrying the same time in the order it read them", () => {
		const ordered = toRosterBots(roster, { working: {}, previews: {} }, NOW)

		expect(ordered.map((bot) => bot.id)).toEqual(["b-1", "b-2"])
	})

	it("passes an uploaded picture through and leaves a companion without one bare", () => {
		const [worn, drawn] = toRosterBots(
			[
				bot({ id: "b-1", avatarImagePath: "/pictures/owl.png" }),
				bot({ id: "b-2", avatarImagePath: null }),
			],
			{ working: {}, previews: {} },
			NOW,
		)

		expect(worn.image).toBe(avatarSrc("/pictures/owl.png"))
		expect(drawn.image).toBeUndefined()
	})
})
