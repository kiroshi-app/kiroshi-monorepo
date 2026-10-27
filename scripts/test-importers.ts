import { existsSync, readFileSync, statSync } from "node:fs"
import { dirname, join, relative } from "node:path"

export const TEST_SOURCE_ROOTS = ["apps/app/src/", "packages/ui/src/"]

const ALIASES: [string, string][] = [
	["@workspace/ui/", "packages/ui/src/"],
	["@workspace/shared/", "packages/shared/"],
	["@/", "apps/app/src/"],
]

const RESOLVED_SUFFIXES = [
	"",
	".ts",
	".tsx",
	".js",
	".json",
	"/index.ts",
	"/index.tsx",
]

const SCANNED_MODULE = /\.(ts|tsx|js)$/

const TEST_FILE = /\.test\.tsx?$/

const TRANSPILERS = {
	ts: new Bun.Transpiler({ loader: "ts" }),
	tsx: new Bun.Transpiler({
		loader: "tsx",
		tsconfig: { compilerOptions: { jsx: "react" } },
	}),
}

type ImportGraph = { repo: string; importsOf: Map<string, string[]> }

const existingFile = (base: string) =>
	RESOLVED_SUFFIXES.map((suffix) => base + suffix).find(
		(candidate) => existsSync(candidate) && statSync(candidate).isFile(),
	)

const resolveImport = (graph: ImportGraph, from: string, specifier: string) => {
	const [path] = specifier.split("?")
	if (path.startsWith(".")) return existingFile(join(dirname(from), path))
	const alias = ALIASES.find(([prefix]) => path.startsWith(prefix))
	if (alias === undefined) return undefined
	const [prefix, target] = alias
	return existingFile(join(graph.repo, target, path.slice(prefix.length)))
}

const scannedImports = (file: string) => {
	if (!SCANNED_MODULE.test(file)) return []
	const transpiler = file.endsWith(".tsx") ? TRANSPILERS.tsx : TRANSPILERS.ts
	return transpiler
		.scanImports(readFileSync(file, "utf8"))
		.map(({ path }) => path)
}

const directImports = (graph: ImportGraph, file: string) => {
	const known = graph.importsOf.get(file)
	if (known !== undefined) return known
	const resolved = scannedImports(file)
		.map((specifier) => resolveImport(graph, file, specifier))
		.filter((path) => path !== undefined)
	graph.importsOf.set(file, resolved)
	return resolved
}

const reachableModules = (graph: ImportGraph, testFile: string) => {
	const reached = new Set<string>()
	const pending = [testFile]
	for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
		for (const next of directImports(graph, file)) {
			if (reached.has(next)) continue
			reached.add(next)
			pending.push(next)
		}
	}
	return reached
}

export const testImportersByModule = (repo: string) => {
	const graph: ImportGraph = { repo, importsOf: new Map() }
	const importers = new Map<string, number>()
	const testFiles = TEST_SOURCE_ROOTS.flatMap((root) => [
		...new Bun.Glob(`${root}**/*.test.{ts,tsx}`).scanSync(repo),
	])
	for (const testFile of testFiles) {
		for (const module of reachableModules(graph, join(repo, testFile))) {
			if (TEST_FILE.test(module)) continue
			const path = relative(repo, module)
			importers.set(path, (importers.get(path) ?? 0) + 1)
		}
	}
	return importers
}
