"use client"

import { type ReactNode, useState } from "react"

import {
	BLANK_MCP_SERVER_DRAFT,
	type BotMcpServerDraft,
	type BotMcpServerItem,
	isMcpServerDraftUnsaved,
	toMcpServerDraft,
} from "@workspace/ui/components/bot-settings"
import type { McpConnectionSection } from "@workspace/ui/components/bot-settings-dialog/mcp-connection"
import { McpServerEditor } from "@workspace/ui/components/bot-settings-dialog/mcp-server-editor"
import type { McpServerEditorLayout } from "@workspace/ui/components/bot-settings-dialog/mcp-server-editor-header"
import type { EnvironmentSection } from "@workspace/ui/components/environment-panel"
import {
	ApplicationInstallPage,
	type ApplicationInstallPageProps,
} from "@workspace/ui/components/plugin-settings/application-install-page"
import {
	ApplicationsCatalogue,
	type ApplicationsCatalogueProps,
} from "@workspace/ui/components/plugin-settings/applications-catalogue"
import {
	type ApplicationsOwner,
	ApplicationsPanel,
} from "@workspace/ui/components/plugin-settings/applications-panel"
import type {
	SessionPages,
	SettingsPages,
} from "@workspace/ui/components/plugin-settings/settings-pages"

type ApplicationInstallSection = Pick<
	ApplicationInstallPageProps,
	"application" | "isInstalling" | "isInstalled" | "failure" | "onInstall"
> & {
	onLeave: () => void
}

type ApplicationsCatalogueSection = Omit<
	ApplicationsCatalogueProps,
	"onBack" | "className"
> & {
	install?: ApplicationInstallSection
	onOpen?: () => void
}

type ApplicationsSection = {
	servers: BotMcpServerItem[]
	haveFailedToLoad?: boolean
	onServerCreate: (name: string, config: Record<string, unknown>) => void
	onServerChange: (
		openedName: string,
		name: string,
		config: Record<string, unknown>,
	) => void
	onServerDelete: (name: string) => void
	onServerOpen?: (name: string | null) => void
	onServerConnect?: (server: BotMcpServerItem) => void
	serverConnection?: McpConnectionSection
	serverEnvironment?: EnvironmentSection
	catalogue?: ApplicationsCatalogueSection
	serverToOpen?: string
}

type McpSessionProps = ApplicationsSection & {
	pages: SettingsPages
	owner: ApplicationsOwner
	isSettingsOpen: boolean
	editorLayout?: McpServerEditorLayout
}

type McpSession = {
	panel: ReactNode
	pages: SessionPages
	openedName?: string
	open: (server: BotMcpServerItem) => void
	add: () => void
	isOpen: boolean
	isUnsaved: boolean
	discard: () => void
}

type OpenedServer = {
	draft: BotMcpServerDraft
	saved?: BotMcpServerDraft
	mark?: string
	displayName?: string
}

const openedServerOf = (server: BotMcpServerItem): OpenedServer => ({
	draft: toMcpServerDraft(server),
	saved: toMcpServerDraft(server),
	mark: server.mark,
	displayName: server.displayName,
})

const useMcpSession = ({
	pages,
	owner,
	servers,
	haveFailedToLoad,
	onServerCreate,
	onServerChange,
	onServerDelete,
	onServerOpen,
	onServerConnect,
	serverConnection,
	serverEnvironment,
	catalogue,
	serverToOpen,
	isSettingsOpen,
	editorLayout,
}: McpSessionProps): McpSession => {
	const askedServer = isSettingsOpen ? serverToOpen : undefined
	const [session, setSession] = useState<OpenedServer | null>(null)
	const [panelQuery, setPanelQuery] = useState("")
	const [requestedServer, setRequestedServer] = useState(askedServer)
	const [pendingServer, setPendingServer] = useState(askedServer)

	if (askedServer !== requestedServer) {
		setRequestedServer(askedServer)
		setPendingServer(askedServer)
	}

	const listedPending = pendingServer
		? servers.find(({ name }) => name === pendingServer)
		: undefined

	const show = (opened: OpenedServer | null) => {
		setPendingServer(undefined)
		pages.leave("catalogue")
		setSession(opened)
		if (opened) {
			pages.push("server")
		} else {
			pages.leave("server")
		}
	}

	if (listedPending) show(openedServerOf(listedPending))

	const open = (opened: OpenedServer | null) => {
		show(opened)
		onServerOpen?.(opened?.saved?.name ?? null)
	}

	const paste = () => open({ draft: BLANK_MCP_SERVER_DRAFT })

	const browse = () => {
		catalogue?.install?.onLeave()
		setPendingServer(undefined)
		pages.push("catalogue")
		catalogue?.onOpen?.()
	}

	const add = catalogue ? browse : paste

	const openServer = (server: BotMcpServerItem) => open(openedServerOf(server))

	const save = (
		{ draft, saved }: OpenedServer,
		config: Record<string, unknown>,
	) => {
		if (saved) {
			onServerChange(saved.name, draft.name, config)
		} else {
			onServerCreate(draft.name, config)
		}

		open(null)
	}

	const remove = (saved: BotMcpServerDraft) => {
		onServerDelete(saved.name)
		open(null)
	}

	const editorFor = (opened: OpenedServer) => {
		const { saved } = opened

		return (
			<McpServerEditor
				connection={serverConnection}
				displayName={opened.displayName}
				draft={opened.draft}
				environment={saved ? serverEnvironment : undefined}
				layout={editorLayout}
				mark={opened.mark}
				onBack={() => open(null)}
				onDelete={saved ? () => remove(saved) : undefined}
				onDraftChange={(next) => setSession({ ...opened, draft: next })}
				onSave={(config) => save(opened, config)}
				saved={saved}
			/>
		)
	}

	const browsedPage = (section: ApplicationsCatalogueSection) => {
		const { install, onOpen, ...browsing } = section

		if (install) {
			const { onLeave, ...installing } = install

			return (
				<ApplicationInstallPage
					{...installing}
					category={browsing.category}
					onBack={onLeave}
					onCategoryChange={browsing.onCategoryChange}
					owner={owner}
				/>
			)
		}

		return (
			<ApplicationsCatalogue
				{...browsing}
				onBack={() => pages.leave("catalogue")}
			/>
		)
	}

	return {
		panel: (
			<ApplicationsPanel
				haveFailedToLoad={haveFailedToLoad}
				onAdd={add}
				onConnect={onServerConnect}
				onOpen={openServer}
				onPaste={paste}
				onQueryChange={setPanelQuery}
				owner={owner}
				query={panelQuery}
				servers={servers}
			/>
		),
		pages: {
			server: session ? editorFor(session) : null,
			catalogue: catalogue ? browsedPage(catalogue) : null,
		},
		openedName: session?.saved?.name,
		open: openServer,
		add,
		isOpen: pages.isPushed("server") || pages.isPushed("catalogue"),
		isUnsaved: Boolean(
			session && isMcpServerDraftUnsaved(session.draft, session.saved),
		),
		discard: () => open(null),
	}
}

export {
	type ApplicationsCatalogueSection,
	type ApplicationsSection,
	type McpSession,
	type McpSessionProps,
	useMcpSession,
}
