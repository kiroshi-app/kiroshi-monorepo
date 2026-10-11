import { realpathSync } from "node:fs"
import {
	basename,
	dirname,
	extname,
	isAbsolute,
	join,
	relative,
	sep,
} from "node:path"

const WRITERS = new Set(["Write", "Edit"])

const RESERVED = new Set([
	"agents",
	".claude-plugin",
	"hooks",
	".git",
	".mcp.json",
	".applications.json",
	"settings.json",
])

const DOCUMENTS = new Set([".md", ".txt", ".json", ".yaml", ".yml", ".toml"])

const AGENT_FILE = join("agents", "agent.md")

const isDocument = (target: string): boolean =>
	DOCUMENTS.has(extname(target).toLowerCase())

const realOrNearest = (path: string): string => {
	try {
		return realpathSync(path)
	} catch {
		const parent = dirname(path)
		return parent === path ? path : join(realOrNearest(parent), basename(path))
	}
}

export type BundleScope = {
	botPath?: string
	userPath?: string
	spacePath?: string
}

const pathInside = (
	root: string | undefined,
	real: string,
): string | undefined => {
	if (!root) {
		return undefined
	}
	const inside = relative(realOrNearest(root), real)
	if (!inside || inside.startsWith("..") || isAbsolute(inside)) {
		return undefined
	}
	return inside
}

const isOpenEntry = (inside: string): boolean => {
	const [entry = ""] = inside.split(sep)
	return !RESERVED.has(entry)
}

export const isBundleWrite = (
	{ botPath, userPath, spacePath }: BundleScope,
	toolName: string,
	input: Record<string, unknown>,
): boolean => {
	if (!WRITERS.has(toolName)) {
		return false
	}
	const target = input.file_path
	if (typeof target !== "string" || !isAbsolute(target)) {
		return false
	}
	if (!isDocument(target)) {
		return false
	}
	const real = realOrNearest(target)
	const own = pathInside(botPath, real)
	if (own) {
		return own === AGENT_FILE || isOpenEntry(own)
	}
	const shared = pathInside(userPath, real) ?? pathInside(spacePath, real)
	return shared !== undefined && isOpenEntry(shared)
}
