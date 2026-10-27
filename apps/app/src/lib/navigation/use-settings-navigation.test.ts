// @vitest-environment happy-dom

import {
	createMemoryHistory,
	createRootRouteWithContext,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router"
import { act, cleanup, render } from "@testing-library/react"
import { createElement } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { NO_CLICK_MODIFIERS } from "@workspace/ui/lib/click-modifiers"

import { validateSettingsSearch } from "./settings-search"
import {
	type SettingsNavigation,
	useSettingsNavigation,
} from "./use-settings-navigation"

import type { ThreadHolder } from "../tabs/use-tab-thread-sync"
import type { WorkspaceTabs } from "../tabs/workspace-tabs"

const USER_SETTINGS = "/settings/user"

const MIDDLE_CLICK = { ...NO_CLICK_MODIFIERS, middle: true }

const MOD_CLICK = { ...NO_CLICK_MODIFIERS, meta: true }

const NO_HELD_THREAD = {
	roster: {
		getState: () => ({ selectedBotId: null, selectedConversationId: null }),
	},
	openedMission: { getState: () => null },
} as unknown as ThreadHolder

const shown: { navigation: SettingsNavigation | null } = { navigation: null }

const NavigationProbe = () => {
	shown.navigation = useSettingsNavigation(NO_HELD_THREAD)
	return null
}

const settingsRouterOn = (tabs: Pick<WorkspaceTabs, "openInNewTab">) => {
	const root = createRootRouteWithContext<{ tabs: typeof tabs }>()({
		component: NavigationProbe,
	})
	const userSettings = createRoute({
		getParentRoute: () => root,
		path: USER_SETTINGS,
		validateSearch: validateSettingsSearch,
	})
	const spaceSettings = createRoute({
		getParentRoute: () => root,
		path: "/settings/space/$spaceId",
		validateSearch: validateSettingsSearch,
	})
	return createRouter({
		routeTree: root.addChildren([userSettings, spaceSettings]),
		history: createMemoryHistory({ initialEntries: [USER_SETTINGS] }),
		context: { tabs },
	})
}

const renderSettingsNavigation = async () => {
	const openInNewTab = vi.fn()
	const router = settingsRouterOn({ openInNewTab })
	await act(async () => {
		render(
			createElement(RouterProvider, {
				router,
			} as unknown as Parameters<typeof RouterProvider>[0]),
		)
		await router.load()
	})
	const navigation = shown.navigation
	if (!navigation) {
		throw new Error("the settings navigation never rendered")
	}
	const shownHref = () => router.state.location.href
	return { navigation, openInNewTab, shownHref }
}

describe("useSettingsNavigation", () => {
	afterEach(() => {
		cleanup()
		shown.navigation = null
	})

	it("opens a settings entry in a background tab from new-tab keys handed once the click is over, leaving the shown page", async () => {
		const { navigation, openInNewTab, shownHref } =
			await renderSettingsNavigation()

		act(() => {
			navigation.showEntry("skills", MIDDLE_CLICK)
			navigation.showEntry("history", MOD_CLICK)
		})

		expect(openInNewTab.mock.calls).toEqual([
			[`${USER_SETTINGS}?entry=skills`, undefined],
			[`${USER_SETTINGS}?entry=history`, undefined],
		])
		expect(shownHref()).toBe(USER_SETTINGS)
	})

	it("shows a settings entry in place on a plain click", async () => {
		const { navigation, openInNewTab, shownHref } =
			await renderSettingsNavigation()

		await act(async () => navigation.showEntry("skills", NO_CLICK_MODIFIERS))

		expect(openInNewTab).not.toHaveBeenCalled()
		expect(shownHref()).toBe(`${USER_SETTINGS}?entry=skills`)
	})

	it("opens a Space settings in a background tab on a new-tab click, leaving the shown page", async () => {
		const { navigation, openInNewTab, shownHref } =
			await renderSettingsNavigation()

		act(() => {
			navigation.openSpaceSettings("space-garage", {}, MIDDLE_CLICK)
			navigation.openSpaceSettings("space-garage", {}, MOD_CLICK)
		})

		expect(openInNewTab.mock.calls).toEqual([
			["/settings/space/space-garage", undefined],
			["/settings/space/space-garage", undefined],
		])
		expect(shownHref()).toBe(USER_SETTINGS)
	})

	it("opens a Space settings in place on a plain click", async () => {
		const { navigation, openInNewTab, shownHref } =
			await renderSettingsNavigation()

		await act(async () =>
			navigation.openSpaceSettings("space-garage", {}, NO_CLICK_MODIFIERS),
		)

		expect(openInNewTab).not.toHaveBeenCalled()
		expect(shownHref()).toBe("/settings/space/space-garage")
	})
})
