import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type { Servers } from "./server-env"

const DIRECTORY_PREFIX = "kiroshi-mcp-"
const FILE_NAME = "mcp.json"
const FILE_MODE = 0o600

export type McpConfigPaths = {
	path: string
	resolvedPath: string
}

export type McpConfigFile = McpConfigPaths & {
	remove: () => void
}

const removing = (directory: string) => () =>
	rmSync(directory, { recursive: true, force: true })

export const writeMcpConfigFile = (servers: Servers): McpConfigFile => {
	const directory = mkdtempSync(join(tmpdir(), DIRECTORY_PREFIX))
	const remove = removing(directory)
	try {
		const path = join(directory, FILE_NAME)
		writeFileSync(path, JSON.stringify({ mcpServers: servers }), {
			mode: FILE_MODE,
			flag: "wx",
		})
		return { path, resolvedPath: realpathSync(path), remove }
	} catch (error) {
		remove()
		throw error
	}
}

export const mcpConfigFileFor = (
	servers: Servers,
): McpConfigFile | undefined =>
	Object.keys(servers).length > 0 ? writeMcpConfigFile(servers) : undefined

export const readPathsOf = (mcpConfig?: McpConfigPaths): string[] =>
	mcpConfig ? [...new Set([mcpConfig.path, mcpConfig.resolvedPath])] : []
