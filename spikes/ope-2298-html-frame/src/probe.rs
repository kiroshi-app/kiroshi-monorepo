use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::WebviewWindow;

const POLL: Duration = Duration::from_millis(100);
const ANSWER_TIMEOUT: Duration = Duration::from_secs(2);
const READING_TIMEOUT: Duration = Duration::from_secs(8);
const TRIGGER: &str = "spike-host-probe";
const READING: &str = r#"(() => {
	const KEY = "spike-view-value";
	const STORE = "spike-view";
	const failure = (cause) => `blocked-${cause?.name ?? cause}`;
	const found = (value) => (value ? `read-${value}` : "none");
	const outcome = (work) => Promise.resolve().then(work).catch(failure);
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
		outcome(() =>
			fetch("https://cdn.jsdelivr.net/npm/lodash@4.17.21/package.json").then((response) =>
				response.ok ? "ok" : `status-${response.status}`,
			),
		),
		outcome(() => fetch("https://example.com/", { mode: "no-cors" }).then(() => "ok")),
	]).then(([localStorage, indexedDb, cookie, cache, allowlistedFetch, otherHostFetch]) => {
		return JSON.stringify({
			localStorage,
			indexedDb,
			cookie,
			cache,
			allowlistedFetch,
			otherHostFetch,
		});
	});
})()"#;

#[derive(Deserialize, Serialize)]
#[serde(rename_all(deserialize = "camelCase"))]
pub struct ViewReading {
	pub local_storage: String,
	pub indexed_db: String,
	pub cookie: String,
	pub cache: String,
	pub allowlisted_fetch: String,
	pub other_host_fetch: String,
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

pub fn evidence(reading: &HostReading) -> Value {
	match reading {
		Ok(view) => json!(view),
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

pub fn read(window: &WebviewWindow, target: Target) -> HostReading {
	let slot = format!("__spikeHostProbe{}", uuid::Uuid::new_v4().simple());
	window.eval(script(target, &slot)).map_err(|cause| cause.to_string())?;
	let deadline = Instant::now() + READING_TIMEOUT;
	while Instant::now() < deadline {
		thread::sleep(POLL);
		let reading = poll(window, &slot)?;
		if !reading.is_empty() {
			return serde_json::from_str(&reading)
				.map_err(|cause| format!("unreadable host probe reading: {cause}"));
		}
	}
	Err(format!("the host probe gave no reading within {} seconds", READING_TIMEOUT.as_secs()))
}

fn poll(window: &WebviewWindow, slot: &str) -> Result<String, String> {
	let (sender, receiver) = mpsc::channel();
	window
		.eval_with_callback(format!("window.{slot} ?? \"\""), move |answer| {
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
