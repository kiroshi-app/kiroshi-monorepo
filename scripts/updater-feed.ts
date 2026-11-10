import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

export type UpdaterArtifact = { signature: string; url: string }

export type UpdaterFeed = {
	version: string
	notes: string
	pub_date: string
	platforms: Record<string, UpdaterArtifact>
}

type FeedRequest = {
	tag: string
	repository: string
	notes: string
	pubDate: string
	signatureOf: (file: string) => string
}

export const packageOf = (version: string): Record<string, string> => {
	const macArm = `Kiroshi_${version}_aarch64.app.tar.gz`
	const macIntel = `Kiroshi_${version}_x86_64.app.tar.gz`
	const debian = `Kiroshi_${version}_amd64.deb`
	const windows = `Kiroshi_${version}_x64-setup.exe`
	return {
		"darwin-aarch64": macArm,
		"darwin-aarch64-app": macArm,
		"darwin-x86_64": macIntel,
		"darwin-x86_64-app": macIntel,
		"linux-x86_64": debian,
		"linux-x86_64-deb": debian,
		"windows-x86_64": windows,
		"windows-x86_64-nsis": windows,
	}
}

export const updaterFeed = ({
	tag,
	repository,
	notes,
	pubDate,
	signatureOf,
}: FeedRequest): UpdaterFeed => {
	const version = tag.replace(/^v/, "")
	const download = `https://github.com/${repository}/releases/download/${tag}`
	return {
		version,
		notes,
		pub_date: pubDate,
		platforms: Object.fromEntries(
			Object.entries(packageOf(version)).map(([platform, file]) => [
				platform,
				{ signature: signatureOf(file), url: `${download}/${file}` },
			]),
		),
	}
}

export const signatureIn = (folder: string) => (file: string) => {
	const path = join(folder, `${file}.sig`)
	if (!existsSync(path))
		throw new Error(`no updater signature ${file}.sig in ${folder}`)
	return readFileSync(path, "utf8").trim()
}

const usage =
	"usage: bun scripts/updater-feed.ts <tag> <repository> <notes-file> <signatures-folder> <output-file>"

const main = ([tag, repository, notesFile, folder, output]: string[]) => {
	if (!tag || !repository || !notesFile || !folder || !output)
		throw new Error(usage)
	const feed = updaterFeed({
		tag,
		repository,
		notes: readFileSync(notesFile, "utf8"),
		pubDate: new Date().toISOString(),
		signatureOf: signatureIn(folder),
	})
	writeFileSync(output, `${JSON.stringify(feed, null, "\t")}\n`)
	console.log(
		`updater-feed  ${output} lists ${Object.keys(feed.platforms).join(", ")}`,
	)
}

if (import.meta.main) {
	try {
		main(process.argv.slice(2))
	} catch (failure) {
		console.error(`updater-feed  ${(failure as Error).message}`)
		process.exit(1)
	}
}
