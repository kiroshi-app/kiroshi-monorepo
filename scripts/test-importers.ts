import { existsSync, readFileSync, statSync } from "node:fs"
import { dirname, join, relative } from "node:path"

import ts from "typescript"

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

export const SCANNED_MODULE = /\.(ts|tsx|js)$/

export const TEST_FILE = /\.test\.tsx?$/

const JAVASCRIPT = new Bun.Transpiler({ loader: "js" })

const STRIPPED_TYPES: ts.CompilerOptions = {
	jsx: ts.JsxEmit.React,
	module: ts.ModuleKind.ESNext,
	target: ts.ScriptTarget.ESNext,
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
	const { outputText } = ts.transpileModule(readFileSync(file, "utf8"), {
		compilerOptions: STRIPPED_TYPES,
		fileName: file,
	})
	return JAVASCRIPT.scanImports(outputText).map(({ path }) => path)
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

export type TestImports = {
	testFiles: Set<string>
	importers: Map<string, number>
	directTestImporters: Map<string, string[]>
	moduleImporters: Map<string, string[]>
}

const appended = (map: Map<string, string[]>, key: string, value: string) => {
	map.set(key, [...(map.get(key) ?? []), value])
}

const moduleImportersOf = (graph: ImportGraph) => {
	const moduleImporters = new Map<string, string[]>()
	for (const [file, imported] of graph.importsOf) {
		if (TEST_FILE.test(file)) continue
		for (const module of imported) {
			appended(
				moduleImporters,
				relative(graph.repo, module),
				relative(graph.repo, file),
			)
		}
	}
	return moduleImporters
}

export const testImports = (repo: string): TestImports => {
	const graph: ImportGraph = { repo, importsOf: new Map() }
	const importers = new Map<string, number>()
	const directTestImporters = new Map<string, string[]>()
	const testFiles = TEST_SOURCE_ROOTS.flatMap((root) => [
		...new Bun.Glob(`${root}**/*.test.{ts,tsx}`).scanSync(repo),
	])
	for (const testFile of testFiles) {
		const absoluteTestFile = join(repo, testFile)
		for (const module of reachableModules(graph, absoluteTestFile)) {
			if (TEST_FILE.test(module)) continue
			const path = relative(repo, module)
			importers.set(path, (importers.get(path) ?? 0) + 1)
		}
		for (const module of directImports(graph, absoluteTestFile)) {
			appended(directTestImporters, relative(repo, module), testFile)
		}
	}
	return {
		testFiles: new Set(testFiles),
		importers,
		directTestImporters,
		moduleImporters: moduleImportersOf(graph),
	}
}

const isGatheredObject = (expression: ts.Expression): boolean => {
	if (
		ts.isAsExpression(expression) ||
		ts.isSatisfiesExpression(expression) ||
		ts.isParenthesizedExpression(expression)
	)
		return isGatheredObject(expression.expression)
	return (
		ts.isObjectLiteralExpression(expression) &&
		expression.properties.every(ts.isShorthandPropertyAssignment)
	)
}

const isReexportStatement = (statement: ts.Statement) =>
	ts.isImportDeclaration(statement) ||
	ts.isExportDeclaration(statement) ||
	(ts.isVariableStatement(statement) &&
		statement.declarationList.declarations.every(
			({ initializer }) =>
				initializer !== undefined && isGatheredObject(initializer),
		))

const isReexportModule = (file: string) =>
	ts
		.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.ESNext)
		.statements.every(isReexportStatement)

const ownTestFiles = (imports: TestImports, module: string) => {
	const stem = module.replace(/\.tsx?$/, "")
	return [`${stem}.test.ts`, `${stem}.test.tsx`].filter((file) =>
		imports.testFiles.has(file),
	)
}

type ReexportCheck = (module: string) => boolean

const memoised = (check: ReexportCheck): ReexportCheck => {
	const known = new Map<string, boolean>()
	return (module) => {
		const checked = known.get(module) ?? check(module)
		known.set(module, checked)
		return checked
	}
}

type Walk = { imports: TestImports; reexporting: ReexportCheck }

const reexportsAbove = ({ imports, reexporting }: Walk, path: string) => {
	const walked = new Set([path])
	const pending = [path]
	for (
		let module = pending.pop();
		module !== undefined;
		module = pending.pop()
	) {
		for (const importer of imports.moduleImporters.get(module) ?? []) {
			if (walked.has(importer) || !reexporting(importer)) continue
			walked.add(importer)
			pending.push(importer)
		}
	}
	return walked
}

const consumerTestFiles = ({ imports, reexporting }: Walk, module: string) =>
	reexporting(module)
		? (imports.moduleImporters.get(module) ?? [])
				.filter((importer) => !reexporting(importer))
				.flatMap((importer) => ownTestFiles(imports, importer))
		: []

type GuardedModule = { repo: string; imports: TestImports; path: string }

export const testFilesGuarding = ({ repo, imports, path }: GuardedModule) => {
	const walk: Walk = {
		imports,
		reexporting: memoised((module) => isReexportModule(join(repo, module))),
	}
	const found = [...reexportsAbove(walk, path)].flatMap((module) => [
		...(imports.directTestImporters.get(module) ?? []),
		...consumerTestFiles(walk, module),
	])
	return [...new Set(found)].sort()
}
