// @vitest-environment happy-dom

import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { usePlugin } from "./use-plugin"

import { UNDONE_TITLE_PREFIX } from "../bots/history-runs"
import { createFakeTranscriptStore } from "../conversations/fake-transcript-store"
import {
	botPlugin,
	spacePlugin,
	USER_PLUGIN,
} from "../conversations/plugin-scope"
import type { BotSkill, PluginScope } from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"
import { createQueryTestWrapper } from "../query/query-test-wrapper"

afterEach(cleanup)

const A_SKILL = {
	name: "Release notes",
	description: "How this project words a changelog entry",
	body: "One line per change.",
}

const A_COMPANION = botPlugin("default")

const settled = () =>
	act(async () => {
		for (let round = 0; round < 5; round += 1) {
			await new Promise((resolve) => setTimeout(resolve, 0))
		}
	})

const readers = (skills: BotSkill[]) =>
	skills.filter((skill) => !skill.isSystem)

type OpenScope = { scope: PluginScope | null }

const mounted = (store: TranscriptStore, scope: PluginScope | null) => {
	const { result, rerender } = renderHook(
		({ scope: open }: OpenScope) => usePlugin(store, open),
		{ wrapper: createQueryTestWrapper().wrapper, initialProps: { scope } },
	)
	const acting =
		<Args extends unknown[]>(
			pick: (actions: typeof result.current.actions) => (...args: Args) => void,
		) =>
		(...args: Args) =>
			act(() => pick(result.current.actions)(...args))
	return {
		getState: () => result.current.state,
		open: async (next: PluginScope | null) => {
			act(() => rerender({ scope: next }))
			await settled()
		},
		openScope: (next: PluginScope | null) =>
			act(() => rerender({ scope: next })),
		createSkill: acting((actions) => actions.createSkill),
		saveSkill: acting((actions) => actions.saveSkill),
		setSkillPreloaded: acting((actions) => actions.setSkillPreloaded),
		removeSkill: acting((actions) => actions.removeSkill),
		openFiles: acting((actions) => actions.openFiles),
		revert: acting((actions) => actions.revert),
		openFile: acting((actions) => actions.openFile),
		addFile: acting((actions) => actions.addFile),
		saveFile: acting((actions) => actions.saveFile),
		removeFile: acting((actions) => actions.removeFile),
	}
}

const opened = async (store: TranscriptStore, scope = A_COMPANION) => {
	const controller = mounted(store, scope)
	await settled()
	return controller
}

const movingSkill = (store: TranscriptStore, id: string): TranscriptStore => ({
	...store,
	updatePluginSkill: async (scope, skillId, draft) => ({
		...(await store.updatePluginSkill(scope, skillId, draft)),
		id,
	}),
})

const scopes: [string, PluginScope][] = [
	["a companion", A_COMPANION],
	["a space", spacePlugin("personal")],
	["the person", USER_PLUGIN],
]

describe.each(scopes)("usePlugin on %s", (_name, scope) => {
	const held = async (store: TranscriptStore) =>
		readers(await store.pluginSkills(scope))

	it("opens on the skills and the writes the bundle already holds", async () => {
		const store = createFakeTranscriptStore()
		await store.createPluginSkill(scope, A_SKILL)

		const controller = await opened(store, scope)

		expect(readers(controller.getState().skills)).toMatchObject([A_SKILL])
		expect(controller.getState().commits).toMatchObject([
			{ author: "user", title: `Skill "${A_SKILL.name}" saved from settings` },
		])
	})

	it("creates a skill with everything the reader gave", async () => {
		const store = createFakeTranscriptStore()
		const controller = await opened(store, scope)

		controller.createSkill(A_SKILL, false)
		await settled()

		expect(await held(store)).toMatchObject([
			{ ...A_SKILL, isPreloaded: false },
		])
	})

	it("creates a skill already carried, when that is what was asked for", async () => {
		const store = createFakeTranscriptStore()
		const controller = await opened(store, scope)

		controller.createSkill(A_SKILL, true)
		await settled()

		expect(readers(controller.getState().skills)).toMatchObject([
			{ isPreloaded: true },
		])
		expect((await held(store))[0].isPreloaded).toBe(true)
	})

	it("writes a save to the skill it was opened on, by id", async () => {
		const store = createFakeTranscriptStore()
		const written = await store.createPluginSkill(scope, A_SKILL)
		const controller = await opened(store, scope)

		controller.saveSkill(written.id, { ...A_SKILL, name: "Changelog" })
		await settled()

		expect(await held(store)).toMatchObject([
			{ id: written.id, name: "Changelog" },
		])
	})

	it("sets the preload mark on its own", async () => {
		const store = createFakeTranscriptStore()
		const written = await store.createPluginSkill(scope, A_SKILL)
		const controller = await opened(store, scope)

		controller.setSkillPreloaded(written.id, true)
		await settled()

		expect((await held(store))[0].isPreloaded).toBe(true)
	})

	it("takes a skill away", async () => {
		const store = createFakeTranscriptStore()
		const written = await store.createPluginSkill(scope, A_SKILL)
		const controller = await opened(store, scope)

		controller.removeSkill(written.id)
		await settled()

		expect(readers(controller.getState().skills)).toEqual([])
		expect(await held(store)).toEqual([])
	})

	it("reads the files of an opened change", async () => {
		const store = createFakeTranscriptStore()
		await store.createPluginSkill(scope, A_SKILL)
		const controller = await opened(store, scope)
		const [latest] = controller.getState().commits

		controller.openFiles(latest.id, latest.id)
		await settled()

		expect(controller.getState().files).toHaveLength(1)
		expect(controller.getState().areFilesReading).toBe(false)
	})

	it("puts the plugin back on the history it is given after an undo", async () => {
		const store = createFakeTranscriptStore()
		await store.createPluginSkill(scope, A_SKILL)
		const controller = await opened(store, scope)
		const [latest] = controller.getState().commits

		controller.revert(latest.id, latest.id)
		await settled()

		expect(controller.getState().commits[0].title).toContain(
			UNDONE_TITLE_PREFIX,
		)
	})

	it("carries an open file to the id a renamed skill comes back under", async () => {
		const store = createFakeTranscriptStore()
		const written = await store.createPluginSkill(scope, A_SKILL)
		await store.writePluginSkillFile(scope, written.id, "notes.md", "One line")
		const controller = await opened(movingSkill(store, "changelog"), scope)

		controller.openFile(written.id, "notes.md")
		await settled()
		controller.saveSkill(written.id, { ...A_SKILL, name: "Changelog" })
		await settled()

		expect(controller.getState().file).toMatchObject({
			skillId: "changelog",
			path: "notes.md",
		})
	})
})

describe("usePlugin", () => {
	it("clears what the last scope held before the read of the next one lands", async () => {
		const store = createFakeTranscriptStore()
		await store.createPluginSkill(A_COMPANION, A_SKILL)
		const controller = await opened(store)
		const [latest] = controller.getState().commits
		controller.openFiles(latest.id, latest.id)
		await settled()
		controller.openFile(controller.getState().skills[0].id, "notes.md")

		controller.openScope(spacePlugin("personal"))

		expect(controller.getState()).toMatchObject({
			skills: [],
			commits: [],
			files: [],
			file: null,
			openedRunId: null,
		})
	})

	it("drops a read whose scope is no longer the open one", async () => {
		const store = createFakeTranscriptStore()
		await store.createPluginSkill(A_COMPANION, A_SKILL)
		const controller = mounted(store, A_COMPANION)

		await controller.open(spacePlugin("personal"))

		expect(controller.getState().skills).toEqual([])
	})

	it("reports a history it could not read instead of an empty panel", async () => {
		const store = createFakeTranscriptStore()
		const refusing: TranscriptStore = {
			...store,
			pluginHistory: () => Promise.reject(new Error("no bundle")),
		}

		const controller = await opened(refusing)

		expect(controller.getState().hasFailedToLoad).toBe(true)
	})

	it("reports skills it could not read instead of an empty panel", async () => {
		const store = createFakeTranscriptStore()
		const refusing: TranscriptStore = {
			...store,
			pluginSkills: () => Promise.reject(new Error("no bundle")),
		}

		const controller = await opened(refusing)

		expect(controller.getState().hasFailedToLoad).toBe(true)
	})

	it("clears the reported failure once the plugin reads again", async () => {
		const store = createFakeTranscriptStore()
		let isRefusing = true
		const refusingOnce: TranscriptStore = {
			...store,
			pluginHistory: (scope) => {
				if (isRefusing) {
					isRefusing = false
					return Promise.reject(new Error("no bundle"))
				}
				return store.pluginHistory(scope)
			},
		}
		const controller = await opened(refusingOnce)
		expect(controller.getState().hasFailedToLoad).toBe(true)

		await controller.open(null)
		await controller.open(A_COMPANION)

		expect(controller.getState().hasFailedToLoad).toBe(false)
	})

	it("reads the writes again once a skill is written", async () => {
		const store = createFakeTranscriptStore()
		const controller = await opened(store)

		controller.createSkill(A_SKILL, false)
		await settled()

		expect(controller.getState().commits).toHaveLength(1)
	})

	it("puts the reader back on what the bundle holds when a save is refused", async () => {
		const store = createFakeTranscriptStore()
		const written = await store.createPluginSkill(A_COMPANION, A_SKILL)
		const refusing: TranscriptStore = {
			...store,
			updatePluginSkill: () => Promise.reject({ kind: "unwritableBundle" }),
		}
		const controller = await opened(refusing)

		controller.saveSkill(written.id, { ...A_SKILL, name: "Changelog" })
		await settled()

		expect(readers(controller.getState().skills)).toMatchObject([A_SKILL])
	})

	it("leaves the host's own skill as the bundle holds it when a save is refused", async () => {
		const store = createFakeTranscriptStore()
		const controller = await opened(store)

		controller.saveSkill("learn", A_SKILL)
		await settled()

		expect(controller.getState().skills).toMatchObject([
			{ id: "learn", name: "learn", isSystem: true },
		])
	})

	it("reads and writes nothing while no scope is open", async () => {
		const store = createFakeTranscriptStore()
		await store.createPluginSkill(A_COMPANION, A_SKILL)
		const asked: string[] = []
		const counted: TranscriptStore = {
			...store,
			pluginHistoryDiff: (scope, oldestCommitId, newestCommitId) => {
				asked.push(newestCommitId)
				return store.pluginHistoryDiff(scope, oldestCommitId, newestCommitId)
			},
		}
		const controller = mounted(counted, null)

		controller.openFiles("commit-1", "commit-1")
		controller.revert("commit-1", "commit-1")
		controller.createSkill(A_SKILL, false)
		await settled()

		expect(asked).toEqual([])
		expect(await readers(await store.pluginSkills(A_COMPANION))).toHaveLength(1)
		expect(await store.pluginHistory(A_COMPANION)).toHaveLength(1)
	})

	it("reads the files of an open run once", async () => {
		const store = createFakeTranscriptStore()
		await store.createPluginSkill(A_COMPANION, A_SKILL)
		const asked: string[] = []
		const counted: TranscriptStore = {
			...store,
			pluginHistoryDiff: (scope, oldestCommitId, newestCommitId) => {
				asked.push(newestCommitId)
				return store.pluginHistoryDiff(scope, oldestCommitId, newestCommitId)
			},
		}
		const controller = await opened(counted)
		const [commit] = controller.getState().commits

		controller.openFiles(commit.id, commit.id)
		await settled()
		controller.openFiles(commit.id, commit.id)
		await settled()

		expect(asked).toEqual([commit.id])
	})

	it("reports the files as reading while the read is in flight", async () => {
		const store = createFakeTranscriptStore()
		await store.createPluginSkill(A_COMPANION, A_SKILL)
		const controller = await opened(store)
		const [commit] = controller.getState().commits

		controller.openFiles(commit.id, commit.id)

		expect(controller.getState().areFilesReading).toBe(true)
		expect(controller.getState().haveFilesFailedToRead).toBe(false)
	})

	it("reports the files it could not read", async () => {
		const store = createFakeTranscriptStore()
		await store.createPluginSkill(A_COMPANION, A_SKILL)
		const refusing: TranscriptStore = {
			...store,
			pluginHistoryDiff: () => Promise.reject({ kind: "unwritableBundle" }),
		}
		const controller = await opened(refusing)
		const [commit] = controller.getState().commits

		controller.openFiles(commit.id, commit.id)
		await settled()

		expect(controller.getState().haveFilesFailedToRead).toBe(true)
		expect(controller.getState().areFilesReading).toBe(false)
	})

	it("puts the reader back on what the bundle holds when an undo is refused", async () => {
		const store = createFakeTranscriptStore()
		await store.createPluginSkill(A_COMPANION, A_SKILL)
		const refusing: TranscriptStore = {
			...store,
			revertPlugin: () => Promise.reject({ kind: "unwritableBundle" }),
		}
		const controller = await opened(refusing)
		const [commit] = controller.getState().commits

		controller.revert(commit.id, commit.id)
		await settled()

		expect(controller.getState().commits).toMatchObject([{ id: commit.id }])
	})

	it("opens a file the skill holds on its text", async () => {
		const store = createFakeTranscriptStore()
		const written = await store.createPluginSkill(A_COMPANION, A_SKILL)
		await store.writePluginSkillFile(
			A_COMPANION,
			written.id,
			"reference/api.md",
			"# API",
		)
		const controller = await opened(store)

		controller.openFile(written.id, "reference/api.md")
		await settled()

		expect(controller.getState().file).toMatchObject({
			path: "reference/api.md",
			text: "# API",
		})
		expect(readers(controller.getState().skills)[0].files).toEqual([
			"reference/api.md",
		])
	})

	it("adds a file empty and opens it", async () => {
		const store = createFakeTranscriptStore()
		const written = await store.createPluginSkill(A_COMPANION, A_SKILL)
		const controller = await opened(store)

		controller.addFile(written.id, "examples/1.4.0.md")
		await settled()

		expect(controller.getState().file).toMatchObject({
			path: "examples/1.4.0.md",
			text: "",
		})
		expect(readers(controller.getState().skills)[0].files).toEqual([
			"examples/1.4.0.md",
		])
	})

	it("saves what the reader typed back to the file", async () => {
		const store = createFakeTranscriptStore()
		const written = await store.createPluginSkill(A_COMPANION, A_SKILL)
		const controller = await opened(store)

		controller.addFile(written.id, "notes.md")
		await settled()
		controller.saveFile(written.id, "notes.md", "One line per change.")
		await settled()

		expect(
			await store.pluginSkillFile(A_COMPANION, written.id, "notes.md"),
		).toBe("One line per change.")
	})

	it("takes a file out of the skill and closes it", async () => {
		const store = createFakeTranscriptStore()
		const written = await store.createPluginSkill(A_COMPANION, A_SKILL)
		const controller = await opened(store)

		controller.addFile(written.id, "notes.md")
		await settled()
		controller.removeFile(written.id, "notes.md")
		await settled()

		expect(controller.getState().file).toBe(null)
		expect(readers(controller.getState().skills)[0].files).toEqual([])
	})

	it("keeps the file open with the failure when a save is refused", async () => {
		const store = createFakeTranscriptStore()
		const written = await store.createPluginSkill(A_COMPANION, A_SKILL)
		await store.writePluginSkillFile(
			A_COMPANION,
			written.id,
			"notes.md",
			"One line",
		)
		const refusing: TranscriptStore = {
			...store,
			writePluginSkillFile: () => Promise.reject({ kind: "unwritableBundle" }),
		}
		const controller = await opened(refusing)

		controller.openFile(written.id, "notes.md")
		await settled()
		controller.saveFile(written.id, "notes.md", "Another line")
		await settled()

		expect(controller.getState().file).toMatchObject({
			path: "notes.md",
			text: "One line",
			failure: "write",
		})
	})

	it("says so when a file cannot be read", async () => {
		const store = createFakeTranscriptStore()
		const written = await store.createPluginSkill(A_COMPANION, A_SKILL)
		const controller = await opened(store)

		controller.openFile(written.id, "missing.md")
		await settled()

		expect(controller.getState().file).toMatchObject({
			path: "missing.md",
			failure: "read",
		})
	})

	it("leaves an open file of another skill where it is on a rename", async () => {
		const store = createFakeTranscriptStore()
		const kept = await store.createPluginSkill(A_COMPANION, A_SKILL)
		const renamed = await store.createPluginSkill(A_COMPANION, {
			...A_SKILL,
			name: "Commit style",
		})
		await store.writePluginSkillFile(
			A_COMPANION,
			kept.id,
			"notes.md",
			"One line",
		)
		const controller = await opened(movingSkill(store, "changelog"))

		controller.openFile(kept.id, "notes.md")
		await settled()
		controller.saveSkill(renamed.id, { ...A_SKILL, name: "changelog" })
		await settled()

		expect(controller.getState().file).toMatchObject({ skillId: kept.id })
	})

	it("shows a preload toggle before the write lands and rolls it back when refused", async () => {
		const store = createFakeTranscriptStore()
		const written = await store.createPluginSkill(A_COMPANION, A_SKILL)
		let refuse: (reason: unknown) => void = () => undefined
		const refusing: TranscriptStore = {
			...store,
			setPluginSkillPreloaded: () =>
				new Promise((_resolve, reject) => {
					refuse = reject
				}),
		}
		const controller = await opened(refusing)

		controller.setSkillPreloaded(written.id, true)
		await settled()
		expect(readers(controller.getState().skills)[0].isPreloaded).toBe(true)

		refuse({ kind: "unwritableBundle" })
		await settled()

		expect(readers(controller.getState().skills)[0].isPreloaded).toBe(false)
	})

	it("runs the writes one after the other, in the order they were asked", async () => {
		const store = createFakeTranscriptStore()
		const steps: string[] = []
		let finishFirst: () => void = () => undefined
		const ordered: TranscriptStore = {
			...store,
			createPluginSkill: async (scope, draft) => {
				steps.push(`start ${draft.name}`)
				if (draft.name === "First") {
					await new Promise<void>((resolve) => {
						finishFirst = resolve
					})
				}
				steps.push(`end ${draft.name}`)
				return store.createPluginSkill(scope, draft)
			},
		}
		const controller = await opened(ordered)

		controller.createSkill({ ...A_SKILL, name: "First" }, false)
		controller.createSkill({ ...A_SKILL, name: "Second" }, false)
		await settled()
		finishFirst()
		await settled()

		expect(steps).toEqual([
			"start First",
			"end First",
			"start Second",
			"end Second",
		])
	})

	it("reads the scope again once a skill file write settles, even refused", async () => {
		const store = createFakeTranscriptStore()
		const written = await store.createPluginSkill(A_COMPANION, A_SKILL)
		const refusing: TranscriptStore = {
			...store,
			writePluginSkillFile: () => Promise.reject({ kind: "unwritableBundle" }),
		}
		const reads = vi.spyOn(refusing, "pluginSkills")
		const controller = await opened(refusing)
		reads.mockClear()

		controller.addFile(written.id, "notes.md")
		await settled()

		expect(reads).toHaveBeenCalledOnce()
	})
})
