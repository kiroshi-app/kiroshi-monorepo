const DEFAULT_SIMULATOR = "iPhone 17"
const RUNTIME_PREFIX = "com.apple.CoreSimulator.SimRuntime.iOS-27-"

type Simulator = {
	name: string
	udid: string
	state: string
}

type DeviceList = {
	devices: Record<string, Simulator[]>
}

type DeviceType = {
	name: string
	identifier: string
}

type DeviceTypeList = {
	devicetypes: DeviceType[]
}

type Runtime = {
	identifier: string
	isAvailable: boolean
}

type RuntimeList = {
	runtimes: Runtime[]
}

const fail = (reason: string): never => {
	console.error(`\n✖ simulator: ${reason}`)
	process.exit(1)
}

const simctl = (args: string[]) => {
	const { exitCode, stdout, stderr } = Bun.spawnSync([
		"xcrun",
		"simctl",
		...args,
	])
	if (exitCode !== 0) {
		fail(
			`\`xcrun simctl ${args.join(" ")}\` failed: ${stderr.toString().trim()}`,
		)
	}
	return stdout.toString()
}

const findSimulator = (name: string) => {
	const { devices }: DeviceList = JSON.parse(
		simctl(["list", "devices", "available", "--json"]),
	)
	return Object.entries(devices)
		.filter(([runtime]) => runtime.startsWith(RUNTIME_PREFIX))
		.flatMap(([, simulators]) => simulators)
		.find((simulator) => simulator.name === name)
}

const createSimulator = (name: string) => {
	const { devicetypes }: DeviceTypeList = JSON.parse(
		simctl(["list", "devicetypes", "--json"]),
	)
	const deviceType = devicetypes
		.filter((type) => name.endsWith(type.name))
		.sort((a, b) => b.name.length - a.name.length)[0]
	if (!deviceType) {
		return fail(
			`"${name}" doesn't end with a device type. Name the simulator after its device, e.g. "OPE-NN iPhone 17".`,
		)
	}
	const { runtimes }: RuntimeList = JSON.parse(
		simctl(["list", "runtimes", "--json"]),
	)
	const runtime = runtimes
		.filter(
			({ identifier, isAvailable }) =>
				isAvailable && identifier.startsWith(RUNTIME_PREFIX),
		)
		.at(-1)
	if (!runtime) {
		return fail("no iOS 27 runtime. Install it in Xcode, Settings, Components.")
	}
	console.error(`▶ simulator: creating "${name}" (${deviceType.name})`)
	return simctl([
		"create",
		name,
		deviceType.identifier,
		runtime.identifier,
	]).trim()
}

export const bootSimulator = () => {
	// biome-ignore lint/suspicious/noUndeclaredEnvVars: the iOS scripts are not turbo tasks
	const name = Bun.env.IOS_SIMULATOR || DEFAULT_SIMULATOR
	const simulator = findSimulator(name)
	const udid = simulator?.udid ?? createSimulator(name)
	if (simulator?.state !== "Booted") {
		console.error(`▶ simulator: booting "${name}" (${udid})`)
		simctl(["bootstatus", udid, "-b"])
	}
	return udid
}

if (import.meta.main) {
	console.log(bootSimulator())
}
