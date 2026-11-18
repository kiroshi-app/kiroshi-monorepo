import { describe, expect, it } from "bun:test"

import {
	compareVersions,
	computeNext,
	describeMainBump,
	nextMainVersion,
	planMainBump,
} from "./release"

const SCRIPT = new URL("./release.ts", import.meta.url).pathname

const runRelease = (...args: string[]) =>
	Bun.spawnSync(["bun", SCRIPT, ...args], { stdout: "pipe", stderr: "pipe" })

describe("release", () => {
	it("accepts an explicit beta version", () => {
		expect(computeNext("0.24.1", "0.25.0-beta.1")).toBe("0.25.0-beta.1")
	})

	it("accepts an explicit version from a beta current", () => {
		expect(computeNext("0.25.0-beta.1", "0.25.0-beta.2")).toBe("0.25.0-beta.2")
		expect(computeNext("0.25.0-beta.2", "0.25.0")).toBe("0.25.0")
	})

	it("still bumps a stable current", () => {
		expect(computeNext("0.24.1", "patch")).toBe("0.24.2")
		expect(computeNext("0.24.1", "minor")).toBe("0.25.0")
		expect(computeNext("0.24.1", "major")).toBe("1.0.0")
	})

	it("refuses to bump a beta current and asks for an explicit version", () => {
		for (const bump of ["patch", "minor", "major"])
			expect(() => computeNext("0.25.0-beta.1", bump)).toThrow(
				/explicit version/,
			)
	})

	it("refuses a pre-release suffix other than beta", () => {
		expect(() => computeNext("0.24.1", "0.25.0-rc.1")).toThrow(
			/Invalid argument/,
		)
	})

	it("prints the beta tag on a dry run", () => {
		const result = runRelease("0.0.0-beta.1", "--dry-run")
		expect(result.exitCode).toBe(0)
		expect(result.stdout.toString()).toContain(
			"-> 0.0.0-beta.1 (v0.0.0-beta.1)",
		)
	})

	it("refuses the dropped --notes option", () => {
		const result = runRelease("patch", "--notes", "notes.md", "--dry-run")
		expect(result.exitCode).toBe(1)
		expect(result.stderr.toString()).toContain("Usage: bun run release")
	})

	it("moves main to the next minor beta.0 after a stable X.Y.0", () => {
		expect(nextMainVersion("0.27.0")).toBe("0.28.0-beta.0")
		expect(nextMainVersion("1.9.0")).toBe("1.10.0-beta.0")
	})

	it("moves main nowhere after a beta or a patch", () => {
		expect(nextMainVersion("0.27.0-beta.5")).toBeUndefined()
		expect(nextMainVersion("0.27.1")).toBeUndefined()
	})

	it("orders a beta below its stable and betas by number", () => {
		expect(compareVersions("0.28.0-beta.0", "0.28.0-beta.1")).toBe(-1)
		expect(compareVersions("0.28.0-beta.1", "0.28.0")).toBe(-1)
		expect(compareVersions("0.27.1", "0.28.0-beta.0")).toBe(-1)
		expect(compareVersions("0.28.0-beta.0", "0.28.0-beta.0")).toBe(0)
		expect(compareVersions("0.28.0", "0.27.9")).toBe(1)
	})

	it("opens the main bump when origin/main reads a lower version", () => {
		expect(planMainBump("0.28.0-beta.0", "0.27.0-beta.5")).toEqual({
			kind: "open",
			version: "0.28.0-beta.0",
			branch: "chore/bump-main-0.28.0-beta.0",
			title: "chore(app): move main to 0.28.0-beta.0",
		})
	})

	it("skips the main bump when origin/main reads it or above", () => {
		for (const mainVersion of ["0.28.0-beta.0", "0.28.0-beta.2", "0.29.0"]) {
			const bump = planMainBump("0.28.0-beta.0", mainVersion)
			expect(bump.kind).toBe("skip")
			expect(describeMainBump(bump)).toBe(
				`Main bump skipped: origin/main already reads ${mainVersion}, at or above 0.28.0-beta.0.`,
			)
		}
	})

	it("prints the main bump of a stable on a dry run", () => {
		const result = runRelease("99.0.0", "--dry-run")
		expect(result.exitCode).toBe(0)
		expect(result.stdout.toString()).toContain(
			'Main bump: chore/bump-main-99.1.0-beta.0 moves main to 99.1.0-beta.0, pull request "chore(app): move main to 99.1.0-beta.0".',
		)
		expect(result.stdout.toString()).toContain(
			"Dry run: nothing written, committed or pushed.",
		)
	})

	it("prints the skipped main bump on a dry run when main is already above", () => {
		const result = runRelease("0.1.0", "--dry-run")
		expect(result.exitCode).toBe(0)
		expect(result.stdout.toString()).toMatch(
			/Main bump skipped: origin\/main already reads \S+, at or above 0\.2\.0-beta\.0\./,
		)
	})

	it("prints no main bump on a dry run of a beta or a patch", () => {
		for (const version of ["0.27.0-beta.6", "0.27.1"]) {
			const result = runRelease(version, "--dry-run")
			expect(result.exitCode).toBe(0)
			expect(result.stdout.toString()).not.toContain("Main bump")
		}
	})

	it("leaves the working tree untouched on a dry run", () => {
		const status = () =>
			Bun.spawnSync(["git", "status", "--porcelain"]).stdout.toString()
		const before = status()
		runRelease("99.0.0", "--dry-run")
		expect(status()).toBe(before)
	})
})
