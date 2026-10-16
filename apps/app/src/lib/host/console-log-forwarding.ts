import { invoke } from "@tauri-apps/api/core"

import { hasTauriInternals } from "./tauri-internals"

const LOG_LEVELS = { info: 3, warn: 4, error: 5 } as const

type ForwardedLevel = keyof typeof LOG_LEVELS

const serialized = (part: unknown): string => {
	try {
		return JSON.stringify(part) ?? String(part)
	} catch {
		return String(part)
	}
}

const textOf = (part: unknown): string => {
	if (typeof part === "string") return part
	if (part instanceof Error) return part.stack ?? String(part)
	return serialized(part)
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
	forwardToLogFile("info")
	forwardToLogFile("warn")
	forwardToLogFile("error")
}
