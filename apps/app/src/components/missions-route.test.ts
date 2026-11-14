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
	it("floats the Missions header as an island over the list", () => {
		mountMissions()
		const header = document.querySelector(
			'[data-slot="screen-layout-floating-header"]',
		) as HTMLElement
		const title = screen.getByRole("heading", {
			name: i18n.t("chat:missions.page.title"),
		})

		expect(header.contains(title.closest('[data-slot="header-island"]'))).toBe(
			true,
		)
		expect(takesPress(title)).toBe(true)
		expect(takesPress(header)).toBe(false)
	})
})
