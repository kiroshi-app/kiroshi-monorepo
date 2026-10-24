import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const SLOT = fileURLToPath(new URL("./slot.sh", import.meta.url))

const POLL_MS = 50

let home: string
let marks: string

type Holder = { name: string }

const markOf = (name: string) => join(marks, name)

const slotEnvironment = (slots: string) => {
	const { KIROSHI_SLOT: _inherited, ...environment } = process.env
	return { ...environment, HOME: home, KIROSHI_SLOTS: slots }
}

const optIn = () =>
	mkdirSync(join(home, ".kiroshi", "slots"), { recursive: true })

const holdUntilReleased = ({ name }: Holder) =>
	`touch ${markOf(`${name}.started`)}; while [ ! -e ${markOf(`${name}.release`)} ]; do sleep 0.05; done`

const spawnSlotted = (command: string[], slots = "1") =>
	Bun.spawn({
		cmd: [SLOT, ...command],
		env: slotEnvironment(slots),
		stdout: "pipe",
		stderr: "pipe",
	})

const spawnHolder = (holder: Holder, slots: string) =>
	spawnSlotted(["bash", "-c", holdUntilReleased(holder)], slots)

const release = ({ name }: Holder) =>
	writeFileSync(markOf(`${name}.release`), "")

const hasStarted = ({ name }: Holder) => existsSync(markOf(`${name}.started`))

const waitUntil = async (condition: () => boolean, timeoutMs: number) => {
	const deadline = Date.now() + timeoutMs
	while (Date.now() < deadline) {
		if (condition()) return true
		await Bun.sleep(POLL_MS)
	}
	return condition()
}

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), "kiroshi-slot-home-"))
	marks = mkdtempSync(join(tmpdir(), "kiroshi-slot-marks-"))
})

afterEach(() => {
	rmSync(home, { recursive: true, force: true })
	rmSync(marks, { recursive: true, force: true })
})

describe("scripts/slot.sh with the lock directory", () => {
	beforeEach(optIn)

	it("runs N holders at once and makes the next one wait until a holder exits", async () => {
		const first = { name: "first" }
		const second = { name: "second" }
		const waiter = { name: "third" }
		const runningFirst = spawnHolder(first, "2")
		const runningSecond = spawnHolder(second, "2")
		expect(
			await waitUntil(() => hasStarted(first) && hasStarted(second), 5000),
		).toBe(true)

		const waiting = spawnHolder(waiter, "2")
		expect(await waitUntil(() => hasStarted(waiter), 2500)).toBe(false)

		release(first)
		expect(await runningFirst.exited).toBe(0)
		expect(await waitUntil(() => hasStarted(waiter), 3000)).toBe(true)

		release(second)
		release(waiter)
		await Promise.all([runningSecond.exited, waiting.exited])
		const notice = (await new Response(waiting.stderr).text())
			.trim()
			.split("\n")
		expect(notice).toHaveLength(1)
		expect(notice[0]).toMatch(
			/^slot\.sh: bash -c .+ waiting for one of 2 slots for \d+s$/,
		)
	}, 15000)

	it("hands the slot of a holder killed with SIGKILL to the next waiter within 5 seconds", async () => {
		const killed = { name: "killed" }
		const waiter = { name: "waiter" }
		const holding = spawnSlotted([
			"bash",
			"-c",
			`touch ${markOf("killed.started")}; exec sleep 60`,
		])
		expect(await waitUntil(() => hasStarted(killed), 5000)).toBe(true)
		const waiting = spawnHolder(waiter, "1")
		expect(await waitUntil(() => hasStarted(waiter), 1500)).toBe(false)

		holding.kill("SIGKILL")
		await holding.exited
		expect(await waitUntil(() => hasStarted(waiter), 5000)).toBe(true)

		release(waiter)
		expect(await waiting.exited).toBe(0)
	}, 15000)

	it("exits with the exit code of the wrapped command", async () => {
		expect(await spawnSlotted(["bash", "-c", "exit 42"]).exited).toBe(42)
	})

	it.each(["SIGINT", "SIGTERM"] as const)(
		"delivers %s to the wrapped command",
		async (signal) => {
			const trapping = { name: "trapping" }
			const running = spawnSlotted([
				"bash",
				"-c",
				`trap 'exit 3' INT TERM; touch ${markOf("trapping.started")}; while :; do sleep 0.05; done`,
			])
			expect(await waitUntil(() => hasStarted(trapping), 5000)).toBe(true)

			running.kill(signal)
			expect(await running.exited).toBe(3)
		},
	)

	it("runs a nested call inside the slot it already holds", async () => {
		const nesting = spawnSlotted([SLOT, "bash", "-c", "echo nested"])

		expect(await nesting.exited).toBe(0)
		expect(await new Response(nesting.stdout).text()).toBe("nested\n")
		expect(await new Response(nesting.stderr).text()).toBe("")
	})

	it("refuses a KIROSHI_SLOTS that is not a positive integer", async () => {
		const refused = spawnSlotted(["true"], "0")

		expect(await refused.exited).toBe(64)
		expect(await new Response(refused.stderr).text()).toContain("KIROSHI_SLOTS")
	})
})

describe("scripts/slot.sh without the lock directory", () => {
	it("runs the command at once, unchanged and with nothing added", async () => {
		const startedAt = performance.now()
		const running = spawnSlotted([
			"bash",
			"-c",
			"printenv KIROSHI_SLOT || echo unslotted; exit 5",
		])

		expect(await running.exited).toBe(5)
		expect(performance.now() - startedAt).toBeLessThan(1000)
		expect(await new Response(running.stdout).text()).toBe("unslotted\n")
		expect(await new Response(running.stderr).text()).toBe("")
		expect(existsSync(join(home, ".kiroshi"))).toBe(false)
	})
})
