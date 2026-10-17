import { describe, expect, it } from "bun:test"

import { claudeSourceExecutable } from "./build"
import { EXECUTABLE_OVERRIDE_ENV } from "./executable"
import { CONNECTION_KEYS } from "./session-env"
import { namingOf, titleOptions, titlePrompt } from "./title"

process.env[EXECUTABLE_OVERRIDE_ENV] = claudeSourceExecutable()

describe("titleOptions", () => {
	it("spawns the binary with the held source", () => {
		const env = titleOptions({ ANTHROPIC_API_KEY: "sk-held" }).env

		expect(env.ANTHROPIC_API_KEY).toBe("sk-held")
	})

	it("spawns the binary with neither name while no source is held", () => {
		const env = titleOptions().env

		for (const key of CONNECTION_KEYS) {
			expect(env).not.toHaveProperty(key)
		}
	})

	it("asks before any tool rather than leaving the mode to Claude Code", () => {
		expect(titleOptions().permissionMode).toBe("default")
	})
})

describe("namingOf", () => {
	it("reads the title on the first line and the listed icon on the second", () => {
		expect(namingOf("Migrer la base de données\nServer")).toEqual({
			title: "Migrer la base de données",
			icon: "Server",
		})
	})

	it("answers the icon spelled as the list spells it", () => {
		expect(namingOf("Fix the crash on launch\n  bug  ")).toEqual({
			title: "Fix the crash on launch",
			icon: "Bug",
		})
	})

	it("keeps the title with no icon when the named icon is not listed", () => {
		expect(namingOf("Fix the crash on launch\nBeetle")).toEqual({
			title: "Fix the crash on launch",
			icon: null,
		})
	})

	it("keeps the title with no icon when the provider answered a title only", () => {
		expect(namingOf("A short title")).toEqual({
			title: "A short title",
			icon: null,
		})
	})

	it("reads the first listed icon of a later line past an explanation", () => {
		expect(namingOf("A short title\nits explanation\nRocket")).toEqual({
			title: "A short title",
			icon: "Rocket",
		})
	})

	it("skips the blank lines the provider opened with", () => {
		expect(namingOf("\n\n  A short title  \n\nPen\n")).toEqual({
			title: "A short title",
			icon: "Pen",
		})
	})

	it("cuts a long title down to sixty characters", () => {
		expect(namingOf(`${"x".repeat(120)}\nCode`)).toEqual({
			title: "x".repeat(60),
			icon: "Code",
		})
	})

	it.each([
		["a label", "Ship the beta\nIcon: Rocket"],
		["bold", "Ship the beta\n**Rocket**"],
		["a full stop", "Ship the beta\nRocket."],
		["backticks", "Ship the beta\n`Rocket`"],
		["a bolded label", "Ship the beta\n**Icon:** Rocket"],
		["one line split by a bar", "Ship the beta | Rocket"],
		["one line split by a dash", "Ship the beta - Rocket"],
		["one line split by a colon", "Ship the beta: Rocket"],
		["one line ending in a bold icon", "Ship the beta **Rocket**"],
	])("reads the listed icon through %s", (_, answer) => {
		expect(namingOf(answer)).toEqual({ title: "Ship the beta", icon: "Rocket" })
	})

	it("keeps a one line title whole when no listed icon closes it", () => {
		expect(namingOf("L'équipe du jour")).toEqual({
			title: "L'équipe du jour",
			icon: null,
		})
		expect(namingOf("Fix the user's Bug")).toEqual({
			title: "Fix the user's Bug",
			icon: null,
		})
	})

	it("keeps the title with no icon when a decorated line names no listed icon", () => {
		expect(namingOf("Ship the beta\nIcon: **Beetle**")).toEqual({
			title: "Ship the beta",
			icon: null,
		})
		expect(namingOf("Ship the beta - Beetle")).toEqual({
			title: "Ship the beta - Beetle",
			icon: null,
		})
	})

	it("answers no naming at all for an empty answer", () => {
		expect(namingOf("")).toBeNull()
		expect(namingOf("   \n  \n")).toBeNull()
	})
})

describe("titlePrompt", () => {
	it("shows one literal two line answer the parser reads back", () => {
		const prompt = titlePrompt("We ship the beta on Monday")

		expect(prompt).toContain(
			"\n\nShip the beta to the first testers\nRocket\n\n",
		)
		expect(namingOf("Ship the beta to the first testers\nRocket")).toEqual({
			title: "Ship the beta to the first testers",
			icon: "Rocket",
		})
		expect(prompt.endsWith("We ship the beta on Monday")).toBe(true)
	})
})
