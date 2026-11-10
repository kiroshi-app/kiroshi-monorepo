/// <reference types="node" />

import { resolve } from "node:path"

import ts from "typescript"
import { beforeAll, describe, expect, it } from "vitest"

import type { BotBadge } from "@workspace/ui/components/bot-badge"

import { CHIP_STATE_OF } from "./mission-chip-states"
import { SCENE_SPACES, type SceneSpace, spaceOf } from "./scene-cast"
import { sceneRailOf } from "./scene-rail"

const REPOSITORY = resolve(import.meta.dirname, "../../..")

const SCENE = "apps/website/src/app-scene.tsx"

const COMPONENT_SOURCE = "/packages/ui/src/"

const LEFT_OUT_OF_THE_SIDEBAR: Record<string, string> = {
	"data-tauri-drag-region": "a web page holds no Tauri window to drag",
	windowControls: "macOS draws no caption buttons, the scene paints its lights",
	rosterSkeleton: "the scene roster never loads",
	onRetryLoadBots: "the scene roster never fails to load",
	updateBadge: "the scene shows an app that is up to date",
	openSettings: "no settings screen opens in the scene",
	incomingTab: "no tab arrives from another window on a web page",
	isSearchOpen:
		"the scene opens no search palette, its rail entry stays at rest",
	onSelectLibrary: "the scene opens no Library, so its rail draws no entry",
	onSearchMissions: "the scene opens no mission search",
	sections: "the scene hands its sections by Space, through sectionsBySpaceId",
	side: "the scene keeps the sidebar on its default side",
	variant: "the scene draws the sidebar in its default variant",
}

const LEFT_OUT_OF_THE_SHELL: Record<string, string> = {
	width: "the scene keeps no saved sidebar width, the shell holds its own",
	onWidthChange:
		"the scene keeps no saved sidebar width, the shell holds its own",
	className: "the scene adds no class to the shell",
}

const SLOW_PROGRAM_MS = 60_000

type ComponentProps = { declared: string[]; passed: string[] }

type PropReader = { propsOf: (tag: string) => ComponentProps }

const websiteCompilerOptions = () => {
	const config = ts.getParsedCommandLineOfConfigFile(
		resolve(REPOSITORY, "apps/website/tsconfig.json"),
		{},
		{ ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} },
	)
	if (!config) throw new Error("apps/website/tsconfig.json did not parse")
	return { ...config.options, noEmit: true }
}

const hasChildren = (node: ts.Node) =>
	ts.isJsxOpeningElement(node) &&
	ts.isJsxElement(node.parent) &&
	node.parent.children.some(
		(child) => !ts.isJsxText(child) || child.text.trim() !== "",
	)

const isDeclaredByTheComponents = (property: ts.Symbol) =>
	(property.getDeclarations() ?? []).some((declaration) =>
		declaration.getSourceFile().fileName.includes(COMPONENT_SOURCE),
	)

const createPropReader = (file: string): PropReader => {
	const path = resolve(REPOSITORY, file)
	const program = ts.createProgram([path], websiteCompilerOptions())
	const checker = program.getTypeChecker()
	const source = program.getSourceFile(path)
	if (!source) throw new Error(`${file} is not in the program`)

	const openingsOf = (tag: string) => {
		const found: (ts.JsxOpeningElement | ts.JsxSelfClosingElement)[] = []
		const visit = (node: ts.Node) => {
			if (
				(ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
				node.tagName.getText(source) === tag
			)
				found.push(node)
			ts.forEachChild(node, visit)
		}
		visit(source)
		if (found.length === 0) throw new Error(`${file} renders no <${tag}>`)
		return found
	}

	const attributeNamesOf = (attribute: ts.JsxAttributeLike) =>
		ts.isJsxSpreadAttribute(attribute)
			? checker
					.getTypeAtLocation(attribute.expression)
					.getProperties()
					.map((property) => property.getName())
			: [attribute.name.getText(source)]

	const propsOf = (tag: string) => {
		const openings = openingsOf(tag)
		const declared = openings.flatMap(
			(opening) =>
				checker
					.getContextualType(opening.attributes)
					?.getProperties()
					.filter(isDeclaredByTheComponents)
					.map((property) => property.getName()) ?? [],
		)
		const passed = openings.flatMap((opening) => [
			...opening.attributes.properties.flatMap(attributeNamesOf),
			...(hasChildren(opening) ? ["children"] : []),
		])
		return { declared: [...new Set(declared)], passed }
	}

	return { propsOf }
}

const missingFrom = ({ declared, passed }: ComponentProps, leftOut: string[]) =>
	declared
		.filter((prop) => !passed.includes(prop) && !leftOut.includes(prop))
		.sort()

const leftOutWrongly = (
	{ declared, passed }: ComponentProps,
	leftOut: string[],
) => leftOut.filter((prop) => !declared.includes(prop) || passed.includes(prop))

describe("the landing scene against the components it renders", () => {
	let reader: PropReader

	beforeAll(() => {
		reader = createPropReader(SCENE)
	}, SLOW_PROGRAM_MS)

	it("passes AppSidebar every prop it declares, but the ones left out", () => {
		expect(
			missingFrom(
				reader.propsOf("AppSidebar"),
				Object.keys(LEFT_OUT_OF_THE_SIDEBAR),
			),
		).toEqual([])
	})

	it("passes WorkspaceShell every prop it declares, but the ones left out", () => {
		expect(
			missingFrom(
				reader.propsOf("WorkspaceShell"),
				Object.keys(LEFT_OUT_OF_THE_SHELL),
			),
		).toEqual([])
	})

	it("leaves out only props the component declares and the scene does not pass", () => {
		expect([
			...leftOutWrongly(
				reader.propsOf("AppSidebar"),
				Object.keys(LEFT_OUT_OF_THE_SIDEBAR),
			),
			...leftOutWrongly(
				reader.propsOf("WorkspaceShell"),
				Object.keys(LEFT_OUT_OF_THE_SHELL),
			),
		]).toEqual([])
	})
})

const withoutMissions = (spaces: SceneSpace[]): SceneSpace[] =>
	spaces.map((space) => ({
		...space,
		missions: [],
		rows: space.rows.map((row) => ({ ...row, missions: undefined })),
	}))

const withRowBadge = (
	spaces: SceneSpace[],
	spaceId: string,
	badge: BotBadge,
): SceneSpace[] =>
	spaces.map((space) =>
		space.id === spaceId
			? {
					...space,
					rows: space.rows.map((row, rank) =>
						rank === 0 ? { ...row, badge } : row,
					),
				}
			: space,
	)

const WORK = spaceOf("work")
const PERSONAL = spaceOf("personal")

describe("the landing scene rail indicators", () => {
	it("marks no Space as shared or joined, so no logo carries a presence dot", () => {
		const rail = sceneRailOf(SCENE_SPACES, WORK)

		expect(rail.hostBySpaceId).toEqual({})
		expect(rail.spaceHost).toBeUndefined()
	})

	it("badges Personal for its waiting mission while Work is selected", () => {
		expect(sceneRailOf(SCENE_SPACES, WORK).badgesBySpaceId?.[PERSONAL.id]).toBe(
			"attention",
		)
	})

	it.each<BotBadge>(["attention", "failed"])(
		"badges another Space holding %s",
		(badge) => {
			const lit = withRowBadge(
				withoutMissions(SCENE_SPACES),
				PERSONAL.id,
				badge,
			)

			expect(sceneRailOf(lit, WORK).badgesBySpaceId).toEqual({
				[PERSONAL.id]: badge,
			})
		},
	)
})

describe("the landing scene mission chips", () => {
	it("pins the chip-state table the scene reads, so any change to it is reviewed on the landing", () => {
		expect(CHIP_STATE_OF).toMatchInlineSnapshot(`
			{
			  "failed": "failed",
			  "ready_to_merge": "ready",
			  "waiting_bot": "working",
			  "waiting_human": "waiting",
			  "working": "working",
			}
		`)
	})
})
