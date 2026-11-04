import type { LibraryLinkPreview } from "@workspace/ui/components/library-block-web-page"

// TODO: read the page title, site and image once the host offers a link preview reader.
export const readLinkPreview = (url: string): Promise<LibraryLinkPreview> =>
	Promise.resolve({ url, title: "" })
