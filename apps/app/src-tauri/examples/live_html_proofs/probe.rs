use std::thread;
use std::time::{Duration, Instant};

use kiroshi_app::live_html::LiveViews;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::async_runtime::block_on;
use tauri::AppHandle;

const POLL: Duration = Duration::from_millis(100);
const READING_TIMEOUT: Duration = Duration::from_secs(8);
const TRIGGER: &str = "spike-host-probe";
const TRACE_READING: &str = "JSON.stringify(window.__spikeHostTrace ?? null)";
pub const TRACER: &str = r#"(() => {
	const BEACON = /\/beacon\/([^/]+)\//;
	const source = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
	if (window === top) {
		window.__spikeHostTrace = [];
		addEventListener("message", (event) => {
			if (typeof event.data?.spikeHostTrace === "string") {
				window.__spikeHostTrace.push(event.data.spikeHostTrace);
			}
		});
	}
	Object.defineProperty(HTMLImageElement.prototype, "src", {
		...source,
		set(url) {
			const [, attempt] = BEACON.exec(String(url)) ?? [];
			if (attempt) {
				top.postMessage({ spikeHostTrace: attempt }, "*");
			}
			source.set.call(this, url);
		},
	});
})();"#;
const READING: &str = r#"(() => {
	const KEY = "spike-view-value";
	const STORE = "spike-view";
	const failure = (cause) => `blocked-${cause?.name ?? cause}`;
	const found = (value) => (value ? `read-${value}` : "none");
	const outcome = (work) => Promise.resolve().then(work).catch(failure);
	const fetched = (url, options, describe) =>
		Promise.resolve()
			.then(() => fetch(url, options))
			.then(
				(response) => ({ outcome: describe(response), status: response.status }),
				(cause) => ({ outcome: failure(cause), status: null }),
			);
	const settled = (request) =>
		new Promise((resolve, reject) => {
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
	const readDatabase = async () => {
		const known = await indexedDB.databases();
		if (!known.some((database) => database.name === STORE)) {
			return "none";
		}
		const database = await settled(indexedDB.open(STORE));
		if (!database.objectStoreNames.contains("values")) {
			return "none";
		}
		return found(await settled(database.transaction("values").objectStore("values").get(KEY)));
	};
	const readCache = async () => {
		const cache = await caches.open(STORE);
		const [first] = await cache.keys();
		return first ? found(await (await cache.match(first)).text()) : "none";
	};
	return Promise.all([
		outcome(() => found(localStorage.getItem(KEY))),
		outcome(readDatabase),
		outcome(() => found(document.cookie)),
		outcome(readCache),
		fetched("https://cdn.jsdelivr.net/npm/lodash@4.17.21/package.json", undefined, (response) =>
			response.ok ? "ok" : `status-${response.status}`,
		),
		fetched("https://example.com/", { mode: "no-cors" }, () => "ok"),
	]).then(([localStorage, indexedDb, cookie, cache, allowlisted, otherHost]) => {
		return JSON.stringify({
			documentUrl: location.href,
			localStorage,
			indexedDb,
			cookie,
			cache,
			allowlistedFetch: allowlisted.outcome,
			allowlistedFetchStatus: allowlisted.status,
			otherHostFetch: otherHost.outcome,
			otherHostFetchStatus: otherHost.status,
		});
	});
})()"#;

#[derive(Deserialize, Serialize)]
#[serde(rename_all(deserialize = "camelCase"))]
pub struct ViewReading {
	pub document_url: String,
	pub local_storage: String,
	pub indexed_db: String,
	pub cookie: String,
	pub cache: String,
	pub allowlisted_fetch: String,
	pub allowlisted_fetch_status: Option<u16>,
	pub other_host_fetch: String,
	pub other_host_fetch_status: Option<u16>,
}

impl ViewReading {
	pub fn stores_holding(&self, value: &str) -> Vec<&'static str> {
		[
			("local_storage", &self.local_storage),
			("indexed_db", &self.indexed_db),
			("cookie", &self.cookie),
			("cache", &self.cache),
		]
		.into_iter()
		.filter(|(_, content)| content.contains(value))
		.map(|(store, _)| store)
		.collect()
	}
}

pub type HostReading = Result<ViewReading, String>;
pub type HostTrace = Result<Vec<String>, String>;

pub fn evidence<T: Serialize>(reading: &Result<T, String>) -> Value {
	match reading {
		Ok(read) => json!(read),
		Err(cause) => json!({ "unavailable": cause }),
	}
}

pub fn frame_responder() -> String {
	format!(
		r#"addEventListener("message", (event) => {{
	if (event.data !== "{TRIGGER}") {{
		return;
	}}
	{READING}.then((reading) => event.source.postMessage({{ spikeHostReading: reading }}, "*"));
}});"#
	)
}

fn script(slot: &str) -> String {
	format!(
		r#"addEventListener("message", (event) => {{
	if (event.data?.spikeHostReading) {{
		window.{slot} = event.data.spikeHostReading;
	}}
}});
frames[0].postMessage("{TRIGGER}", "*");"#
	)
}

fn read_served_document(reading: &str, served_url: &str) -> HostReading {
	let reading: ViewReading = serde_json::from_str(reading)
		.map_err(|cause| format!("unreadable host probe reading: {cause}"))?;
	if reading.document_url != served_url {
		return Err(format!(
			"the host read the document {} while the view server served {served_url}",
			reading.document_url
		));
	}
	Ok(reading)
}

pub struct MountedView<'a> {
	pub views: &'a LiveViews,
	pub app: &'a AppHandle,
	pub id: &'a str,
}

impl MountedView<'_> {
	pub fn evaluate(&self, script: &str) -> Result<String, String> {
		block_on(self.views.evaluate(self.app, self.id.to_owned(), script.to_owned()))
			.map_err(|failure| format!("{failure:?}"))
	}
}

pub fn read(view: &MountedView<'_>, served_url: &str) -> HostReading {
	let slot = format!("__spikeHostProbe{}", uuid::Uuid::new_v4().simple());
	view.evaluate(&script(&slot))?;
	let deadline = Instant::now() + READING_TIMEOUT;
	while Instant::now() < deadline {
		thread::sleep(POLL);
		let reading = answer(view, &format!("window.{slot} ?? \"\""))?;
		if !reading.is_empty() {
			return read_served_document(&reading, served_url);
		}
	}
	Err(format!("the host probe gave no reading within {} seconds", READING_TIMEOUT.as_secs()))
}

pub fn reached_attempts(view: &MountedView<'_>) -> HostTrace {
	let trace = answer(view, TRACE_READING)?;
	serde_json::from_str::<Option<Vec<String>>>(&trace)
		.map_err(|cause| format!("unreadable host trace: {cause}"))?
		.ok_or_else(|| "the document the host read holds no host trace".to_owned())
}

fn answer(view: &MountedView<'_>, expression: &str) -> Result<String, String> {
	let answer = view.evaluate(expression)?;
	serde_json::from_str(&answer)
		.map_err(|cause| format!("unreadable host probe answer {answer:?}: {cause}"))
}
