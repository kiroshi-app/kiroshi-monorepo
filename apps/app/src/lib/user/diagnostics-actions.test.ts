import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { raiseFailureNotice } from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import { diagnosticsActions } from "./diagnostics-actions"

import { commands, type Diagnostics } from "../bindings"

vi.mock("../bindings", async (original) => {
	const bindings = await original<typeof import("../bindings")>()
	return {
		...bindings,
		commands: {
			...bindings.commands,
			diagnostics: vi.fn(),
			logTail: vi.fn(),
			logReveal: vi.fn(),
			logClear: vi.fn(),
		},
	}
})

vi.mock("@workspace/ui/components/notice-surface", async (original) => ({
	...(await original<object>()),
	raiseFailureNotice: vi.fn(() => "notice-1"),
}))

type ClipboardItems = Record<string, Promise<Blob>>

const failureNotice = vi.mocked(raiseFailureNotice)
const diagnostics = vi.mocked(commands.diagnostics)
const logReveal = vi.mocked(commands.logReveal)
const logClear = vi.mocked(commands.logClear)

const THIS_MAC: Diagnostics = {
	appVersion: "0.24.1",
	gitCommit: "ad6778c",
	installKind: "installed",
	osName: "macOS",
	osBuild: "15.1 (24B83)",
	arch: "aarch64",
	ramBytes: 16 * 1024 ** 3,
	agentVersion: null,
	provider: null,
	agentError: null,
	side: "local",
	plan: null,
}

const UNREVEALED = {
	status: "error",
	error: { kind: "unrevealed", detail: "no file manager" },
} as const

const copiedTexts: string[] = []

const clipboard = {
	write: vi.fn(async ([item]: { items: ClipboardItems }[]) => {
		const blob = await item?.items["text/plain"]
		if (blob) copiedTexts.push(await blob.text())
	}),
}

const raisedTitles = () =>
	failureNotice.mock.calls.map(([notice]) => notice.title)

beforeEach(() => {
	copiedTexts.length = 0
	clipboard.write.mockClear()
	failureNotice.mockClear()
	diagnostics.mockReset().mockResolvedValue(THIS_MAC)
	logReveal.mockReset().mockResolvedValue({ status: "ok", data: null })
	logClear.mockReset().mockResolvedValue({ status: "ok", data: null })
	vi.stubGlobal("navigator", { clipboard })
	vi.stubGlobal(
		"ClipboardItem",
		class {
			constructor(readonly items: ClipboardItems) {}
		},
	)
})

afterEach(() => {
	vi.unstubAllGlobals()
})

it("copies the Specs block alone, read from diagnostics", async () => {
	diagnosticsActions.onDiagnosticsCopy()

	await vi.waitFor(() =>
		expect(copiedTexts).toEqual([
			[
				"-- Specs",
				"App version: 0.24.1",
				"Commit: ad6778c",
				"Install: installed",
				"OS: macOS",
				"OS build: 15.1 (24B83)",
				"Arch: aarch64",
				"RAM: 16 GB",
				"Side: local",
			].join("\n"),
		]),
	)
	expect(failureNotice).not.toHaveBeenCalled()
})

it("names the copy that failed when diagnostics cannot be read", async () => {
	diagnostics.mockRejectedValue(new Error("diagnostics unavailable"))

	diagnosticsActions.onDiagnosticsCopy()

	await vi.waitFor(() =>
		expect(raisedTitles()).toEqual([i18n.t("settings:diagnostics.copyFailed")]),
	)
})

it("names the copy that failed when the clipboard refuses it", async () => {
	clipboard.write.mockRejectedValueOnce(new Error("NotAllowedError"))

	diagnosticsActions.onDiagnosticsCopy()

	await vi.waitFor(() =>
		expect(raisedTitles()).toEqual([i18n.t("settings:diagnostics.copyFailed")]),
	)
})

it("reveals the log file", async () => {
	diagnosticsActions.onLogReveal()

	await vi.waitFor(() => expect(logReveal).toHaveBeenCalledOnce())
	expect(failureNotice).not.toHaveBeenCalled()
})

it("names the reveal that failed when the log cannot be revealed", async () => {
	logReveal.mockResolvedValue(UNREVEALED)

	diagnosticsActions.onLogReveal()

	await vi.waitFor(() =>
		expect(raisedTitles()).toEqual([
			i18n.t("settings:diagnostics.revealFailed"),
		]),
	)
})

it("clears the log file once confirmed", async () => {
	await diagnosticsActions.onLogClear()

	expect(logClear).toHaveBeenCalledOnce()
	expect(failureNotice).not.toHaveBeenCalled()
})

it("names the clear that failed and keeps the confirmation failing", async () => {
	logClear.mockResolvedValue({
		status: "error",
		error: { kind: "unwritable", detail: "read-only volume" },
	})

	await expect(diagnosticsActions.onLogClear()).rejects.toThrow("unwritable")

	await vi.waitFor(() =>
		expect(raisedTitles()).toEqual([
			i18n.t("settings:diagnostics.clear.failed"),
		]),
	)
})
