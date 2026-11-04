import type { LibraryLinkPreview } from "@workspace/ui/components/library-block-web-page"

import { commands } from "../bindings"

type PreviewAnswer = Awaited<ReturnType<typeof commands.libraryReadLinkPreview>>

const bareLinkOf = (url: string): LibraryLinkPreview => ({ url, title: "" })

const previewOf = (url: string, answer: PreviewAnswer): LibraryLinkPreview =>
	answer.status === "ok" ? { ...answer.data, url } : bareLinkOf(url)

export const readLinkPreview = (url: string): Promise<LibraryLinkPreview> =>
	commands.libraryReadLinkPreview(url).then(
		(answer) => previewOf(url, answer),
		() => bareLinkOf(url),
	)
