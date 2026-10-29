/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_RELAY_URL?: string
}

interface Window {
	twq?: (command: string, ...parameters: unknown[]) => void
}
