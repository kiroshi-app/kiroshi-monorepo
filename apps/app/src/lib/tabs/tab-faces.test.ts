// @vitest-environment happy-dom

import { cleanup, render } from "@testing-library/react"
import { createElement, type ReactElement } from "react"
import { afterEach, describe, expect, it } from "vitest"

import {
	type ConversationIconName,
	ConversationIcons,
	Icons,
} from "@workspace/ui/components/icons"
import { i18n } from "@workspace/ui/lib/i18n"

import { type TabFaceSources, tabFaceOf } from "./tab-faces"

const NOVA = { id: "nova", name: "Nova" }

const ROOM = { id: "room", name: "Round table", icon: "Bug" }

const SOURCES: TabFaceSources = {
	bots: [NOVA],
	conversations: [ROOM],
	missionTitles: { "m-1": "Fix the login redirect" },
}

const markupOf = (icon: unknown) =>
	render(icon as ReactElement).container.innerHTML

const rootOf = (icon: unknown) =>
	render(icon as ReactElement).container.firstElementChild as HTMLElement

const glyphMarkupOf = (name: ConversationIconName) => {
	const markup = markupOf(createElement(ConversationIcons[name]))
	cleanup()
	return markup
}

const roomFaceWith = (icon: string | undefined) =>
	tabFaceOf("/?conversation=room", {
		...SOURCES,
		conversations: [{ ...ROOM, icon }],
	})

afterEach(cleanup)

describe("the face of a tab", () => {
	it("draws the bot avatar at 16px and its name for a solo conversation", () => {
		const face = tabFaceOf("/?bot=nova", SOURCES)

		expect(face.title).toBe(NOVA.name)
		const avatar = rootOf(face.icon)
		expect(avatar.dataset.slot).toBe("bot-identity-avatar")
		expect(avatar.style.width).toBe("16px")
		expect(avatar.style.height).toBe("16px")
	})

	it("draws the bare glyph of a room's icon and its title", () => {
		const glyph = glyphMarkupOf("Bug")
		const face = roomFaceWith("Bug")

		expect(face.title).toBe(ROOM.name)
		expect(markupOf(face.icon)).toBe(glyph)
	})

	it.each([undefined, "Unlisted"])(
		"draws the bare message glyph for a room whose icon is %s",
		(icon) => {
			const glyph = glyphMarkupOf("MessageSquare")

			expect(markupOf(roomFaceWith(icon).icon)).toBe(glyph)
		},
	)

	it.each([
		["a room", "/?conversation=room"],
		["Settings", "/settings/user"],
		["a mission", "/?bot=nova&mission=m-1"],
		["an empty page", "/"],
	])("draws %s with a bare icon for the tab icon slot to size", (_, href) => {
		expect(rootOf(tabFaceOf(href, SOURCES).icon).tagName.toLowerCase()).toBe(
			"svg",
		)
	})

	it("draws the flag and the ticket title for a mission thread, the row title while the mission is unread", () => {
		const read = tabFaceOf("/?bot=nova&mission=m-1", SOURCES)
		const unread = tabFaceOf("/?bot=nova&mission=m-2", SOURCES)

		expect(read.title).toBe("Fix the login redirect")
		expect(unread.title).toBe(NOVA.name)
		const flag = markupOf(createElement(Icons.Missions))
		cleanup()
		expect(markupOf(read.icon)).toBe(flag)
	})

	it.each([
		["/settings/user", i18n.t("settings:screen.subtitle.user")],
		["/settings/space/home", i18n.t("settings:screen.subtitle.space")],
		["/settings/companion/nova", i18n.t("settings:screen.subtitle.agent")],
		[
			"/settings/user?entry=skills&application=github",
			i18n.t("settings:screen.subtitle.user"),
		],
		[
			"/settings/space/home?application=github",
			i18n.t("settings:screen.subtitle.space"),
		],
		[
			"/settings/companion/nova?entry=history&application=github",
			i18n.t("settings:screen.subtitle.agent"),
		],
	])("titles %s %s", (href, title) => {
		expect(tabFaceOf(href, SOURCES).title).toBe(title)
	})

	it.each([
		"/settings/user?entry=mcp&application=github",
		"/settings/space/home?entry=mcp&application=github",
		"/settings/companion/nova?entry=mcp&application=github",
	])("titles %s with the application it shows", (href) => {
		expect(tabFaceOf(href, SOURCES).title).toBe("github")
	})

	it("titles the empty list New tab", () => {
		expect(tabFaceOf("/", SOURCES).title).toBe(i18n.t("common:titleBar.newTab"))
	})
})
