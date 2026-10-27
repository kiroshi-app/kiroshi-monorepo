// @vitest-environment happy-dom

import { cleanup, renderHook } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import {
	type ClickModifiers,
	NO_CLICK_MODIFIERS,
} from "@workspace/ui/lib/click-modifiers"

import { useCompanionSelectGuard } from "./companion-select"

const commandKey = vi.hoisted(() => ({ isUsed: true }))

vi.mock("../host", async (importOriginal) => ({
	...(await importOriginal<typeof import("../host")>()),
	usesCommandKey: () => commandKey.isUsed,
}))

const SPACE = "space-home"

const MEMBER = "bot-member"

afterEach(() => {
	cleanup()
	commandKey.isUsed = true
})

const renderGuard = () => {
	const source = {
		rosters: { [SPACE]: [{ id: MEMBER }] },
		openSpaceId: SPACE,
		select: vi.fn(),
		leaveMission: vi.fn(),
		openThreadInNewTab: vi.fn(),
	}
	const { result } = renderHook(() => useCompanionSelectGuard(source))
	return { selectCompanion: result.current, source }
}

const NEW_TAB_CLICKS: [string, boolean, Partial<ClickModifiers>][] = [
	["a middle click", true, { middle: true }],
	["a Cmd click on macOS", true, { meta: true }],
	["a Ctrl click off macOS", false, { ctrl: true }],
]

it.each(NEW_TAB_CLICKS)(
	"opens the companion thread in a new background tab on %s",
	(_, isCommandKeyUsed, held) => {
		commandKey.isUsed = isCommandKeyUsed
		const { selectCompanion, source } = renderGuard()

		selectCompanion(MEMBER, { ...NO_CLICK_MODIFIERS, ...held })

		expect(source.openThreadInNewTab).toHaveBeenCalledWith({ bot: MEMBER })
		expect(source.leaveMission).not.toHaveBeenCalled()
		expect(source.select).not.toHaveBeenCalled()
	},
)

it("selects the companion in place on a plain click", () => {
	const { selectCompanion, source } = renderGuard()

	selectCompanion(MEMBER, NO_CLICK_MODIFIERS)

	expect(source.leaveMission).toHaveBeenCalled()
	expect(source.select).toHaveBeenCalledWith(MEMBER)
	expect(source.openThreadInNewTab).not.toHaveBeenCalled()
})

it("leaves a companion outside the open Space alone, even on a middle click", () => {
	const { selectCompanion, source } = renderGuard()

	selectCompanion("bot-elsewhere", { ...NO_CLICK_MODIFIERS, middle: true })

	expect(source.openThreadInNewTab).not.toHaveBeenCalled()
	expect(source.select).not.toHaveBeenCalled()
})
