use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::Webview;

const POLL: Duration = Duration::from_millis(100);
const ANSWER_TIMEOUT: Duration = Duration::from_secs(2);
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

#[derive(Clone, Copy)]
pub enum Target {
	Document,
	FirstFrame,
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

fn script(target: Target, slot: &str) -> String {
	match target {
		Target::Document => format!("{READING}.then((reading) => {{ window.{slot} = reading; }});"),
		Target::FirstFrame => format!(
			r#"addEventListener("message", (event) => {{
	if (event.data?.spikeHostReading) {{
		window.{slot} = event.data.spikeHostReading;
	}}
}});
frames[0].postMessage("{TRIGGER}", "*");"#
		),
	}
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

pub fn read(webview: &Webview, target: Target, served_url: &str) -> HostReading {
	let slot = format!("__spikeHostProbe{}", uuid::Uuid::new_v4().simple());
	webview.eval(script(target, &slot)).map_err(|cause| cause.to_string())?;
	let deadline = Instant::now() + READING_TIMEOUT;
	while Instant::now() < deadline {
		thread::sleep(POLL);
		let reading = answer(webview, &format!("window.{slot} ?? \"\""))?;
		if !reading.is_empty() {
			return read_served_document(&reading, served_url);
		}
	}
	Err(format!("the host probe gave no reading within {} seconds", READING_TIMEOUT.as_secs()))
}

pub fn reached_attempts(webview: &Webview) -> HostTrace {
	let trace = answer(webview, TRACE_READING)?;
	serde_json::from_str::<Option<Vec<String>>>(&trace)
		.map_err(|cause| format!("unreadable host trace: {cause}"))?
		.ok_or_else(|| "the document the host read holds no host trace".to_owned())
}

fn answer(webview: &Webview, expression: &str) -> Result<String, String> {
	let (sender, receiver) = mpsc::channel();
	webview
		.eval_with_callback(expression, move |answer| {
			if sender.send(answer).is_err() {
				eprintln!("a host probe answer arrived after its deadline");
			}
		})
		.map_err(|cause| cause.to_string())?;
	let answer = receiver
		.recv_timeout(ANSWER_TIMEOUT)
		.map_err(|cause| format!("the host probe was not answered: {cause}"))?;
	serde_json::from_str(&answer)
		.map_err(|cause| format!("unreadable host probe answer {answer:?}: {cause}"))
}

#[cfg(test)]
mod tests {
	use super::*;

	const SERVED_URL: &str = "http://127.0.0.1:4100/token/hostile.html";

	fn reading_of(document_url: &str) -> String {
		json!({
			"documentUrl": document_url,
			"localStorage": "none",
			"indexedDb": "none",
			"cookie": "none",
			"cache": "none",
			"allowlistedFetch": "ok",
			"allowlistedFetchStatus": 200,
			"otherHostFetch": "blocked-TypeError",
			"otherHostFetchStatus": null,
		})
		.to_string()
	}

	#[test]
	fn a_reading_of_the_served_document_is_kept() {
		let reading = read_served_document(&reading_of(SERVED_URL), SERVED_URL);
		assert!(reading.is_ok_and(|view| view.other_host_fetch == "blocked-TypeError"));
	}

	#[test]
	fn a_reading_of_another_document_is_a_fault_that_names_both_urls() {
		let fault = read_served_document(&reading_of("chrome-error://chromewebdata/"), SERVED_URL)
			.err()
			.unwrap_or_default();
		assert!(fault.contains("chrome-error://chromewebdata/") && fault.contains(SERVED_URL));
	}
}
