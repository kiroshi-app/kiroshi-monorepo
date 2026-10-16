import { describe, expect, it } from "vitest"

import permissionModes from "@workspace/shared/permission-modes.json"
import {
	BLANK_BOT_PERMISSIONS,
	BOT_PERMISSION_MODES,
	readBotPermissionMode,
} from "@workspace/ui/components/bot-settings"
import { bots as en } from "@workspace/ui/lib/i18n-en/bots"
import { bots as fr } from "@workspace/ui/lib/i18n-fr/bots"

describe("the bot permission modes", () => {
	it("are the shared modes, in the shared order", () => {
		expect(BOT_PERMISSION_MODES).toEqual(permissionModes.modes)
	})

	it("start a companion nobody has ruled on on the shared fallback", () => {
		expect(BLANK_BOT_PERMISSIONS.defaultMode).toBe(permissionModes.fallback)
	})
})

describe("readBotPermissionMode", () => {
	it.each(permissionModes.modes)("reads the %s mode as itself", (mode) => {
		expect(readBotPermissionMode(mode)).toBe(mode)
	})

	it.each(["bypassPermissions", "", "Auto"])(
		"reads %j, outside the shared modes, as the shared fallback",
		(value) => {
			expect(readBotPermissionMode(value)).toBe(permissionModes.fallback)
		},
	)
})

describe.each([
	["en", en],
	["fr", fr],
] as const)("the %s catalogue", (_, catalogue) => {
	it.each(permissionModes.modes)("labels and hints the %s mode", (mode) => {
		expect(catalogue.approvals.mode.option).toHaveProperty(
			[mode, "label"],
			expect.any(String),
		)
		expect(catalogue.approvals.mode.option).toHaveProperty(
			[mode, "hint"],
			expect.any(String),
		)
	})
})
