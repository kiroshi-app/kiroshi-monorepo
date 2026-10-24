import { bootSimulator } from "./simulator"

const BUNDLE_ID = "com.kiroshi.app.ios"
const DERIVED_DATA = "apps/ios/build"
const APP_PATH = `${DERIVED_DATA}/Build/Products/Debug-iphonesimulator/Kiroshi.app`

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

run("generate", ["bun", "run", "ios:generate"])
const udid = bootSimulator()
console.log(`\n▶ simulator: ${udid}`)
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
