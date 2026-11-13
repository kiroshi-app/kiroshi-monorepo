/// <reference types="node" />

import { resolve } from "node:path"

import ts from "typescript"
import { beforeAll, describe, expect, it } from "vitest"

import type { AppSidebarRowMission } from "@workspace/ui/components/app-sidebar"
import type { BotBadge } from "@workspace/ui/components/bot-badge"

import { SCENE_SPACES, type SceneSpace, spaceOf } from "./scene-cast"
import { sceneRailOf } from "./scene-rail"

import { CHIP_STATE_OF } from "../../app/src/lib/missions/mission-chip-states"

const REPOSITORY = resolve(import.meta.dirname, "../../..")

const NAVIGATION_SIDEBAR_CALL =
	"apps/app/src/components/workspace-navigation-sidebar.tsx"
const EXPANDED_ROWS_CALL = "apps/app/src/components/expanded-sidebar-rows.tsx"
const SHELL_CALL = "apps/app/src/components/workspace-frame.tsx"
const SCENE = "apps/website/src/app-scene.tsx"
const SIDEBAR_BADGES = "apps/app/src/lib/chat/sidebar-badges.ts"
const MISSIONS_MODEL = "apps/app/src/lib/missions/missions-model.ts"

const LEFT_OUT_OF_THE_SIDEBAR: Record<string, string> = {
	"data-tauri-drag-region": "a web page holds no Tauri window to drag",
	windowControls: "macOS draws no caption buttons, the scene paints its lights",
	listStatus: "the scene roster never loads and never fails to load",
	onRetryList: "the scene roster never fails to load",
	update: "the scene shows an app that is up to date",
	missionCount: "the scene rail draws no dot, so it counts no mission",
	openMissionId: "no mission thread opens in the scene",
	isSettingsShown: "no settings screen opens in the scene",
	incomingTab: "no tab arrives from another window on a web page",
	onSelectLibrary: "the scene opens no Library, so its rail draws no entry",
	onToggleSidebar: "the scene keeps its sidebar open, so it draws no toggle",
}

const SCENE_PROP_OF_SIDEBAR_PROP: Record<string, string> = {
	destination: "openPanel",
	listEnd: "rosterListEnd",
	onNewConversation: "onCreateConversation",
	onOpenChange: "onSpaceSwitcherOpenChange",
	onOpenConversation: "onSelectConversation",
	onOpenSettings: "onOpenUserSettings",
	onSelectMissions: "onOpenPanelChange",
	openConversationId: "selectedConversationId",
	pinned: "conversations",
	renderSpaceList: "conversationsBySpaceId",
	sections: "sectionsBySpaceId",
	zones: "conversations",
}

const SCENE_PROPS_THE_SECTIONS_SLOT_READS = ["collapsedSectionIds"]

const AGENT_ROWS_ARE_GONE =
	"the scene still draws the agent rows of AppSidebar, the shell lists none"

const SCENE_PROPS_THE_SHELL_NO_LONGER_TAKES: Record<string, string> = {
	bots: AGENT_ROWS_ARE_GONE,
	botsBySpaceId: AGENT_ROWS_ARE_GONE,
	onAddBotToSpace: AGENT_ROWS_ARE_GONE,
	onCreateBot: AGENT_ROWS_ARE_GONE,
	onDeleteBot: AGENT_ROWS_ARE_GONE,
	onDuplicateBot: AGENT_ROWS_ARE_GONE,
	onEditBot: AGENT_ROWS_ARE_GONE,
	onOpenBotInNewTab: AGENT_ROWS_ARE_GONE,
	onRemoveBotFromSpace: AGENT_ROWS_ARE_GONE,
	onSelectBot: AGENT_ROWS_ARE_GONE,
	selectedBotId: AGENT_ROWS_ARE_GONE,
	haveBotsFailedToLoad: "the scene roster never fails to load",
	sidebar: "the app renders its sidebar as a child of the shell",
	space: "the switcher reads the Space from spaces and selectedSpaceId",
	spaceHost: "the switcher reads the host from hostBySpaceId",
}

const LEFT_OUT_OF_THE_SHELL: Record<string, string> = {
	width: "the scene keeps no saved sidebar width, the shell holds its own",
	onWidthChange:
		"the scene keeps no saved sidebar width, the shell holds its own",
	open: "the scene keeps its sidebar open",
	onOpenChange: "the scene keeps its sidebar open",
}

const SLOW_PROGRAM_MS = 60_000

type PropReader = {
	propsPassedTo: (file: string, tag: string) => string[]
	propsOfObject: (file: string, property: string) => string[]
	propsOfVariable: (file: string, name: string) => string[]
	propsReadOn: (file: string, name: string) => string[]
	propsAcceptedBy: (file: string, tag: string) => string[]
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

	const someIn = (
		file: string,
		isWanted: (node: ts.Node) => boolean,
		absence: string,
	) => {
		const found = nodesIn(file, isWanted)
		if (found.length === 0) throw new Error(`${file} ${absence}`)
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

	const openingsOf = (file: string, tag: string) => {
		const source = sourceOf(file)
		return someIn(
			file,
			(node) =>
				(ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
				node.tagName.getText(source) === tag,
			`renders no <${tag}>`,
		) as (ts.JsxOpeningElement | ts.JsxSelfClosingElement)[]
	}

	const propsPassedTo = (file: string, tag: string) =>
		openingsOf(file, tag).flatMap((opening) => [
			...opening.attributes.properties.flatMap(attributeNamesOf),
			...(hasChildren(opening) ? ["children"] : []),
		])

	const propsAcceptedBy = (file: string, tag: string) =>
		openingsOf(file, tag).flatMap((opening) => {
			const [props] = checker
				.getTypeAtLocation(opening.tagName)
				.getCallSignatures()
				.flatMap((signature) => signature.getParameters())
			if (!props) throw new Error(`<${tag}> takes no props`)
			return checker
				.getTypeOfSymbolAtLocation(props, opening)
				.getProperties()
				.map((property) => property.getName())
		})

	const propsOfVariable = (file: string, name: string) => {
		const source = sourceOf(file)
		const declarations = someIn(
			file,
			(node) =>
				ts.isVariableDeclaration(node) &&
				node.name.getText(source) === name &&
				node.initializer !== undefined &&
				ts.isObjectLiteralExpression(node.initializer),
			`declares no ${name} object`,
		) as ts.VariableDeclaration[]
		return declarations.flatMap((declaration) =>
			namesOf(declaration.initializer as ts.Expression),
		)
	}

	const propsReadOn = (file: string, name: string) => {
		const source = sourceOf(file)
		const reads = someIn(
			file,
			(node) =>
				ts.isPropertyAccessExpression(node) &&
				node.expression.getText(source) === name,
			`reads nothing on ${name}`,
		) as ts.PropertyAccessExpression[]
		return reads.map((read) => read.name.getText(source))
	}

	const propsOfObject = (file: string, property: string) => {
		const source = sourceOf(file)
		const assignments = someIn(
			file,
			(node) =>
				ts.isPropertyAssignment(node) &&
				node.name.getText(source) === property &&
				ts.isObjectLiteralExpression(node.initializer),
			`builds no ${property} object`,
		) as ts.PropertyAssignment[]
		return assignments.flatMap((assignment) => namesOf(assignment.initializer))
	}

	return {
		propsPassedTo,
		propsOfObject,
		propsOfVariable,
		propsReadOn,
		propsAcceptedBy,
	}
}

const sidebarPropsOf = (reader: PropReader) => [
	...reader
		.propsPassedTo(NAVIGATION_SIDEBAR_CALL, "NavigationSidebar")
		.map((prop) => SCENE_PROP_OF_SIDEBAR_PROP[prop] ?? prop),
	...reader.propsOfObject(SHELL_CALL, "titleBar"),
]

const shellPropsOf = (reader: PropReader) =>
	reader.propsPassedTo(SHELL_CALL, "WorkspaceShellRoot")

const scenePropsOf = (reader: PropReader) => [
	...reader.propsPassedTo(SCENE, "AppSidebar"),
	...reader.propsPassedTo(SCENE, "WorkspaceShell"),
]

const propsTheShellTakes = (reader: PropReader) => [
	...reader.propsAcceptedBy(NAVIGATION_SIDEBAR_CALL, "NavigationSidebar"),
	...reader.propsAcceptedBy(SHELL_CALL, "AppTitleBar"),
	...reader.propsAcceptedBy(SHELL_CALL, "WorkspaceShellRoot"),
	...reader.propsOfVariable(EXPANDED_ROWS_CALL, "rows"),
	...reader.propsReadOn(EXPANDED_ROWS_CALL, "actions"),
	...SCENE_PROPS_THE_SECTIONS_SLOT_READS,
	...Object.values(SCENE_PROP_OF_SIDEBAR_PROP),
]

const missingFrom = (scene: string[], app: string[]) =>
	[...new Set(app)].filter((prop) => !scene.includes(prop)).sort()

describe("the landing scene against apps/app", () => {
	let reader: PropReader

	beforeAll(() => {
		reader = createPropReader([
			NAVIGATION_SIDEBAR_CALL,
			EXPANDED_ROWS_CALL,
			SHELL_CALL,
			SCENE,
		])
	}, SLOW_PROGRAM_MS)

	it("passes AppSidebar every prop the app passes it", () => {
		const scene = [
			...reader.propsPassedTo(SCENE, "AppSidebar"),
			...Object.keys(LEFT_OUT_OF_THE_SIDEBAR),
		]

		expect(missingFrom(scene, sidebarPropsOf(reader))).toEqual([])
	})

	it("passes AppTitleBar, through AppSidebar, every prop the app's title bar takes", () => {
		const scene = [
			...reader.propsPassedTo(SCENE, "AppSidebar"),
			...Object.keys(LEFT_OUT_OF_THE_SIDEBAR),
		]

		expect(
			missingFrom(scene, reader.propsOfObject(SHELL_CALL, "titleBar")),
		).toEqual([])
	})

	it("passes WorkspaceShell every prop the app passes it", () => {
		const scene = [
			...reader.propsPassedTo(SCENE, "WorkspaceShell"),
			...Object.keys(LEFT_OUT_OF_THE_SHELL),
		]

		expect(missingFrom(scene, shellPropsOf(reader))).toEqual([])
	})

	it("leaves out only props the app still passes and the scene does not", () => {
		const appProps = [...sidebarPropsOf(reader), ...shellPropsOf(reader)]
		const sceneProps = scenePropsOf(reader)
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

	it("passes no prop the shell no longer takes", () => {
		const taken = [
			...propsTheShellTakes(reader),
			...Object.keys(SCENE_PROPS_THE_SHELL_NO_LONGER_TAKES),
		]

		expect(missingFrom(taken, scenePropsOf(reader))).toEqual([])
	})

	it("excuses only scene props the shell really dropped", () => {
		const taken = propsTheShellTakes(reader)
		const sceneProps = scenePropsOf(reader)

		expect(
			Object.keys(SCENE_PROPS_THE_SHELL_NO_LONGER_TAKES).filter(
				(prop) => taken.includes(prop) || !sceneProps.includes(prop),
			),
		).toEqual([])
	})
})

type BadgeCarriersBySpaceId = Record<string, { badge?: BotBadge }[]>

type MissionCarriersBySpaceId = Record<
	string,
	{ missions?: AppSidebarRowMission[] }[]
>

type SidebarBadgeRule = {
	toSpaceBadges: (
		...groups: BadgeCarriersBySpaceId[]
	) => Record<string, BotBadge>
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
		missionRingBadges: missionsModel.missionRingBadges,
	}
}

const bySpaceId = <Row>(
	spaces: SceneSpace[],
	rowsOf: (space: SceneSpace) => Row[],
) => Object.fromEntries(spaces.map((space) => [space.id, rowsOf(space)]))

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
	it("pins the chip-state table the scene reads from apps/app, so any change to it is reviewed on the landing", () => {
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
