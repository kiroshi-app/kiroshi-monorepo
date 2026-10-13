import {
	hashKey,
	skipToken,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query"
import { useState } from "react"

import { pluginQueryKeys } from "./plugin-query-keys"

import { createQueue } from "../queue"
import { createStore, type Store } from "../store"
import { useControllerState } from "../use-controller"
import {
	createHistoryFilesReader,
	type HistoryFilesState,
	initialHistoryFilesState,
} from "../bots/history-files-controller"
import {
	createSkillFilesController,
	type OpenedSkillFile,
	type SkillFilesController,
} from "../bots/skill-files-controller"
import type {
	BotHistoryEntry,
	BotSkill,
	BotSkillDraft,
	PluginScope,
} from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"

export type PluginState = HistoryFilesState & {
	skills: BotSkill[]
	commits: BotHistoryEntry[]
	hasFailedToLoad: boolean
	isPending: boolean
	file: OpenedSkillFile | null
}

export type PluginActions = SkillFilesController & {
	createSkill: (draft: BotSkillDraft, isPreloaded: boolean) => void
	saveSkill: (skillId: string, draft: BotSkillDraft) => void
	setSkillPreloaded: (skillId: string, isPreloaded: boolean) => void
	removeSkill: (skillId: string) => void
	openFiles: (oldestCommitId: string, newestCommitId: string) => void
	revert: (oldestCommitId: string, newestCommitId: string) => void
}

export type Plugin = {
	state: PluginState
	actions: PluginActions
}

type OpenedFiles = HistoryFilesState & { file: OpenedSkillFile | null }

type OpenedFilesOfScope = {
	scopeHash: string
	store: Store<OpenedFiles>
}

type ScopedWrite = {
	scope: PluginScope
	task: () => Promise<unknown>
}

type PreloadWrite = {
	scope: PluginScope
	skillId: string
	isPreloaded: boolean
}

const NOTHING_OPENED: OpenedFiles = { ...initialHistoryFilesState, file: null }

const NO_SKILLS: BotSkill[] = []

const NO_COMMITS: BotHistoryEntry[] = []

const RENDERED_INLINE = { rendersErrorInline: true } as const

const openedFilesOf = (scopeHash: string): OpenedFilesOfScope => ({
	scopeHash,
	store: createStore(NOTHING_OPENED),
})

const useOpenedFiles = (scope: PluginScope | null) => {
	const scopeHash = hashKey([scope])
	const [opened, setOpened] = useState(() => openedFilesOf(scopeHash))
	if (opened.scopeHash !== scopeHash) {
		setOpened(openedFilesOf(scopeHash))
	}
	const state = useControllerState(opened.store)
	const patch = (fields: Partial<OpenedFiles>) =>
		opened.store.setState({ ...opened.store.getState(), ...fields })
	return { store: opened.store, state, patch }
}

const withPreload =
	(skillId: string, isPreloaded: boolean) =>
	(skills: BotSkill[] = []) =>
		skills.map((skill) =>
			skill.id === skillId ? { ...skill, isPreloaded } : skill,
		)

export const usePlugin = (
	store: TranscriptStore,
	scope: PluginScope | null,
): Plugin => {
	const queryClient = useQueryClient()
	const [enqueue] = useState(createQueue)
	const opened = useOpenedFiles(scope)

	const skills = useQuery({
		queryKey: pluginQueryKeys.skills(scope),
		queryFn: scope ? () => store.pluginSkills(scope) : skipToken,
		meta: RENDERED_INLINE,
	})
	const history = useQuery({
		queryKey: pluginQueryKeys.history(scope),
		queryFn: scope ? () => store.pluginHistory(scope) : skipToken,
		meta: RENDERED_INLINE,
	})

	const rereadScope = (written: PluginScope) =>
		queryClient.invalidateQueries({
			queryKey: pluginQueryKeys.scope(written),
		})

	const write = useMutation({
		mutationFn: ({ task }: ScopedWrite) => enqueue(task),
		onSettled: (_answer, _error, { scope: written }) => rereadScope(written),
		meta: RENDERED_INLINE,
	})

	const preload = useMutation({
		mutationFn: ({ scope: written, skillId, isPreloaded }: PreloadWrite) =>
			enqueue(() =>
				store.setPluginSkillPreloaded(written, skillId, isPreloaded),
			),
		onMutate: async ({ scope: written, skillId, isPreloaded }) => {
			const queryKey = pluginQueryKeys.skills(written)
			await queryClient.cancelQueries({ queryKey })
			const held = queryClient.getQueryData<BotSkill[]>(queryKey)
			queryClient.setQueryData(queryKey, withPreload(skillId, isPreloaded))
			return held
		},
		onError: (_error, { scope: written }, held) =>
			queryClient.setQueryData(pluginQueryKeys.skills(written), held),
		onSettled: (_answer, _error, { scope: written }) => rereadScope(written),
		meta: RENDERED_INLINE,
	})

	const run = (task: () => Promise<void>) => {
		if (scope) void enqueue(task)
	}

	const writeTo = (task: (open: PluginScope) => Promise<unknown>) => {
		if (scope) write.mutate({ scope, task: () => task(scope) })
	}

	const openScope = () => {
		if (!scope) {
			throw new Error("no plugin scope open")
		}
		return scope
	}

	const files = createSkillFilesController(
		{
			read: (skillId, path) =>
				store.pluginSkillFile(openScope(), skillId, path),
			write: (skillId, path, text) =>
				store.writePluginSkillFile(openScope(), skillId, path, text),
			remove: (skillId, path) =>
				store.deletePluginSkillFile(openScope(), skillId, path),
		},
		{
			run,
			write: writeTo,
			getFile: () => opened.store.getState().file,
			setFile: (file) => opened.patch({ file }),
		},
	)

	const readFiles = createHistoryFilesReader(
		(oldestCommitId, newestCommitId) =>
			store.pluginHistoryDiff(openScope(), oldestCommitId, newestCommitId),
		{
			run,
			getState: opened.store.getState,
			setState: opened.patch,
		},
	)

	return {
		state: {
			...opened.state,
			skills: skills.data ?? NO_SKILLS,
			commits: history.data ?? NO_COMMITS,
			hasFailedToLoad: skills.isError || history.isError,
			isPending: skills.isPending || history.isPending,
		},
		actions: {
			...files,
			createSkill: (draft, isPreloaded) =>
				writeTo(async (open) => {
					const created = await store.createPluginSkill(open, draft)
					if (isPreloaded) {
						await store.setPluginSkillPreloaded(open, created.id, true)
					}
				}),
			saveSkill: (skillId, draft) =>
				writeTo(async (open) => {
					const saved = await store.updatePluginSkill(open, skillId, draft)
					files.carryFile(skillId, saved.id)
				}),
			setSkillPreloaded: (skillId, isPreloaded) => {
				if (scope) preload.mutate({ scope, skillId, isPreloaded })
			},
			removeSkill: (skillId) =>
				writeTo((open) => store.deletePluginSkill(open, skillId)),
			openFiles: (oldestCommitId, newestCommitId) => {
				if (scope) readFiles(oldestCommitId, newestCommitId)
			},
			revert: (oldestCommitId, newestCommitId) =>
				writeTo((open) =>
					store.revertPlugin(open, oldestCommitId, newestCommitId),
				),
		},
	}
}
