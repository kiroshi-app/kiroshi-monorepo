// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react"
import { createElement } from "react"
import { afterEach, describe, expect, it } from "vitest"

import { i18n } from "@workspace/ui/lib/i18n"

import { MissionsRoute } from "@/components/missions-route"
import { takesPress } from "@/lib/host/fake-window-drag"
import type { WorkspaceAssembly } from "@/lib/workspace/use-workspace-assembly"
import { WorkspaceContext } from "@/lib/workspace/workspace-context"

const WORKSPACE_WITH_NO_MISSION = {
	rosterLines: { now: 0 },
	sidebarMissions: {
		page: {
			missions: [],
			onOpen: () => undefined,
			onRetry: () => undefined,
		},
	},
} as unknown as WorkspaceAssembly

const mountMissions = () =>
	render(
		createElement(
			WorkspaceContext.Provider,
			{ value: WORKSPACE_WITH_NO_MISSION },
			createElement(MissionsRoute),
		),
	)

afterEach(cleanup)

describe("MissionsRoute with nothing selected", () => {
	it("wears the Missions header as the static bar above the list", () => {
		mountMissions()
		const layout = document.querySelector(
			'[data-slot="missions-page"] [data-slot="screen-layout"]',
		) as HTMLElement
		const bar = layout.querySelector('[data-slot="app-header"]') as HTMLElement
		const title = screen.getByRole("heading", {
			name: i18n.t("chat:missions.page.title"),
		})

		expect(layout.firstElementChild).toBe(bar)
		expect(bar.contains(title)).toBe(true)
		expect(
			document.querySelector('[data-slot="screen-layout-floating-header"]'),
		).toBeNull()
		expect(document.querySelector('[data-slot="header-island"]')).toBeNull()
		expect(takesPress(title)).toBe(true)
		expect(takesPress(bar)).toBe(true)
	})
})
