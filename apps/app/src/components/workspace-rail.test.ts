// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { type ComponentProps, createElement } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { Space } from "@workspace/ui/components/space"
import { i18n } from "@workspace/ui/lib/i18n"

import { WorkspaceRail } from "@/components/workspace-rail"
import type { SettingsNavigation } from "@/lib/navigation/use-settings-navigation"
import type { RosterLines } from "@/lib/workspace/use-roster-lines"
import type { RosterLists } from "@/lib/workspace/use-roster-lists"
import type { SettingsPanels } from "@/lib/workspace/use-settings-panels"
import type { useSidebarPanelSwitch } from "@/lib/workspace/use-sidebar-panel-switch"
import type { WorkspaceCore } from "@/lib/workspace/use-workspace-core"
import type { WorkspaceOverlay } from "@/lib/workspace/use-workspace-overlay"

const HOME: Space = { id: "home", name: "Home", colour: "red" }
const GARAGE: Space = { id: "garage", name: "Garage", colour: "blue" }
const SPACE_SETTINGS = i18n.t("bots:rail.spaceSettings")

type RailProps = ComponentProps<typeof WorkspaceRail>

const railPropsFor = (
	selectedSpaceId: string,
	navigation: Partial<SettingsNavigation> = {},
): RailProps => ({
	collapsedSectionIds: [],
	core: {} as WorkspaceCore,
	navigation: navigation as SettingsNavigation,
	overlay: {} as WorkspaceOverlay,
	panels: { railSettings: "space" } as SettingsPanels,
	requestLeave: (leave) => leave(),
	rosterLines: {} as RosterLines,
	rosterLists: {} as RosterLists,
	sidebarTab: { openTab: "conversations" } as ReturnType<
		typeof useSidebarPanelSwitch
	>,
	switcher: { spaces: [HOME, GARAGE], selectedSpaceId },
})

const railLogoTint = () =>
	screen
		.getByRole("button", { name: SPACE_SETTINGS })
		.querySelector<HTMLElement>("[data-slot='space-dot']")?.style
		.backgroundColor

afterEach(cleanup)

describe("the rail on a settings screen", () => {
	it("draws its logo in the selected Space colour", () => {
		render(createElement(WorkspaceRail, railPropsFor(GARAGE.id)))

		expect(railLogoTint()).toBe("var(--bot-blot-blue)")
	})

	it("repaints its logo when another Space is selected", () => {
		const { rerender } = render(
			createElement(WorkspaceRail, railPropsFor(HOME.id)),
		)
		expect(railLogoTint()).toBe("var(--bot-blot-red)")

		rerender(createElement(WorkspaceRail, railPropsFor(GARAGE.id)))

		expect(railLogoTint()).toBe("var(--bot-blot-blue)")
	})

	it("opens the selected Space settings when its logo is pressed", () => {
		const openSpaceSettings = vi.fn()
		render(
			createElement(
				WorkspaceRail,
				railPropsFor(GARAGE.id, { openSpaceSettings }),
			),
		)

		fireEvent.click(screen.getByRole("button", { name: SPACE_SETTINGS }))

		expect(openSpaceSettings).toHaveBeenCalledOnce()
	})
})
