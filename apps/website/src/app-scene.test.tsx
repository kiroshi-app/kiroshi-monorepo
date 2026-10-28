import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { AppRail } from "@workspace/ui/components/app-rail"
import { I18nProvider } from "@workspace/ui/components/i18n-provider"

import { AppScene } from "./app-scene"
import { SCENE_COPY } from "./copy"
import { SCENE_SPACES, type SceneSpace, SPACES, spaceOf } from "./scene-cast"
import { sceneRailOf } from "./scene-rail"

const WORK = spaceOf("work")
const PERSONAL = spaceOf("personal")

const renderScene = () =>
	render(
		<I18nProvider>
			<AppScene />
		</I18nProvider>,
	)

const scene = () => screen.getByRole("region", { name: SCENE_COPY.sceneLabel })

const shellHue = () =>
	scene().querySelector("[data-slot=sidebar-wrapper]")?.getAttribute("data-hue")

const tabNamed = (name: string) =>
	within(screen.getByRole("tablist")).getByRole("tab", { name })

const openSpace = (name: string) =>
	fireEvent.click(screen.getByRole("button", { name: `Open ${name}` }))

const switchToPersonal = () => openSpace(SCENE_COPY.spaces.personal)

const conversationIconHues = () =>
	[...scene().querySelectorAll("[data-slot=conversation-subject-icon]")].map(
		(icon) => icon.getAttribute("data-hue"),
	)

const conversationPictograms = () =>
	[
		...scene().querySelectorAll(
			"[data-slot=conversation-subject-icon-pictogram]",
		),
	].map((pictogram) => pictogram.innerHTML)

const sectionNames = () =>
	[...scene().querySelectorAll("[data-slot=roster-section-name]")].map(
		(name) => name.textContent,
	)

const pinnedZoneSeparators = () =>
	scene().querySelectorAll("[data-slot=roster-zone-separator]")

const openMissionsPanel = () =>
	fireEvent.click(screen.getByRole("button", { name: /^Missions/ }))

const missionTools = () =>
	[...scene().querySelectorAll("[data-slot=mission-tool-mark]")].map((tool) =>
		tool.getAttribute("aria-label"),
	)

const waitingChangeSpaceButton = (name: string) =>
	within(scene()).getByRole("button", {
		name: `Change space, ${name} open, waiting for you`,
	})

const withoutMissionsIn = (spaceId: string): SceneSpace[] =>
	SCENE_SPACES.map((space) =>
		space.id === spaceId
			? {
					...space,
					missions: [],
					rows: space.rows.map((row) => ({ ...row, missions: undefined })),
				}
			: space,
	)

const renderRailOf = (spaces: SceneSpace[], selected: SceneSpace) => {
	const { railDots, ...rail } = sceneRailOf(spaces, selected)
	return render(
		<I18nProvider>
			<AppRail
				{...rail}
				dots={railDots}
				selected="conversations"
				spaces={SPACES}
			/>
		</I18nProvider>,
	)
}

const presenceDots = () =>
	scene().querySelectorAll("[data-slot=space-avatar-dot]")

const rosterRowNamed = (name: string) =>
	within(scene()).getAllByRole("button", { name: new RegExp(`^${name}\\b`) })[0]

afterEach(cleanup)

describe("the landing scene", () => {
	it("tints the default Space inside the scene frame and never on the page", () => {
		renderScene()

		expect(shellHue()).toBe(String(WORK.colour))
		expect(document.documentElement.hasAttribute("data-hue")).toBe(false)
	})

	it("repaints the tint, the roster and the tabs when a Space is switched", () => {
		renderScene()

		switchToPersonal()

		expect(shellHue()).toBe(String(PERSONAL.colour))
		expect(document.documentElement.hasAttribute("data-hue")).toBe(false)
		expect(
			tabNamed(PERSONAL.defaultConversation.name).getAttribute("aria-selected"),
		).toBe("true")
	})

	it("draws the Space logo local and lights Change space for the other Space's waiting mission", () => {
		renderScene()

		expect(presenceDots()).toHaveLength(0)
		expect(waitingChangeSpaceButton(WORK.name)).not.toBeNull()

		switchToPersonal()

		expect(presenceDots()).toHaveLength(0)
		expect(waitingChangeSpaceButton(PERSONAL.name)).not.toBeNull()
	})

	it("draws no Change space dot while the selected Space alone waits on the reader", () => {
		renderRailOf(withoutMissionsIn(PERSONAL.id), WORK)

		expect(
			screen.getByRole("button", { name: `Change space, ${WORK.name} open` }),
		).not.toBeNull()
	})

	it("opens several tabs, the active one on the conversation shown", () => {
		renderScene()

		expect(
			within(screen.getByRole("tablist")).getAllByRole("tab"),
		).toHaveLength(WORK.openTabIds.length)
		expect(
			tabNamed(WORK.defaultConversation.name).getAttribute("aria-selected"),
		).toBe("true")
	})

	it("switches the conversation shown when a tab is clicked", () => {
		renderScene()
		const triage = SCENE_COPY.conversations.triage.name

		fireEvent.click(tabNamed(triage))

		expect(tabNamed(triage).getAttribute("aria-selected")).toBe("true")
	})

	it("draws every conversation icon neutral, each with its own pictogram", () => {
		renderScene()

		expect(conversationIconHues().filter((hue) => hue !== null)).toEqual([])
		expect(new Set(conversationPictograms()).size).toBeGreaterThanOrEqual(
			WORK.conversations.length,
		)
	})

	it("shows the pinned zone and a section in every Space", () => {
		renderScene()
		expect(sectionNames()).toContain(SCENE_COPY.sections.support)
		expect(pinnedZoneSeparators()).not.toHaveLength(0)

		switchToPersonal()
		expect(sectionNames()).toContain(SCENE_COPY.sections.home)
	})

	it("lists missions with their tools and ticket in every Space", () => {
		renderScene()
		openMissionsPanel()

		expect(missionTools()).toEqual(expect.arrayContaining(["GitHub", "Paper"]))
		expect(
			screen.queryByText(SCENE_COPY.missions.work.settings.externalId),
		).not.toBeNull()

		switchToPersonal()
		openMissionsPanel()

		expect(missionTools()).toEqual(
			expect.arrayContaining(["Paper", "Superset"]),
		)
		expect(
			screen.queryByText(SCENE_COPY.missions.personal.flat.externalId),
		).not.toBeNull()
	})

	it.each([
		{
			space: SCENE_COPY.spaces.work,
			bot: SCENE_COPY.bots.wren.name,
			ticket: SCENE_COPY.exchanges.wren.missionTicketTitle,
		},
		{
			space: SCENE_COPY.spaces.personal,
			bot: SCENE_COPY.bots.tomo.name,
			ticket: SCENE_COPY.exchanges.tomo.missionTicketTitle,
		},
	])(
		"titles the ticket of the mission $bot opens in $space",
		({ space, bot, ticket }) => {
			renderScene()
			openSpace(space)

			fireEvent.click(rosterRowNamed(bot))

			expect(screen.queryByText(ticket)).not.toBeNull()
		},
	)
})
