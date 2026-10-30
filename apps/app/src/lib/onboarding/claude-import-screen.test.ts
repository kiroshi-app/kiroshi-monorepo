import { describe, expect, it, vi } from "vitest"

import "@workspace/ui/lib/i18n"
import type {
	ImportItem,
	ImportScreenProps,
} from "@workspace/ui/components/import-screen"

import type { ClaudeImportSession } from "./claude-import-controller"
import {
	type ClaudeImportActions,
	type ClaudeImportVariant,
	hasNewClaudeItem,
	importedOf,
	importScreenPropsOf,
	isImportOfferedAtStart,
	offersClaudeImport,
	pickedKeysOf,
} from "./claude-import-screen"

import type { ClaudeInventory, ClaudeItem } from "@/lib/bindings"

const itemOf = (key: string, name: string, alreadyImported = false) => ({
	key,
	name,
	description: `${name} description`,
	alreadyImported,
})

const ATLAS = itemOf("agent:atlas", "Atlas")
const WREN = itemOf("agent:wren", "Wren")
const CLAUDE_MD = itemOf("claude-md", "CLAUDE.md")
const SKILLS = [
	"commit-style",
	"test-first",
	"review-checklist",
	"changelog",
].map((name) => itemOf(`skill:${name}`, name))

type FoundItems = {
	agents?: ClaudeItem[]
	skills?: ClaudeItem[]
	claudeMd?: ClaudeItem | null
}

const found = ({
	agents = [],
	skills = [],
	claudeMd = null,
}: FoundItems): ClaudeInventory => ({ kind: "found", agents, skills, claudeMd })

const FULL = found({
	agents: [ATLAS, WREN],
	skills: SKILLS,
	claudeMd: CLAUDE_MD,
})

const sessionOf = (
	fields: Partial<ClaudeImportSession> = {},
): ClaudeImportSession => ({
	unchecked: [],
	selection: [],
	results: {},
	isImporting: false,
	...fields,
})

const actions: ClaudeImportActions = {
	onToggle: vi.fn(),
	onImport: vi.fn(),
	onRetryFailed: vi.fn(),
	onReadAgain: vi.fn(),
	onLeave: vi.fn(),
}

type PropsInput = {
	inventory?: ClaudeInventory
	session?: ClaudeImportSession
	variant?: ClaudeImportVariant
}

const propsOf = ({
	inventory = FULL,
	session = sessionOf(),
	variant = "onboarding",
}: PropsInput = {}) =>
	importScreenPropsOf({ variant, inventory, session }, actions)

const itemsIn = (props: ImportScreenProps) =>
	"items" in props ? props.items : []

const kindsIn = (props: ImportScreenProps) => [
	...new Set(itemsIn(props).map((item) => item.kind)),
]

const itemIn = (props: ImportScreenProps, id: string) =>
	itemsIn(props).find((item) => item.id === id)

const subtitleIn = (props: ImportScreenProps) =>
	"subtitle" in props ? props.subtitle : undefined

const allKeys = [ATLAS, WREN, CLAUDE_MD, ...SKILLS].map((item) => item.key)

const imported = (keys: string[]) =>
	Object.fromEntries(
		keys.map((key) => [key, { kind: "imported" as const, id: key, name: key }]),
	)

describe("the select step", () => {
	it("lists every agent, CLAUDE.md and skill, all checked", () => {
		const props = propsOf()

		expect(props.step).toBe("select")
		expect(props.title).toBe("Bring in your Claude Code setup")
		expect(kindsIn(props)).toEqual(["companion", "instructions", "skill"])
		expect(itemsIn(props).map((item) => item.id)).toEqual(allKeys)
		expect(itemsIn(props).every((item) => item.checked)).toBe(true)
		expect(itemIn(props, "claude-md")?.kind).toBe("instructions")
		expect(props.primary.label).toBe("Import 7 items")
		expect(props.secondary?.label).toBe("Skip for now")
	})

	it("hands a toggle and Import to their actions", () => {
		const props = propsOf()
		if (props.step !== "select") throw new Error("Expected the select step")

		props.onToggle("agent:wren", false)
		props.primary.onPress()
		props.secondary?.onPress()

		expect(actions.onToggle).toHaveBeenCalledWith("agent:wren", false)
		expect(actions.onImport).toHaveBeenCalledOnce()
		expect(actions.onLeave).toHaveBeenCalledOnce()
	})

	it("C01 lists only the agents card and counts agents", () => {
		const props = propsOf({ inventory: found({ agents: [ATLAS, WREN] }) })

		expect(kindsIn(props)).toEqual(["companion"])
		expect(props.primary.label).toBe("Import 2 agents")
	})

	it("C02 lists only the instructions and skills card", () => {
		const props = propsOf({
			inventory: found({ skills: SKILLS, claudeMd: CLAUDE_MD }),
		})

		expect(kindsIn(props)).toEqual(["instructions", "skill"])
		expect(props.primary.label).toBe("Import 5 items")
	})

	it("C03 counts the agents of a long list in the subtitle", () => {
		const agents = Array.from({ length: 10 }, (_, index) =>
			itemOf(`agent:${index}`, `Agent ${index}`),
		)
		const props = propsOf({
			inventory: found({ agents, skills: SKILLS, claudeMd: CLAUDE_MD }),
		})

		expect(subtitleIn(props)).toBe(
			"Found 10 agents and more in ~/.claude. Everything is selected; uncheck what you’d rather leave behind.",
		)
		expect(props.primary.label).toBe("Import 15 items")
	})

	it("C04 says nothing is selected once every row is unchecked", () => {
		const props = propsOf({ session: sessionOf({ unchecked: allKeys }) })

		expect(subtitleIn(props)).toBe(
			"Nothing is selected. Check what you want to bring in, or skip for now.",
		)
		expect(props.primary.label).toBe("Import")
		expect(itemsIn(props).some((item) => item.checked)).toBe(false)
	})

	it("picks only the checked items not imported yet", () => {
		const inventory = found({
			agents: [ATLAS, itemOf("agent:wren", "Wren", true)],
			skills: SKILLS.slice(0, 1),
		})

		expect(
			pickedKeysOf(inventory, sessionOf({ unchecked: ["agent:atlas"] })),
		).toEqual(["skill:commit-style"])
	})
})

describe("the importing step", () => {
	it("marks each picked row from the progress received", () => {
		const props = propsOf({
			session: sessionOf({
				selection: ["agent:atlas", "agent:wren"],
				results: imported(["agent:atlas"]),
				isImporting: true,
			}),
		})

		expect(props.step).toBe("importing")
		expect(props.primary.label).toBe("Importing…")
		expect(itemIn(props, "agent:atlas")?.status).toBe("done")
		expect(itemIn(props, "agent:wren")?.status).toBeUndefined()
		expect(itemIn(props, "claude-md")?.checked).toBe(false)
	})
})

describe("the done step", () => {
	it("shows every picked row done and continues on Continue", () => {
		const props = propsOf({
			session: sessionOf({ selection: allKeys, results: imported(allKeys) }),
		})
		props.primary.onPress()

		expect(props.step).toBe("done")
		expect(props.title).toBe("Your setup is in")
		expect(props.primary.label).toBe("Continue")
		expect(props.secondary).toBeUndefined()
		expect(itemsIn(props).every((item) => item.status === "done")).toBe(true)
		expect(actions.onLeave).toHaveBeenCalled()
	})

	it("counts an item the host had already imported as done", () => {
		const props = propsOf({
			session: sessionOf({
				selection: ["agent:atlas"],
				results: {
					"agent:atlas": { kind: "skipped", reason: "alreadyImported" },
				},
			}),
		})

		expect(itemIn(props, "agent:atlas")?.status).toBe("done")
	})

	it("C05 names both names on a row imported under another name", () => {
		const props = propsOf({
			session: sessionOf({
				selection: ["agent:atlas"],
				results: {
					"agent:atlas": { kind: "imported", id: "bot-2", name: "Atlas 2" },
				},
			}),
		})

		expect(itemIn(props, "agent:atlas")).toMatchObject<Partial<ImportItem>>({
			title: "Atlas 2",
			detail:
				"Atlas already lives in Kiroshi, so this one comes in as Atlas 2. Rename it after.",
		})
	})

	it("C07 shows the host cause on a failed row and retries the failed ones", () => {
		const props = propsOf({
			session: sessionOf({
				selection: allKeys,
				results: {
					...imported(allKeys),
					"skill:changelog": { kind: "failed", cause: "SKILL.md is empty" },
				},
			}),
		})
		props.secondary?.onPress()

		expect(props.title).toBe("Most of your setup is in")
		expect(itemIn(props, "skill:changelog")).toMatchObject<Partial<ImportItem>>(
			{ status: "failed", detail: "SKILL.md is empty" },
		)
		expect(props.secondary?.label).toBe("Try changelog again")
		expect(actions.onRetryFailed).toHaveBeenCalledOnce()
		expect(props.primary.label).toBe("Continue")
	})
})

describe("the unreadable step", () => {
	it("C06 offers Try again and Skip when ~/.claude is refused", () => {
		const props = propsOf({
			inventory: { kind: "refused", cause: "permission denied" },
		})
		props.primary.onPress()

		expect(props.step).toBe("unreadable")
		expect(props.title).toBe("Couldn’t read ~/.claude")
		expect(props.primary.label).toBe("Try again")
		expect(props.secondary?.label).toBe("Skip for now")
		expect(actions.onReadAgain).toHaveBeenCalledOnce()
	})
})

describe("the variant from Settings", () => {
	it("C08 disables what is already imported and closes on Cancel", () => {
		const props = propsOf({
			variant: "fromSettings",
			inventory: found({
				agents: [itemOf("agent:atlas", "Atlas", true)],
				skills: [SKILLS[0] as ClaudeItem, itemOf("skill:old", "old", true)],
			}),
		})

		expect(props.title).toBe("Import from Claude Code")
		expect(subtitleIn(props)).toBe(
			"Found in ~/.claude. What’s already in Kiroshi stays as it is; only what’s new is selected.",
		)
		expect(itemIn(props, "agent:atlas")).toMatchObject<Partial<ImportItem>>({
			checked: false,
			isInKiroshi: true,
		})
		expect(itemIn(props, "skill:commit-style")?.checked).toBe(true)
		expect(props.primary.label).toBe("Import 1 item")
		expect(props.secondary?.label).toBe("Cancel")
	})
})

describe("the leave action", () => {
	const REFUSED: ClaudeInventory = { kind: "refused", cause: "denied" }

	it.each<[ClaudeImportVariant, string]>([
		["onboarding", "Skip for now"],
		["atStart", "Not now"],
		["fromSettings", "Cancel"],
	])(
		"on the %s screen reads %s on the select and unreadable steps",
		(variant, label) => {
			const select = propsOf({ variant })
			const unreadable = propsOf({ variant, inventory: REFUSED })

			expect(select.step).toBe("select")
			expect(select.secondary?.label).toBe(label)
			expect(unreadable.step).toBe("unreadable")
			expect(unreadable.secondary?.label).toBe(label)
		},
	)

	it("keeps the onboarding title and body on the screen shown at start", () => {
		const props = propsOf({ variant: "atStart" })

		expect(props.title).toBe("Bring in your Claude Code setup")
		expect(subtitleIn(props)).toBe(
			"Found in ~/.claude on your computer. Everything is selected; uncheck what you’d rather leave behind.",
		)
	})
})

describe("what came in", () => {
	const COMMIT_STYLE = "skill:commit-style"

	it("names the companions under their imported name and counts CLAUDE.md and skills", () => {
		const session = sessionOf({
			selection: [ATLAS.key, WREN.key, CLAUDE_MD.key, COMMIT_STYLE],
			results: {
				[ATLAS.key]: { kind: "imported", id: "bot-atlas", name: "Atlas 2" },
				[WREN.key]: { kind: "imported", id: "bot-wren", name: "Wren" },
				[CLAUDE_MD.key]: { kind: "imported", id: "md", name: "CLAUDE.md" },
				[COMMIT_STYLE]: { kind: "imported", id: "s", name: "commit" },
			},
		})

		expect(importedOf(FULL, session)).toEqual({
			companions: ["Atlas 2", "Wren"],
			hasInstructions: true,
			skillCount: 1,
		})
	})

	it("leaves out what failed or was already in Kiroshi", () => {
		const session = sessionOf({
			selection: [ATLAS.key, CLAUDE_MD.key, COMMIT_STYLE],
			results: {
				[ATLAS.key]: { kind: "failed", cause: "unparsable" },
				[CLAUDE_MD.key]: { kind: "skipped", reason: "alreadyImported" },
				[COMMIT_STYLE]: { kind: "failed", cause: "unparsable" },
			},
		})

		expect(importedOf(FULL, session)).toEqual({
			companions: [],
			hasInstructions: false,
			skillCount: 0,
		})
	})
})

describe("whether the import is offered", () => {
	it("offers it on a found item or a refused folder, never on an absent or empty one", () => {
		expect(offersClaudeImport(FULL)).toBe(true)
		expect(offersClaudeImport({ kind: "refused", cause: "denied" })).toBe(true)
		expect(offersClaudeImport({ kind: "absent" })).toBe(false)
		expect(offersClaudeImport(found({}))).toBe(false)
		expect(offersClaudeImport(null)).toBe(false)
	})

	it("sees a new item only when one is not imported yet", () => {
		expect(hasNewClaudeItem(FULL)).toBe(true)
		expect(
			hasNewClaudeItem(found({ agents: [itemOf("agent:a", "A", true)] })),
		).toBe(false)
	})

	it("offers it at start once the onboarding is done and the offer unseen", () => {
		const done = {
			onboardingStep: "done" as const,
			onboardingImportSeen: false,
		}

		expect(isImportOfferedAtStart(done, FULL)).toBe(true)
		expect(
			isImportOfferedAtStart({ ...done, onboardingImportSeen: true }, FULL),
		).toBe(false)
		expect(
			isImportOfferedAtStart({ ...done, onboardingStep: "import" }, FULL),
		).toBe(false)
		expect(isImportOfferedAtStart({ onboardingStep: "done" }, FULL)).toBe(false)
		expect(isImportOfferedAtStart(done, { kind: "absent" })).toBe(false)
	})
})
