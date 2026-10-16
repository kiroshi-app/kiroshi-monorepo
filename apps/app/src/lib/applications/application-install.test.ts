import { expect, it } from "vitest"

import "@workspace/ui/lib/i18n"

import { installFailureOf } from "./application-install"

it("keeps the kind and detail of a refusal carrying a kind", () => {
	expect(installFailureOf({ kind: "storage", detail: "disk full" })).toContain(
		"storage: disk full",
	)
})

it("serializes a plain object carrying no kind, never [object Object]", () => {
	const failure = installFailureOf({ code: 28 })

	expect(failure).toContain('{"code":28}')
	expect(failure).not.toContain("[object Object]")
})
