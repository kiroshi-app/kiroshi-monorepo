import { tmpdir } from "node:os"

import { type ModelInfo, query } from "@anthropic-ai/claude-agent-sdk"

import { agentStderr } from "./agent-stderr"
import { resolveExecutable } from "./executable"
import { createPromptStream } from "./prompt-stream"
import { sessionEnv } from "./session-env"

import type { OfferedModel } from "../provider"

export const modelsOptions = (connection?: Record<string, string>) => ({
	cwd: tmpdir(),
	pathToClaudeCodeExecutable: resolveExecutable(),
	env: sessionEnv(connection),
	stderr: agentStderr("models"),
})

const UNRESOLVED_MODEL = "default"

type SupportedModel = Pick<
	ModelInfo,
	"value" | "supportsEffort" | "supportedEffortLevels"
>

const effortLevelsOf = (model: SupportedModel) =>
	model.supportsEffort ? [...(model.supportedEffortLevels ?? [])] : []

export const offeredModels = (
	offered: readonly SupportedModel[],
): OfferedModel[] =>
	offered
		.filter((model) => model.value !== UNRESOLVED_MODEL)
		.map((model) => ({
			value: model.value,
			supportedEffortLevels: effortLevelsOf(model),
		}))

export const claudeModels = async (connection?: Record<string, string>) => {
	const prompts = createPromptStream()
	const run = query({
		prompt: prompts.stream,
		options: modelsOptions(connection),
	})
	try {
		return offeredModels(await run.supportedModels())
	} finally {
		prompts.end()
		run.close()
	}
}
