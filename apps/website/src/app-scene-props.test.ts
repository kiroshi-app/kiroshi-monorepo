/// <reference types="node" />

import { resolve } from "node:path"

import ts from "typescript"
import { beforeAll, describe, expect, it } from "vitest"

import type { AppRailDots } from "@workspace/ui/components/app-rail"
import type { AppSidebarRowMission } from "@workspace/ui/components/app-sidebar"
import type { BotBadge } from "@workspace/ui/components/bot-badge"

import { SCENE_SPACES, type SceneSpace, spaceOf } from "./scene-cast"
import { sceneRailOf } from "./scene-rail"

import { CHIP_STATE_OF } from "../../app/src/lib/missions/mission-chip-states"

const REPOSITORY = resolve(import.meta.dirname, "../../..")

const APP_SIDEBAR_CALL = "apps/app/src/components/workspace-sidebar.tsx"
const WORKSPACE_SHELL_CALL = "apps/app/src/components/conversations-screen.tsx"
const SETTINGS_TITLE_BAR_CALL = "apps/app/src/components/workspace-settings.tsx"
const SCENE = "apps/website/src/app-scene.tsx"
const SIDEBAR_BADGES = "apps/app/src/lib/chat/sidebar-badges.ts"
const MISSIONS_MODEL = "apps/app/src/lib/missions/missions-model.ts"

const LEFT_OUT_OF_THE_SIDEBAR: Record<string, string> = {
	"data-tauri-drag-region": "a web page holds no Tauri window to drag",
	windowControls: "macOS draws no caption buttons, the scene paints its lights",
	rosterSkeleton: "the scene roster never loads",
	updateBadge: "the scene shows an app that is up to date",
	openSettings: "no settings screen opens in the scene",
}

const LEFT_OUT_OF_THE_SHELL: Record<string, string> = {
	width: "the scene keeps no saved sidebar width, the shell holds its own",
	onWidthChange:
		"the scene keeps no saved sidebar width, the shell holds its own",
}

const SLOW_PROGRAM_MS = 60_000

type PropReader = {
	propsPassedTo: (file: string, tag: string) => string[]
	propsOfObject: (file: string, property: string) => string[]
}

const appCompilerOptions = () => {
	const config = ts.getParsedCommandLineOfConfigFile(
		resolve(REPOSITORY, "apps/app/tsconfig.json"),
		{},
		{ ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} },
	)
	if (!config) throw new Error("apps/app/tsconfig.json did not parse")
	return { ...config.options, noEmit: true }
}

const hasChildren = (node: ts.Node) =>
	ts.isJsxOpeningElement(node) &&
	ts.isJsxElement(node.parent) &&
	node.parent.children.some(
		(child) => !ts.isJsxText(child) || child.text.trim() !== "",
	)

const createPropReader = (files: string[]): PropReader => {
	const paths = files.map((file) => resolve(REPOSITORY, file))
	const program = ts.createProgram(paths, appCompilerOptions())
	const checker = program.getTypeChecker()

	const sourceOf = (file: string) => {
		const source = program.getSourceFile(resolve(REPOSITORY, file))
		if (!source) throw new Error(`${file} is not in the program`)
		return source
	}

	const nodesIn = (file: string, isWanted: (node: ts.Node) => boolean) => {
		const found: ts.Node[] = []
		const visit = (node: ts.Node) => {
			if (isWanted(node)) found.push(node)
			ts.forEachChild(node, visit)
		}
		visit(sourceOf(file))
		return found
	}

	const namesOf = (node: ts.Node) =>
		checker
			.getTypeAtLocation(node)
			.getProperties()
			.map((property) => property.getName())

	const attributeNamesOf = (attribute: ts.JsxAttributeLike) =>
		ts.isJsxSpreadAttribute(attribute)
			? namesOf(attribute.expression)
			: [attribute.name.getText()]

	const propsPassedTo = (file: string, tag: string) => {
		const source = sourceOf(file)
		const openings = nodesIn(
			file,
			(node) =>
				(ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
				node.tagName.getText(source) === tag,
		) as (ts.JsxOpeningElement | ts.JsxSelfClosingElement)[]
		if (openings.length === 0) throw new Error(`${file} renders no <${tag}>`)
		return openings.flatMap((opening) => [
			...opening.attributes.properties.flatMap(attributeNamesOf),
			...(hasChildren(opening) ? ["children"] : []),
		])
	}

	const propsOfObject = (file: string, property: string) => {
		const source = sourceOf(file)
		const assignments = nodesIn(
			file,
			(node) =>
				ts.isPropertyAssignment(node) &&
				node.name.getText(source) === property &&
				ts.isObjectLiteralExpression(node.initializer),
		) as ts.PropertyAssignment[]
		if (assignments.length === 0)
			throw new Error(`${file} builds no ${property} object`)
		return assignments.flatMap((assignment) => namesOf(assignment.initializer))
	}

	return { propsPassedTo, propsOfObject }
}

const missingFrom = (scene: string[], app: string[]) =>
	[...new Set(app)].filter((prop) => !scene.includes(prop)).sort()

describe("the landing scene against apps/app", () => {
	let reader: PropReader

	beforeAll(() => {
		reader = createPropReader([
			APP_SIDEBAR_CALL,
			WORKSPACE_SHELL_CALL,
			SETTINGS_TITLE_BAR_CALL,
			SCENE,
		])
	}, SLOW_PROGRAM_MS)

	it("passes AppSidebar every prop the app passes it", () => {
		const scene = [
			...reader.propsPassedTo(SCENE, "AppSidebar"),
			...Object.keys(LEFT_OUT_OF_THE_SIDEBAR),
		]

		expect(
			missingFrom(scene, reader.propsPassedTo(APP_SIDEBAR_CALL, "AppSidebar")),
		).toEqual([])
	})

	it("passes AppTitleBar, through AppSidebar, every prop the app's settings title bar takes", () => {
		const scene = [
			...reader.propsPassedTo(SCENE, "AppSidebar"),
			...Object.keys(LEFT_OUT_OF_THE_SIDEBAR),
		]

		expect(
			missingFrom(
				scene,
				reader.propsOfObject(SETTINGS_TITLE_BAR_CALL, "titleBar"),
			),
		).toEqual([])
	})

	it("passes WorkspaceShell every prop the app passes it", () => {
		const scene = [
			...reader.propsPassedTo(SCENE, "WorkspaceShell"),
			...Object.keys(LEFT_OUT_OF_THE_SHELL),
		]

		expect(
			missingFrom(
				scene,
				reader.propsPassedTo(WORKSPACE_SHELL_CALL, "WorkspaceShell"),
			),
		).toEqual([])
	})

	it("leaves out only props the app still passes and the scene does not", () => {
		const appProps = [
			...reader.propsPassedTo(APP_SIDEBAR_CALL, "AppSidebar"),
			...reader.propsPassedTo(WORKSPACE_SHELL_CALL, "WorkspaceShell"),
		]
		const sceneProps = [
			...reader.propsPassedTo(SCENE, "AppSidebar"),
			...reader.propsPassedTo(SCENE, "WorkspaceShell"),
		]
		const leftOut = Object.keys({
			...LEFT_OUT_OF_THE_SIDEBAR,
			...LEFT_OUT_OF_THE_SHELL,
		})

		expect(
			leftOut.filter(
				(prop) => !appProps.includes(prop) || sceneProps.includes(prop),
			),
		).toEqual([])
	})
})

type BadgeCarriersBySpaceId = Record<string, { badge?: BotBadge }[]>

type RailSources = {
	conversationsBySpaceId: BadgeCarriersBySpaceId
	waitingMissionCount: number
	spaceId: string | null
}

type MissionCarriersBySpaceId = Record<
	string,
	{ missions?: AppSidebarRowMission[] }[]
>

type SidebarBadgeRule = {
	toSpaceBadges: (
		...groups: BadgeCarriersBySpaceId[]
	) => Record<string, BotBadge>
	toRailSignals: (sources: RailSources) => AppRailDots
	missionRingBadges: (
		rowsBySpaceId: MissionCarriersBySpaceId,
	) => BadgeCarriersBySpaceId
}

const loadSidebarBadgeRule = async (): Promise<SidebarBadgeRule> => {
	const [sidebarBadges, missionsModel] = await Promise.all([
		import(resolve(REPOSITORY, SIDEBAR_BADGES)),
		import(resolve(REPOSITORY, MISSIONS_MODEL)),
	])
	return {
		toSpaceBadges: sidebarBadges.toSpaceBadges,
		toRailSignals: sidebarBadges.toRailSignals,
		missionRingBadges: missionsModel.missionRingBadges,
	}
}

const bySpaceId = <Row>(
	spaces: SceneSpace[],
	rowsOf: (space: SceneSpace) => Row[],
) => Object.fromEntries(spaces.map((space) => [space.id, rowsOf(space)]))

const waitingMissionCountOf = (space: SceneSpace) =>
	space.missions.filter((mission) => mission.state === "waiting_human").length

const nobodyJoinedOrShared = {}

const appRailOf = (
	rule: SidebarBadgeRule,
	spaces: SceneSpace[],
	selected: SceneSpace,
) => {
	const rowsBySpaceId = bySpaceId(spaces, (space) => space.rows)
	const conversationsBySpaceId = bySpaceId(
		spaces,
		(space) => space.conversations,
	)
	return {
		badgesBySpaceId: rule.toSpaceBadges(
			rowsBySpaceId,
			conversationsBySpaceId,
			rule.missionRingBadges(rowsBySpaceId),
			rule.missionRingBadges(conversationsBySpaceId),
		),
		hostBySpaceId: nobodyJoinedOrShared,
		railDots: rule.toRailSignals({
			conversationsBySpaceId,
			waitingMissionCount: waitingMissionCountOf(selected),
			spaceId: selected.id,
		}),
		space: {
			id: selected.id,
			name: selected.name,
			colour: selected.colour,
			avatarSeed: selected.avatarSeed,
		},
		spaceHost: undefined,
	}
}

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

describe("the landing scene rail indicators against apps/app", () => {
	let rule: SidebarBadgeRule

	beforeAll(async () => {
		rule = await loadSidebarBadgeRule()
	})

	it.each(SCENE_SPACES.map((space) => [space.id, space]))(
		"passes AppRail what the app rule draws with %s selected",
		(_, selected) => {
			expect(sceneRailOf(SCENE_SPACES, selected)).toEqual(
				appRailOf(rule, SCENE_SPACES, selected),
			)
		},
	)

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
		"badges another Space holding %s as the app does",
		(badge) => {
			const lit = withRowBadge(
				withoutMissions(SCENE_SPACES),
				PERSONAL.id,
				badge,
			)

			expect(sceneRailOf(lit, WORK)).toEqual(appRailOf(rule, lit, WORK))
			expect(sceneRailOf(lit, WORK).badgesBySpaceId).toEqual({
				[PERSONAL.id]: badge,
			})
		},
	)
})

describe("the landing scene mission chips against apps/app", () => {
	it("reads the app's mission-state to chip-state table, so any change to it is reviewed on the landing", () => {
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
