import { describe, expect, it } from "bun:test"

import { computeNext } from "./release"

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
})
