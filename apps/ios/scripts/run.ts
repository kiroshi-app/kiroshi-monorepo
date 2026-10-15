const DEFAULT_SIMULATOR = "iPhone 17"
const RUNTIME_PREFIX = "com.apple.CoreSimulator.SimRuntime.iOS-27-"
const BUNDLE_ID = "com.kiroshi.app.ios"
const DERIVED_DATA = "apps/ios/build"
const APP_PATH = `${DERIVED_DATA}/Build/Products/Debug-iphonesimulator/Kiroshi.app`

type Simulator = {
	name: string
	udid: string
	state: string
}

type SimulatorList = {
	devices: Record<string, Simulator[]>
}

const fail = (step: string, reason: string, exitCode = 1): never => {
	console.error(`\n✖ ios:run stopped at the ${step} step: ${reason}`)
	process.exit(exitCode)
}

const run = (step: string, command: string[]) => {
	console.log(`\n▶ ${step}`)
	const exitCode =
		Bun.spawnSync(command, {
			stdio: ["inherit", "inherit", "inherit"],
		}).exitCode ?? 1
	if (exitCode !== 0) {
		fail(
			step,
			`\`${command.join(" ")}\` exited with code ${exitCode}.`,
			exitCode,
		)
	}
}

const listIos27Simulators = () => {
	const { exitCode, stdout } = Bun.spawnSync([
		"xcrun",
		"simctl",
		"list",
		"devices",
		"available",
		"--json",
	])
	if (exitCode !== 0) {
		fail("simulator", "`xcrun simctl list` failed. Check Xcode is installed.")
	}
	const { devices }: SimulatorList = JSON.parse(stdout.toString())
	return Object.entries(devices)
		.filter(([runtime]) => runtime.startsWith(RUNTIME_PREFIX))
		.flatMap(([, simulators]) => simulators)
}

const pickSimulator = () => {
	const simulators = listIos27Simulators()
	// biome-ignore lint/suspicious/noUndeclaredEnvVars: ios:run is not a turbo task
	const requested = Bun.env.IOS_SIMULATOR
	const booted = simulators.find(
		(simulator) =>
			simulator.state === "Booted" && simulator.name.startsWith("iPhone"),
	)
	const simulator = requested
		? simulators.find(({ name }) => name === requested)
		: (booted ?? simulators.find(({ name }) => name === DEFAULT_SIMULATOR))
	if (!simulator) {
		return fail(
			"simulator",
			`no iOS 27 simulator named "${requested ?? DEFAULT_SIMULATOR}". Pick one from \`xcrun simctl list devices available\` and set IOS_SIMULATOR to its name.`,
		)
	}
	console.log(`\n▶ simulator: ${simulator.name} (${simulator.udid})`)
	return simulator
}

run("generate", ["bun", "run", "ios:generate"])
const { udid } = pickSimulator()
run("build", [
	"apps/ios/scripts/xcodebuild.sh",
	"-quiet",
	"-project",
	"apps/ios/Kiroshi.xcodeproj",
	"-scheme",
	"Kiroshi",
	"-destination",
	"generic/platform=iOS Simulator",
	"-derivedDataPath",
	DERIVED_DATA,
	"build",
])
run("boot", ["xcrun", "simctl", "bootstatus", udid, "-b"])
run("install", ["xcrun", "simctl", "install", udid, APP_PATH])
run("launch", [
	"xcrun",
	"simctl",
	"launch",
	"--terminate-running-process",
	udid,
	BUNDLE_ID,
])
run("open DeviceHub", ["open", `devices://device/open?id=${udid}`])
console.log("\n✔ Kiroshi is running in the simulator.")
