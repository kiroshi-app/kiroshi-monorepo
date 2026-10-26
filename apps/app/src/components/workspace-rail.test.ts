// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { createElement } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@workspace/ui/lib/i18n"

import { WorkspaceRail } from "@/components/workspace-rail"
import type { JoinedSpace, Space } from "@/lib/bindings"
import type { SettingsNavigation } from "@/lib/navigation/use-settings-navigation"
import type { JoinedSpacesController } from "@/lib/spaces/joined-spaces-controller"
import { useSwitcherSpaces } from "@/lib/spaces/use-joined-spaces"
import type { RosterLines } from "@/lib/workspace/use-roster-lines"
import type { RosterLists } from "@/lib/workspace/use-roster-lists"
import type { SettingsPanels } from "@/lib/workspace/use-settings-panels"
import type { useSidebarPanelSwitch } from "@/lib/workspace/use-sidebar-panel-switch"
import type { WorkspaceCore } from "@/lib/workspace/use-workspace-core"
import type { WorkspaceOverlay } from "@/lib/workspace/use-workspace-overlay"

const OWNED = { position: 0, createdAt: 0, shared: false }
const HOME: Space = { ...OWNED, id: "home", name: "Home", colour: "red" }
const GARAGE: Space = { ...OWNED, id: "garage", name: "Garage", colour: "blue" }
const STUDIO: JoinedSpace = {
	id: "studio-host",
	hostUrl: "https://studio.example",
	remoteSpaceId: "studio",
	name: "Studio Nord",
	state: "online",
	hostedBy: "Lea",
	colour: "purple",
}
const SPACE_SETTINGS = i18n.t("bots:rail.spaceSettings")
const SETTINGS_RAILS: SettingsPanels["railSettings"][] = ["space", "you"]

const NO_INVITATIONS = {
	rows: [],
	accept: () => undefined,
	decline: () => undefined,
	sweepWithdrawn: () => undefined,
}

type RailHarnessProps = {
	selectedSpaceId: string
	railSettings?: SettingsPanels["railSettings"]
	navigation?: Partial<SettingsNavigation>
}

const RailHarness = ({
	selectedSpaceId,
	railSettings = "space",
	navigation = {},
}: RailHarnessProps) => {
	const switcher = useSwitcherSpaces(
		{ spaces: [HOME, GARAGE], selectedSpaceId },
		{
			state: {
				joinedSpaces: [STUDIO],
				hasFailedToLoad: false,
				openId: STUDIO.id,
				departed: null,
			},
			controller: {} as JoinedSpacesController,
			hosts: { active: null, connections: {} },
		},
		NO_INVITATIONS,
	)
	return createElement(WorkspaceRail, {
		collapsedSectionIds: [],
		core: {} as WorkspaceCore,
		navigation: navigation as SettingsNavigation,
		overlay: {} as WorkspaceOverlay,
		panels: { railSettings } as SettingsPanels,
		requestLeave: (leave) => leave(),
		rosterLines: {} as RosterLines,
		rosterLists: {} as RosterLists,
		sidebarTab: { openTab: "conversations" } as ReturnType<
			typeof useSidebarPanelSwitch
		>,
		space: switcher.selectedSpace,
	})
}

const railLogoTint = () =>
	screen
		.getByRole("button", { name: SPACE_SETTINGS })
		.querySelector<HTMLElement>("[data-slot='space-dot']")?.style
		.backgroundColor

afterEach(cleanup)

describe.each(SETTINGS_RAILS)(
	"the rail on the %s settings screen",
	(railSettings) => {
		it("wears the colour of the owned Space that is open", () => {
			render(
				createElement(RailHarness, { selectedSpaceId: HOME.id, railSettings }),
			)

			expect(railLogoTint()).toBe("var(--bot-blot-red)")
		})

		it("wears the host colour of the joined Space that is open", () => {
			render(
				createElement(RailHarness, {
					selectedSpaceId: "studio",
					railSettings,
				}),
			)

			expect(railLogoTint()).toBe("var(--bot-blot-purple)")
		})

		it("repaints its logo when another Space is selected", () => {
			const { rerender } = render(
				createElement(RailHarness, { selectedSpaceId: HOME.id, railSettings }),
			)
			expect(railLogoTint()).toBe("var(--bot-blot-red)")

			rerender(
				createElement(RailHarness, {
					selectedSpaceId: GARAGE.id,
					railSettings,
				}),
			)

			expect(railLogoTint()).toBe("var(--bot-blot-blue)")
		})
	},
)

describe("the rail on a settings screen", () => {
	it("falls back to the first Space when none matches the selection", () => {
		render(createElement(RailHarness, { selectedSpaceId: "gone" }))

		expect(railLogoTint()).toBe("var(--bot-blot-red)")
	})

	it("opens the selected Space settings when its logo is pressed", () => {
		const openSpaceSettings = vi.fn()
		render(
			createElement(RailHarness, {
				selectedSpaceId: GARAGE.id,
				navigation: { openSpaceSettings },
			}),
		)

		fireEvent.click(screen.getByRole("button", { name: SPACE_SETTINGS }))

		expect(openSpaceSettings).toHaveBeenCalledOnce()
	})
})
