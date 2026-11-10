import { dirname, join } from "node:path"

import { compile } from "./compile"

import { prepareProviders, stageProviders } from "../src/providers/build"

const BINARY_NAME = "kiroshi-agent"

const sidecarRoot = dirname(import.meta.dir)
const binariesDirectory = join(sidecarRoot, "binaries")

const hostTargetTriple = () => {
	const rustc = Bun.spawnSync(["rustc", "-vV"])
	if (!rustc.success) {
		throw new Error(
			"rustc is required to name the sidecar after the host target triple",
		)
	}
	const host = /^host: (.+)$/m.exec(rustc.stdout.toString())
	if (!host) {
		throw new Error("rustc -vV did not report a host triple")
	}
	return host[1].trim()
}

const targetTriple = hostTargetTriple()
await prepareProviders()
stageProviders({ directory: binariesDirectory, targetTriple })

compile(
	join(sidecarRoot, "src", "index.ts"),
	join(binariesDirectory, `${BINARY_NAME}-${targetTriple}`),
)
