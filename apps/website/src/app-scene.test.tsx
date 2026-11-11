import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { I18nProvider } from "@workspace/ui/components/i18n-provider"

import { AppScene } from "./app-scene"
import { SCENE_COPY } from "./copy"
import { SCENE_SPACES, spaceOf } from "./scene-cast"

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

const conversationIcons = () => [
	...scene().querySelectorAll("[data-slot=conversation-subject-icon]"),
]

const ICON_OWNER = [
	"[data-slot=sidebar-menu-button]",
	"[data-slot=title-bar-tab]",
	"[data-slot=header-conversation-button]",
].join(", ")

const conversationOwning = (icon: Element) => {
	const label = icon.closest(ICON_OWNER)?.textContent ?? ""
	return SCENE_SPACES.flatMap((space) => space.conversations).find(({ name }) =>
		label.includes(name),
	)
}

const hueOf = (color?: number | null) => (color == null ? "" : String(color))

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
	scene().querySelectorAll("[data-slot=roster-zone-header]")

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

	it("draws the Space logo local, with no presence dot, in either Space", () => {
		renderScene()

		expect(presenceDots()).toHaveLength(0)

		switchToPersonal()

		expect(presenceDots()).toHaveLength(0)
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

	it("draws every conversation icon in the colour of its look, each with its own pictogram", () => {
		renderScene()

		const icons = conversationIcons()
		expect(icons).not.toHaveLength(0)
		for (const icon of icons) {
			const conversation = conversationOwning(icon)
			expect(conversation).toBeDefined()
			expect(icon.getAttribute("data-hue")).toBe(hueOf(conversation?.color))
		}
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
