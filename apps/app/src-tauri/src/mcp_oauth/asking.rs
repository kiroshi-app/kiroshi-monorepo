use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use reqwest::header::{ACCEPT, WWW_AUTHENTICATE};
use reqwest::{Client, Response, StatusCode, Url};
use serde_json::json;
use tokio::task::JoinSet;

use crate::missions::github::installed_tls_provider;

const ASKING_BOUND: Duration = Duration::from_millis(3000);

const ANSWER_HELD_MS: i64 = 600_000;

const NO_ANSWER_HELD_MS: i64 = 60_000;

const MCP_ACCEPT: &str = "application/json, text/event-stream";

const MCP_PROTOCOL_VERSION: &str = "2025-06-18";

const PROTECTED_RESOURCE_METADATA: &str = "/.well-known/oauth-protected-resource";

const AUTHORIZATION_SERVERS: &str = "authorization_servers";

struct Answer {
	asks: Option<bool>,
	at: i64,
}

impl Answer {
	fn has_aged(&self, now: i64) -> bool {
		let window = if self.asks.is_some() { ANSWER_HELD_MS } else { NO_ANSWER_HELD_MS };
		now - self.at >= window
	}
}

#[derive(Default)]
pub struct AuthorizationAnswers {
	held: Mutex<HashMap<String, Answer>>,
}

impl AuthorizationAnswers {
	pub async fn asking_authorization(&self, urls: HashSet<String>, now: i64) -> HashSet<String> {
		self.asked_within(urls, now, ASKING_BOUND).await
	}

	async fn asked_within(
		&self,
		urls: HashSet<String>,
		now: i64,
		bound: Duration,
	) -> HashSet<String> {
		let unanswered = self.unanswered(&urls, now);
		for (url, answer) in asked_at_once(unanswered, bound).await {
			self.hold(url, answer, now);
		}
		let held = self.held();
		urls.into_iter()
			.filter(|url| held.get(url).is_some_and(|answer| answer.asks == Some(true)))
			.collect()
	}

	fn unanswered(&self, urls: &HashSet<String>, now: i64) -> Vec<String> {
		let held = self.held();
		urls.iter()
			.filter(|url| held.get(*url).is_none_or(|answer| answer.has_aged(now)))
			.cloned()
			.collect()
	}

	fn hold(&self, url: String, asks: Option<bool>, now: i64) {
		self.held().insert(url, Answer { asks, at: now });
	}

	fn held(&self) -> MutexGuard<'_, HashMap<String, Answer>> {
		self.held.lock().unwrap_or_else(PoisonError::into_inner)
	}
}

async fn asked_at_once(urls: Vec<String>, bound: Duration) -> Vec<(String, Option<bool>)> {
	if urls.is_empty() {
		return Vec::new();
	}
	let client = match asking_client() {
		Ok(client) => client,
		Err(error) => {
			eprintln!("no server was asked whether it asks for authorization: {error}");
			return urls.into_iter().map(|url| (url, None)).collect();
		}
	};
	let mut asking = JoinSet::new();
	for url in urls {
		let client = client.clone();
		asking.spawn(async move {
			let answer = answer_of(&client, &url, bound).await;
			(url, answer)
		});
	}
	let mut answers = Vec::new();
	while let Some(joined) = asking.join_next().await {
		match joined {
			Ok(answer) => answers.push(answer),
			Err(error) => eprintln!("a server was asked in a task that did not finish: {error}"),
		}
	}
	answers
}

fn asking_client() -> Result<Client, reqwest::Error> {
	installed_tls_provider();
	Client::builder().build()
}

async fn answer_of(client: &Client, url: &str, bound: Duration) -> Option<bool> {
	tokio::time::timeout(bound, asked_in_turn(client, url)).await.unwrap_or(None)
}

async fn asked_in_turn(client: &Client, url: &str) -> Option<bool> {
	for metadata in metadata_urls(url) {
		let Ok(answered) = client.get(metadata).send().await else {
			continue;
		};
		if is_transient(answered.status()) {
			return None;
		}
		if names_an_authorization_server(answered).await {
			return Some(true);
		}
	}
	initialize_answer(client, url).await
}

async fn initialize_answer(client: &Client, url: &str) -> Option<bool> {
	let asked = client.post(url).header(ACCEPT, MCP_ACCEPT).json(&an_initialize()).send().await;
	match asked {
		Ok(answered) if is_transient(answered.status()) => None,
		Ok(answered) => Some(asks_for_authorization(
			answered.status(),
			answered.headers().contains_key(WWW_AUTHENTICATE),
		)),
		Err(error) => {
			eprintln!(
				"a server did not answer whether it asks for authorization: {}",
				error.without_url()
			);
			None
		}
	}
}

fn metadata_urls(url: &str) -> Vec<Url> {
	let Ok(mut resource) = Url::parse(url) else {
		return Vec::new();
	};
	resource.set_query(None);
	resource.set_fragment(None);
	let path = resource.path().trim_end_matches('/').to_owned();
	let mut urls = Vec::new();
	for suffix in [path.as_str(), ""] {
		let mut metadata = resource.clone();
		metadata.set_path(&format!("{PROTECTED_RESOURCE_METADATA}{suffix}"));
		if !urls.contains(&metadata) {
			urls.push(metadata);
		}
	}
	urls
}

async fn names_an_authorization_server(answered: Response) -> bool {
	if answered.status() != StatusCode::OK {
		return false;
	}
	answered.json::<serde_json::Value>().await.is_ok_and(|metadata| {
		metadata
			.get(AUTHORIZATION_SERVERS)
			.and_then(serde_json::Value::as_array)
			.is_some_and(|servers| !servers.is_empty())
	})
}

fn is_transient(status: StatusCode) -> bool {
	status == StatusCode::REQUEST_TIMEOUT
		|| status == StatusCode::TOO_MANY_REQUESTS
		|| status.as_u16() >= 500
}

fn an_initialize() -> serde_json::Value {
	json!({
		"jsonrpc": "2.0",
		"id": 0,
		"method": "initialize",
		"params": {
			"protocolVersion": MCP_PROTOCOL_VERSION,
			"capabilities": {},
			"clientInfo": { "name": "kiroshi", "version": env!("CARGO_PKG_VERSION") }
		}
	})
}

fn asks_for_authorization(status: StatusCode, challenges: bool) -> bool {
	status == StatusCode::UNAUTHORIZED || (status == StatusCode::FORBIDDEN && challenges)
}

#[cfg(test)]
impl AuthorizationAnswers {
	pub fn holds_anything_for(&self, url: &str) -> bool {
		self.held().contains_key(url)
	}

	pub fn answered(&self, url: &str, asks: bool, at: i64) {
		self.hold(url.to_owned(), Some(asks), at);
	}
}

#[cfg(test)]
mod tests {
	use std::net::{Ipv4Addr, SocketAddr};
	use std::sync::Arc;

	use axum::http::{HeaderMap, Method, StatusCode as Answered, Uri};
	use axum::Router;
	use tokio::sync::watch as signal;
	use tokio::sync::Mutex;

	use super::*;

	const NOW: i64 = 1_800_000_000_000;

	const PATIENCE: Duration = Duration::from_secs(10);

	const HELD_UNDER_THE_BOUND: Duration = Duration::from_secs(6);

	const ARRIVAL_PATIENCE: Duration = Duration::from_secs(60);

	const SERVERS_ASKED_TOGETHER: usize = 4;

	const NAMING_A_SERVER: &str = r#"{"authorization_servers":["https://auth.granola.test"]}"#;

	const NAMING_NONE: &str = r#"{"authorization_servers":[]}"#;

	type Asked = Arc<Mutex<Vec<(Method, String)>>>;

	#[derive(Clone)]
	struct Served {
		asked: Asked,
		root_names_a_server: bool,
		arrivals: Arc<signal::Sender<usize>>,
		released: Arc<signal::Sender<usize>>,
	}

	struct Stub {
		base: String,
		asked: Asked,
		arrivals: Arc<signal::Sender<usize>>,
		released: Arc<signal::Sender<usize>>,
		_stop: signal::Sender<bool>,
	}

	impl Stub {
		async fn serving() -> Self {
			Self::answering_at_the_root(false).await
		}

		async fn answering_at_the_root(root_names_a_server: bool) -> Self {
			let asked = Asked::default();
			let listener = tokio::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
				.await
				.expect("the stub binds");
			let address: SocketAddr = listener.local_addr().expect("the stub is named");
			let (stop, halted) = signal::channel(false);
			let arrivals = Arc::new(signal::channel(0).0);
			let released = Arc::new(signal::channel(usize::MAX).0);
			let served = Served {
				asked: asked.clone(),
				root_names_a_server,
				arrivals: arrivals.clone(),
				released: released.clone(),
			};
			let router = Router::new().fallback(answer_named).with_state(served);
			let mut halting = halted;
			tokio::spawn(async move {
				let _ = axum::serve(listener, router)
					.with_graceful_shutdown(async move {
						let _ = halting.changed().await;
					})
					.await;
			});
			Stub { base: format!("http://{address}"), asked, arrivals, released, _stop: stop }
		}

		fn at(&self, answer: &str) -> String {
			format!("{}/{answer}/mcp", self.base)
		}

		async fn asked(&self) -> Vec<(Method, String)> {
			self.asked.lock().await.clone()
		}

		async fn initializes(&self) -> usize {
			self.asked().await.iter().filter(|(method, _)| method == Method::POST).count()
		}

		async fn reached(&self, name: &str, count: usize) {
			let mut arrivals = self.arrivals.subscribe();
			while named_in(&self.asked().await, name) < count {
				tokio::time::timeout(ARRIVAL_PATIENCE, arrivals.changed())
					.await
					.expect("the stub was reached in time")
					.expect("the stub records");
			}
		}

		async fn initialized_past_the_bound(
			&self,
			answers: &AuthorizationAnswers,
			urls: HashSet<String>,
			now: i64,
		) -> HashSet<String> {
			let stalled = async {
				self.reached("stalled", 2).await;
				tokio::time::pause();
			};
			let (asking, ()) = tokio::join!(answers.asked_within(urls, now, PATIENCE), stalled);
			tokio::time::resume();
			asking
		}
	}

	fn named_in(asked: &[(Method, String)], name: &str) -> usize {
		asked.iter().filter(|(_, path)| path.contains(&format!("/{name}/"))).count()
	}

	fn initialized_together(asked: &[(Method, String)]) -> usize {
		asked
			.iter()
			.filter(|(method, path)| method == Method::POST && path.contains("/slow-401/"))
			.count()
	}

	async fn answer_named(
		axum::extract::State(served): axum::extract::State<Served>,
		method: Method,
		uri: Uri,
	) -> (Answered, HeaderMap, String) {
		let path = uri.path().to_owned();
		let rank = {
			let mut asked = served.asked.lock().await;
			asked.push((method.clone(), path.clone()));
			named_in(&asked, "slowly")
		};
		served.arrivals.send_modify(|arrivals| *arrivals += 1);
		let name = path.trim_start_matches(PROTECTED_RESOURCE_METADATA);
		let name = name.trim_start_matches('/').split('/').next().unwrap_or_default().to_owned();
		if name.starts_with("slowly") {
			let mut released = served.released.subscribe();
			let held = released.wait_for(|released| *released >= rank).await;
			held.map(drop).expect("the stub releases");
		}
		if method == Method::POST && name == "slow-401" {
			let mut arrivals = served.arrivals.subscribe();
			while initialized_together(&served.asked.lock().await) < SERVERS_ASKED_TOGETHER {
				arrivals.changed().await.expect("the stub records");
			}
		}
		if method == Method::GET {
			return metadata_of(&served, &path, &name);
		}
		initialize_of(&name).await
	}

	fn metadata_of(served: &Served, path: &str, name: &str) -> (Answered, HeaderMap, String) {
		let answered = |status, body: &str| (status, HeaderMap::new(), body.to_owned());
		if path == PROTECTED_RESOURCE_METADATA {
			return match served.root_names_a_server {
				true => answered(Answered::OK, NAMING_A_SERVER),
				false => answered(Answered::NOT_FOUND, ""),
			};
		}
		match name {
			"metadata" => answered(Answered::OK, NAMING_A_SERVER),
			"empty-metadata" => answered(Answered::OK, NAMING_NONE),
			"metadata-unavailable" => answered(Answered::SERVICE_UNAVAILABLE, ""),
			_ => answered(Answered::NOT_FOUND, ""),
		}
	}

	async fn initialize_of(name: &str) -> (Answered, HeaderMap, String) {
		let mut headers = HeaderMap::new();
		let challenged = |headers: &mut HeaderMap| {
			headers.insert(
				WWW_AUTHENTICATE,
				"Bearer resource_metadata=\"x\"".parse().expect("the header parses"),
			);
		};
		let status = match name {
			"challenged-401" | "empty-metadata" | "slowly" => {
				challenged(&mut headers);
				Answered::UNAUTHORIZED
			}
			"bare-401" => Answered::UNAUTHORIZED,
			"challenged-403" => {
				challenged(&mut headers);
				Answered::FORBIDDEN
			}
			"bare-403" => Answered::FORBIDDEN,
			"not-found" => Answered::NOT_FOUND,
			"sse-405" => Answered::METHOD_NOT_ALLOWED,
			"request-timeout" => Answered::REQUEST_TIMEOUT,
			"too-many" => Answered::TOO_MANY_REQUESTS,
			"unavailable" => Answered::SERVICE_UNAVAILABLE,
			"stalled" => std::future::pending().await,
			"slow-401" => Answered::UNAUTHORIZED,
			_ => Answered::OK,
		};
		(status, headers, String::new())
	}

	fn holds_no_answer_for(answers: &AuthorizationAnswers, urls: &HashSet<String>) -> bool {
		let held = answers.held();
		held.len() == urls.len()
			&& urls.iter().all(|url| held.get(url).is_some_and(|answer| answer.asks.is_none()))
	}

	fn urls(stub: &Stub, answers: &[&str]) -> HashSet<String> {
		answers.iter().map(|answer| stub.at(answer)).collect()
	}

	#[test]
	fn the_metadata_is_asked_at_the_path_appended_well_known_then_at_the_root() {
		let asked = |url: &str| -> Vec<String> {
			metadata_urls(url).into_iter().map(String::from).collect()
		};

		assert_eq!(
			asked("https://mcp.granola.test/v1/mcp/?session=held#top"),
			[
				"https://mcp.granola.test/.well-known/oauth-protected-resource/v1/mcp",
				"https://mcp.granola.test/.well-known/oauth-protected-resource",
			]
		);
		assert_eq!(
			asked("https://mcp.granola.test/"),
			["https://mcp.granola.test/.well-known/oauth-protected-resource"]
		);
		assert!(asked("not a url").is_empty());
	}

	#[tokio::test]
	async fn metadata_naming_an_authorization_server_reads_as_asking_and_sends_no_initialize() {
		let stub = Stub::serving().await;

		let asking = AuthorizationAnswers::default()
			.asking_authorization(urls(&stub, &["metadata"]), NOW)
			.await;

		assert_eq!(asking, urls(&stub, &["metadata"]));
		assert_eq!(
			stub.asked().await,
			[(Method::GET, format!("{PROTECTED_RESOURCE_METADATA}/metadata/mcp"))]
		);
	}

	#[tokio::test]
	async fn metadata_at_the_root_naming_an_authorization_server_reads_as_asking() {
		let stub = Stub::answering_at_the_root(true).await;

		let asking =
			AuthorizationAnswers::default().asking_authorization(urls(&stub, &["ok"]), NOW).await;

		assert_eq!(asking, urls(&stub, &["ok"]));
		assert_eq!(stub.initializes().await, 0);
		assert_eq!(stub.asked().await.len(), 2);
	}

	#[tokio::test]
	async fn metadata_naming_no_authorization_server_falls_back_on_the_initialize() {
		let stub = Stub::serving().await;

		let asking = AuthorizationAnswers::default()
			.asking_authorization(urls(&stub, &["empty-metadata"]), NOW)
			.await;

		assert_eq!(asking, urls(&stub, &["empty-metadata"]));
		assert_eq!(stub.initializes().await, 1);
	}

	#[tokio::test]
	async fn with_no_metadata_a_401_or_a_403_carrying_a_challenge_reads_as_asking() {
		let stub = Stub::serving().await;
		let asked = urls(
			&stub,
			&[
				"challenged-401",
				"bare-401",
				"challenged-403",
				"bare-403",
				"ok",
				"not-found",
				"sse-405",
			],
		);

		let answers = AuthorizationAnswers::default();
		let asking = answers.asking_authorization(asked, NOW).await;

		assert_eq!(asking, urls(&stub, &["challenged-401", "bare-401", "challenged-403"]));
		assert_eq!(answers.held().len(), 7);
		assert_eq!(stub.initializes().await, 7);
	}

	#[tokio::test]
	async fn a_transient_status_holds_no_answer_under_its_own_shorter_window() {
		let stub = Stub::serving().await;
		let answers = AuthorizationAnswers::default();
		let transient =
			urls(&stub, &["request-timeout", "too-many", "unavailable", "metadata-unavailable"]);

		assert!(answers.asking_authorization(transient.clone(), NOW).await.is_empty());
		assert!(holds_no_answer_for(&answers, &transient));
		assert_eq!(stub.initializes().await, 3);

		let held =
			answers.asking_authorization(transient.clone(), NOW + NO_ANSWER_HELD_MS - 1).await;

		assert!(held.is_empty());
		assert_eq!(stub.initializes().await, 3);
		const { assert!(NO_ANSWER_HELD_MS < ANSWER_HELD_MS) };

		answers.asking_authorization(transient, NOW + NO_ANSWER_HELD_MS).await;

		assert_eq!(stub.initializes().await, 6);
		let metadata_unavailable =
			format!("{PROTECTED_RESOURCE_METADATA}/metadata-unavailable/mcp");
		let asked_twice =
			stub.asked().await.iter().filter(|(_, path)| *path == metadata_unavailable).count();
		assert_eq!(asked_twice, 2);
	}

	#[tokio::test]
	async fn a_server_answering_nothing_within_its_bound_holds_no_answer() {
		let stub = Stub::serving().await;
		let answers = AuthorizationAnswers::default();
		let stalled = urls(&stub, &["stalled"]);

		let asking = stub.initialized_past_the_bound(&answers, stalled.clone(), NOW).await;

		assert!(asking.is_empty());
		assert!(holds_no_answer_for(&answers, &stalled));
	}

	#[tokio::test]
	async fn two_reads_of_a_server_that_never_answers_send_one_round_of_requests() {
		let stub = Stub::serving().await;
		let answers = AuthorizationAnswers::default();
		let stalled = urls(&stub, &["stalled"]);

		stub.initialized_past_the_bound(&answers, stalled.clone(), NOW).await;
		let one_round = stub.asked().await.len();
		let second = answers.asked_within(stalled, NOW + 1, PATIENCE).await;

		assert!(second.is_empty());
		assert_eq!(one_round, 3);
		assert_eq!(stub.asked().await.len(), one_round);
	}

	#[tokio::test]
	async fn the_bound_is_taken_over_every_request_sent_for_one_url() {
		let stub = Stub::serving().await;
		let answers = AuthorizationAnswers::default();
		stub.released.send_replace(0);

		let held_one_by_one = async {
			for rank in 1..=2 {
				stub.reached("slowly", rank).await;
				tokio::time::pause();
				tokio::time::advance(HELD_UNDER_THE_BOUND).await;
				tokio::time::resume();
				stub.released.send_replace(rank);
			}
		};
		let (asking, ()) = tokio::join!(
			answers.asked_within(urls(&stub, &["slowly"]), NOW, PATIENCE),
			held_one_by_one
		);

		assert!(asking.is_empty());
		assert!(holds_no_answer_for(&answers, &urls(&stub, &["slowly"])));

		stub.released.send_replace(usize::MAX);
		let unbounded =
			answers.asked_within(urls(&stub, &["slowly"]), NOW + NO_ANSWER_HELD_MS, PATIENCE).await;

		assert_eq!(unbounded, urls(&stub, &["slowly"]));
	}

	#[tokio::test]
	async fn a_server_nothing_listens_on_holds_no_answer() {
		let answers = AuthorizationAnswers::default();
		let closed = HashSet::from(["http://127.0.0.1:9/mcp".to_owned()]);

		assert!(answers.asking_authorization(closed.clone(), NOW).await.is_empty());
		assert!(holds_no_answer_for(&answers, &closed));
	}

	#[tokio::test]
	async fn a_held_answer_is_read_without_asking_until_it_ages_past_its_hold() {
		let stub = Stub::serving().await;
		let answers = AuthorizationAnswers::default();
		let asked = urls(&stub, &["challenged-401"]);

		answers.asking_authorization(asked.clone(), NOW).await;
		let held = answers.asking_authorization(asked.clone(), NOW + ANSWER_HELD_MS - 1).await;

		assert_eq!(stub.initializes().await, 1);
		assert_eq!(held, asked);

		answers.asking_authorization(asked.clone(), NOW + ANSWER_HELD_MS).await;

		assert_eq!(stub.initializes().await, 2);
	}

	#[tokio::test]
	async fn an_aged_answer_the_server_no_longer_gives_is_replaced_by_no_answer() {
		let stub = Stub::serving().await;
		let stalled = HashSet::from([stub.at("stalled")]);
		let answers = AuthorizationAnswers::default();
		for url in &stalled {
			answers.answered(url, true, NOW - ANSWER_HELD_MS);
		}

		let asking = stub.initialized_past_the_bound(&answers, stalled.clone(), NOW).await;

		assert!(asking.is_empty());
		assert!(holds_no_answer_for(&answers, &stalled));
	}

	#[tokio::test]
	async fn several_servers_are_asked_at_the_same_time() {
		let stub = Stub::serving().await;
		let asked: HashSet<String> = (0..SERVERS_ASKED_TOGETHER)
			.map(|each| format!("{}?each={each}", stub.at("slow-401")))
			.collect();

		let asking =
			AuthorizationAnswers::default().asked_within(asked.clone(), NOW, PATIENCE).await;

		assert_eq!(asking, asked);
	}
}
