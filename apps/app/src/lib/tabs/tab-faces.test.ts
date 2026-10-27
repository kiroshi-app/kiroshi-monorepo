// @vitest-environment happy-dom

import { cleanup, render } from "@testing-library/react"
import { createElement, type ReactElement } from "react"
import { afterEach, describe, expect, it } from "vitest"

import { Icons } from "@workspace/ui/components/icons"
import { i18n } from "@workspace/ui/lib/i18n"

import { type TabFaceSources, tabFaceOf } from "./tab-faces"

const NOVA = { id: "nova", name: "Nova" }

const ROOM = { id: "room", name: "Round table" }

const SOURCES: TabFaceSources = {
	bots: [NOVA],
	conversations: [ROOM],
	missionTitles: { "m-1": "Fix the login redirect" },
}

const markupOf = (icon: unknown) =>
	render(icon as ReactElement).container.innerHTML

afterEach(cleanup)

describe("the face of a tab", () => {
	it("draws the bot avatar and its name for a solo conversation", () => {
		const face = tabFaceOf("/?bot=nova", SOURCES)

		expect(face.title).toBe(NOVA.name)
		expect(markupOf(face.icon)).toContain("bot-identity-avatar")
	})

	it("draws the subject icon and the title for a room", () => {
		const face = tabFaceOf("/?conversation=room", SOURCES)

		expect(face.title).toBe(ROOM.name)
		expect(markupOf(face.icon)).toContain("conversation-subject-icon")
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
		["/settings/companion/nova", i18n.t("settings:screen.subtitle.companion")],
	])("titles %s %s", (href, title) => {
		expect(tabFaceOf(href, SOURCES).title).toBe(title)
	})

	it("titles the empty list New tab", () => {
		expect(tabFaceOf("/", SOURCES).title).toBe(i18n.t("common:titleBar.newTab"))
	})
})
