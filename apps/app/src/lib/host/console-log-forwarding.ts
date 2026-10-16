import { invoke } from "@tauri-apps/api/core"

import { hasTauriInternals } from "./tauri-internals"

const LOG_LEVELS = { warn: 4, error: 5 } as const

type ForwardedLevel = keyof typeof LOG_LEVELS

const jsonOf = (part: unknown): string | undefined => {
	try {
		return JSON.stringify(part)
	} catch {
		return undefined
	}
}

const textOf = (part: unknown): string => {
	if (typeof part === "string") return part
	if (part instanceof Error) return part.stack ?? String(part)
	return jsonOf(part) ?? String(part)
}

const forwardToLogFile = (level: ForwardedLevel) => {
	const print = console[level].bind(console)
	console[level] = (...parts: unknown[]) => {
		print(...parts)
		invoke("plugin:log|log", {
			level: LOG_LEVELS[level],
			message: parts.map(textOf).join(" "),
		}).catch((reason: unknown) => print("log file write failed", reason))
	}
}

export const forwardConsoleToLogFile = () => {
	if (!hasTauriInternals()) return
	forwardToLogFile("warn")
	forwardToLogFile("error")
}
