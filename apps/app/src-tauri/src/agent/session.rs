use std::collections::HashMap;
use std::future::Future;
use std::path::PathBuf;
use std::pin::Pin;
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde_json::Value;
use tokio::sync::{mpsc, oneshot, Mutex, Notify};

use super::contract::{
	AgentEvent, ConnectionState, PermissionDecision, SubmittedTurn, TransportError, TurnEnded,
	TurnOutcome, TurnState,
};
use super::lease::{Lapse, Liveness, RunLease};
use super::protocol::{self, ClosedFrame, Frame, HostAnswer, HostRequestFrame, OpenRequest};
use super::sidecar::Sidecar;
use super::translate::Translator;
use crate::environment::contract::{ResolvedEnv, Values};

pub const DEFAULT_STARTUP_TIMEOUT: Duration = Duration::from_secs(30);

pub const PARTIAL_MESSAGES: &str = "partialMessages";

pub trait EventSink: Send + Sync + 'static {
	fn emit(&self, event: AgentEvent);

	fn submitted(&self, _turn: SubmittedTurn) {}

	fn withdrawn(&self) {}

	fn drained(&self) -> Drained {
		Box::pin(std::future::ready(()))
	}
}

pub type Drained = Pin<Box<dyn Future<Output = ()> + Send>>;

pub type Answering = Pin<Box<dyn Future<Output = HostAnswer> + Send>>;

pub trait HostRequests: std::fmt::Debug + Send + Sync + 'static {
	fn subtype(&self) -> &'static str;

	fn serve(&self, request: Value) -> Answering;
}

impl EventSink for mpsc::UnboundedSender<AgentEvent> {
	fn emit(&self, event: AgentEvent) {
		let _ = self.send(event);
	}
}

enum Gate {
	Buffering(Vec<AgentEvent>),
	Forwarding,
	Discarding,
}

pub struct GatedSink {
	inner: Arc<dyn EventSink>,
	gate: std::sync::Mutex<Gate>,
}

impl GatedSink {
	pub fn new(inner: Arc<dyn EventSink>) -> Self {
		Self { inner, gate: std::sync::Mutex::new(Gate::Buffering(Vec::new())) }
	}

	pub fn promote(&self) {
		let mut gate = self.gate.lock().expect("gate");
		if let Gate::Buffering(buffered) = std::mem::replace(&mut *gate, Gate::Forwarding) {
			for event in buffered {
				self.inner.emit(event);
			}
		}
	}

	pub fn discard(&self) {
		*self.gate.lock().expect("gate") = Gate::Discarding;
	}
}

impl EventSink for GatedSink {
	fn emit(&self, event: AgentEvent) {
		let mut gate = self.gate.lock().expect("gate");
		match &mut *gate {
			Gate::Buffering(buffered) => buffered.push(event),
			Gate::Forwarding => self.inner.emit(event),
			Gate::Discarding => {}
		}
	}

	fn submitted(&self, turn: SubmittedTurn) {
		self.inner.submitted(turn);
	}

	fn withdrawn(&self) {
		self.inner.withdrawn();
	}

	fn drained(&self) -> Drained {
		self.inner.drained()
	}
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Bundle {
	pub path: String,
	pub system_path: Option<String>,
	pub user_path: Option<String>,
	pub space_path: Option<String>,
	pub agent: String,
	pub identity: String,
	pub output_style: String,
	pub settings_path: Option<String>,
}

#[derive(Debug, Clone)]
pub struct SessionOptions {
	pub cwd: PathBuf,
	pub resume: Option<String>,
	pub bundle: Option<Bundle>,
	pub app_data_dir: Option<PathBuf>,
	pub conversation_id: Option<String>,
	pub startup_timeout: Duration,
	pub extra_env: Vec<(String, String)>,
	pub server_env: ResolvedEnv,
	pub connection: Values,
	pub output_schema: Option<serde_json::Value>,
	pub mission_thread: bool,
	pub hosts: Vec<Arc<dyn HostRequests>>,
	pub lease: RunLease,
}

impl SessionOptions {
	pub fn new(cwd: PathBuf) -> Self {
		Self {
			cwd,
			resume: None,
			bundle: None,
			app_data_dir: None,
			conversation_id: None,
			startup_timeout: DEFAULT_STARTUP_TIMEOUT,
			extra_env: Vec::new(),
			server_env: ResolvedEnv::default(),
			connection: Values::new(),
			output_schema: None,
			mission_thread: false,
			hosts: Vec::new(),
			lease: RunLease::default(),
		}
	}

	pub fn resuming(mut self, session_id: Option<String>) -> Self {
		self.resume = session_id;
		self
	}

	pub fn bundled(mut self, bundle: Option<Bundle>) -> Self {
		self.bundle = bundle;
		self
	}

	pub fn with_app_data(mut self, dir: Option<PathBuf>) -> Self {
		self.app_data_dir = dir;
		self
	}

	pub fn in_conversation(mut self, conversation_id: impl Into<String>) -> Self {
		self.conversation_id = Some(conversation_id.into());
		self
	}

	pub fn with_env(mut self, key: &str, value: impl Into<String>) -> Self {
		self.extra_env.push((key.to_owned(), value.into()));
		self
	}

	pub fn serving(mut self, server_env: ResolvedEnv) -> Self {
		self.server_env = server_env;
		self
	}

	pub fn connected(mut self, connection: Values) -> Self {
		self.connection = connection;
		self
	}

	pub fn hosting(mut self, host: Arc<dyn HostRequests>) -> Self {
		self.hosts.push(host);
		self
	}

	pub fn answering(mut self, output_schema: Option<serde_json::Value>) -> Self {
		self.output_schema = output_schema;
		self
	}

	pub fn on_mission_thread(mut self, mission_thread: bool) -> Self {
		self.mission_thread = mission_thread;
		self
	}

	pub fn leased(mut self, lease: RunLease) -> Self {
		self.lease = lease;
		self
	}

	pub fn open_request(&self, partial_messages: bool) -> OpenRequest {
		OpenRequest {
			cwd: self.cwd.to_string_lossy().into_owned(),
			resume: self.resume.clone(),
			plugin_path: self.bundle.as_ref().map(|bundle| bundle.path.clone()),
			system_plugin_path: self.bundle.as_ref().and_then(|bundle| bundle.system_path.clone()),
			user_plugin_path: self.bundle.as_ref().and_then(|bundle| bundle.user_path.clone()),
			space_plugin_path: self.bundle.as_ref().and_then(|bundle| bundle.space_path.clone()),
			agent: self.bundle.as_ref().map(|bundle| bundle.agent.clone()),
			identity: self.bundle.as_ref().map(|bundle| bundle.identity.clone()),
			output_style: self.bundle.as_ref().map(|bundle| bundle.output_style.clone()),
			settings_path: self.bundle.as_ref().and_then(|bundle| bundle.settings_path.clone()),
			app_data_dir: self.app_data_dir.as_ref().map(|dir| dir.to_string_lossy().into_owned()),
			conversation_id: self.conversation_id.clone(),
			partial_messages,
			env: self.extra_env.iter().cloned().collect(),
			server_env: self.server_env.clone(),
			connection: self.connection.clone(),
			output_schema: self.output_schema.clone(),
			mission_thread: self.mission_thread,
		}
	}
}

struct Shared {
	translator: Translator,
	turn: TurnState,
	shutting_down: bool,
	running: Option<RunningTurn>,
	lease: RunLease,
	owes_result: bool,
}

struct RunningTurn {
	id: Option<String>,
	started_at: Instant,
	liveness: Liveness,
}

impl Shared {
	fn set_turn(&mut self, next: TurnState) -> Option<AgentEvent> {
		if self.turn == next {
			return None;
		}
		self.turn = next;
		Some(AgentEvent::TurnChanged { state: next })
	}

	fn turn_started(&mut self, session: &str, id: Option<String>) {
		log::info!("the turn started session={session} turn={id:?}");
		self.running = Some(RunningTurn {
			id,
			started_at: Instant::now(),
			liveness: Liveness::since(tokio::time::Instant::now()),
		});
	}

	fn liveness(&mut self) -> Option<&mut Liveness> {
		self.running.as_mut().map(|running| &mut running.liveness)
	}

	fn heard(&mut self) {
		if let Some(liveness) = self.liveness() {
			liveness.heard(tokio::time::Instant::now());
		}
	}

	fn lease_deadline(&self) -> Option<tokio::time::Instant> {
		let running = self.running.as_ref()?;
		let waiting_on_person = self.translator.is_waiting_on_person();
		running.liveness.deadline(self.lease, waiting_on_person).map(|(at, _)| at)
	}

	fn lapse_due(&self) -> Option<Lapse> {
		let running = self.running.as_ref()?;
		let waiting_on_person = self.translator.is_waiting_on_person();
		running.liveness.lapse_due(self.lease, waiting_on_person, tokio::time::Instant::now())
	}

	fn end_lapsed(&mut self, session: &str, lapse: Lapse) -> Vec<AgentEvent> {
		log::warn!(
			"the turn lost its lease session={session} turn={:?} reason={lapse}",
			self.running.as_ref().and_then(|running| running.id.as_deref())
		);
		self.turn_ended(session, TurnOutcome::Failed);
		self.owes_result |= lapse == Lapse::InterruptUnanswered;
		let mut events = self.translator.abandon_turn();
		events.extend(self.set_turn(TurnState::Failed));
		events
	}

	fn drops_stale(&mut self, frame: &Frame) -> bool {
		let is_result = matches!(frame, Frame::Result(_));
		if self.owes_result && is_turn_frame(frame) {
			self.owes_result = !is_result;
			return true;
		}
		is_result && self.running.is_none()
	}

	fn turn_ended(&mut self, session: &str, outcome: TurnOutcome) {
		let Some(running) = self.running.take() else {
			return;
		};
		log::info!(
			"the turn ended session={session} turn={:?} outcome={outcome:?} took_ms={}",
			running.id,
			running.started_at.elapsed().as_millis()
		);
	}

	fn ended_by_shutdown(&mut self, session: &str) -> Option<AgentEvent> {
		self.running.as_ref()?;
		log::info!("the session shut down while its turn ran session={session}");
		self.turn_ended(session, TurnOutcome::Cancelled);
		Some(AgentEvent::TurnEnded {
			ended: TurnEnded {
				session_id: self.translator.session_id().map(str::to_owned),
				outcome: TurnOutcome::Cancelled,
				structured_output: None,
				total_cost_usd: None,
				model_usage: None,
			},
		})
	}
}

pub struct Session {
	sidecar: Arc<Sidecar>,
	key: String,
	shared: Arc<Mutex<Shared>>,
	sink: Arc<dyn EventSink>,
	resumed: bool,
	rearmed: Arc<Notify>,
}

impl Session {
	pub async fn start(
		sidecar: Arc<Sidecar>,
		options: SessionOptions,
		sink: Arc<dyn EventSink>,
	) -> Result<Self, TransportError> {
		let opening_at = Instant::now();
		let resumed = options.resume.is_some();
		let key = uuid::Uuid::new_v4().to_string();
		let frames = sidecar.attach(&key);

		let shared = Arc::new(Mutex::new(Shared {
			translator: Translator::new(resumed),
			turn: TurnState::Idle,
			shutting_down: false,
			running: None,
			lease: options.lease,
			owes_result: false,
		}));
		let rearmed = Arc::new(Notify::new());

		let (opened_tx, opened_rx) = oneshot::channel::<Result<(), TransportError>>();
		let desk = HostDesk {
			sidecar: sidecar.clone(),
			key: key.clone(),
			hosts: options.hosts.clone(),
			sink: sink.clone(),
		};
		tokio::spawn(read_loop(
			frames,
			shared.clone(),
			sink.clone(),
			opened_tx,
			desk,
			rearmed.clone(),
		));

		let request = options.open_request(sidecar.supports(PARTIAL_MESSAGES));
		let session = Self { sidecar, key, shared, sink, resumed, rearmed };
		if let Err(error) = session.write(protocol::open_command(&session.key, &request)) {
			session.sidecar.detach(&session.key);
			return Err(error);
		}

		let logged_key = session.key.clone();
		let opened = match tokio::time::timeout(options.startup_timeout, opened_rx).await {
			Ok(Ok(Ok(()))) => Ok(session),
			Ok(Ok(Err(error))) => {
				session.shutdown().await;
				Err(error)
			}
			Ok(Err(_)) => {
				session.shutdown().await;
				Err(TransportError::Crashed {
					code: None,
					detail: Some("the sidecar dropped the session during startup".into()),
				})
			}
			Err(_) => {
				session.shutdown().await;
				Err(TransportError::StartupTimeout {
					timeout_ms: options.startup_timeout.as_millis() as u64,
				})
			}
		};
		let took_ms = opening_at.elapsed().as_millis();
		match &opened {
			Ok(_) => log::info!(
				"the session opened session={logged_key} resumed={resumed} took_ms={took_ms}"
			),
			Err(_) => log::warn!(
				"the session did not open session={logged_key} resumed={resumed} took_ms={took_ms}"
			),
		}
		opened
	}

	pub fn resumed(&self) -> bool {
		self.resumed
	}

	pub async fn session_id(&self) -> Option<String> {
		self.shared.lock().await.translator.session_id().map(str::to_owned)
	}

	pub async fn turn_state(&self) -> TurnState {
		self.shared.lock().await.turn
	}

	fn write(&self, command: Value) -> Result<(), TransportError> {
		self.sidecar.send(command)
	}

	pub async fn submit_prompt(&self, text: &str) -> Result<(), TransportError> {
		self.submit(text, None).await
	}

	pub async fn submit(
		&self,
		text: &str,
		turn: Option<SubmittedTurn>,
	) -> Result<(), TransportError> {
		let entering = {
			let mut shared = self.shared.lock().await;
			if matches!(
				shared.turn,
				TurnState::Submitting | TurnState::Running | TurnState::Stopping
			) {
				return Err(TransportError::TurnAlreadyRunning);
			}
			shared.turn_started(&self.key, turn.as_ref().map(|turn| turn.turn_id.clone()));
			shared.set_turn(TurnState::Submitting)
		};
		self.rearmed.notify_one();
		let handed = turn.is_some();
		if let Some(turn) = turn {
			self.sink.submitted(turn);
		}
		self.emit(entering);
		let written = self.write(protocol::prompt_command(&self.key, text));
		if written.is_err() {
			self.shared.lock().await.turn_ended(&self.key, TurnOutcome::Failed);
		}
		if written.is_err() && handed {
			self.sink.withdrawn();
		}
		written
	}

	pub async fn cancel_turn(&self) -> Result<(), TransportError> {
		let stopping = {
			let mut shared = self.shared.lock().await;
			if !matches!(shared.turn, TurnState::Submitting | TurnState::Running) {
				return Err(TransportError::NoActiveTurn);
			}
			shared.translator.mark_cancelling();
			if let Some(liveness) = shared.liveness() {
				liveness.interrupted(tokio::time::Instant::now());
			}
			shared.set_turn(TurnState::Stopping)
		};
		self.rearmed.notify_one();
		self.emit(stopping);
		self.write(protocol::interrupt_command(&self.key))
	}

	async fn take_pending_input(&self, id: &str) -> Result<Value, TransportError> {
		let mut shared = self.shared.lock().await;
		let input = shared
			.translator
			.take_permission_input(id)
			.ok_or_else(|| TransportError::UnknownPermission { id: id.to_owned() })?;
		shared.heard();
		self.rearmed.notify_one();
		Ok(input)
	}

	pub async fn respond_to_permission(
		&self,
		id: &str,
		decision: PermissionDecision,
	) -> Result<(), TransportError> {
		let input = self.take_pending_input(id).await?;

		let command = match decision {
			PermissionDecision::AllowOnce => protocol::allow_command(&self.key, id, &input),
			PermissionDecision::Deny => {
				protocol::deny_command(&self.key, id, "User denied this action.")
			}
		};
		self.write(command)?;
		self.sink.emit(AgentEvent::PermissionResolved { id: id.to_owned(), decision });
		Ok(())
	}

	pub async fn answer_question(
		&self,
		id: &str,
		answers: HashMap<String, String>,
		annotations: Option<Value>,
	) -> Result<(), TransportError> {
		let input = self.take_pending_input(id).await?;

		let answered = answered_input(input, answers, annotations);
		self.write(protocol::allow_command(&self.key, id, &answered))?;
		self.sink.emit(AgentEvent::PermissionResolved {
			id: id.to_owned(),
			decision: PermissionDecision::AllowOnce,
		});
		Ok(())
	}

	fn emit(&self, event: Option<AgentEvent>) {
		if let Some(event) = event {
			self.sink.emit(event);
		}
	}

	pub async fn shutdown(&self) {
		{
			let mut shared = self.shared.lock().await;
			shared.shutting_down = true;
			if let Some(ended) = shared.ended_by_shutdown(&self.key) {
				self.sink.emit(ended);
			}
		}
		self.sink.drained().await;
		let _ = self.write(protocol::close_command(&self.key));
		self.sidecar.detach(&self.key);
	}
}

fn answered_input(
	input: Value,
	answers: HashMap<String, String>,
	annotations: Option<Value>,
) -> Value {
	let mut fields = match input {
		Value::Object(fields) => fields,
		_ => serde_json::Map::new(),
	};
	fields.insert("answers".to_owned(), serde_json::json!(answers));
	if let Some(annotations) = annotations {
		fields.insert("annotations".to_owned(), annotations);
	}
	Value::Object(fields)
}

impl From<TurnOutcome> for TurnState {
	fn from(outcome: TurnOutcome) -> Self {
		match outcome {
			TurnOutcome::Failed => TurnState::Failed,
			TurnOutcome::Completed | TurnOutcome::Cancelled => TurnState::Idle,
		}
	}
}

fn turn_outcome(events: &[AgentEvent]) -> Option<TurnOutcome> {
	events.iter().find_map(|event| match event {
		AgentEvent::TurnEnded { ended } => Some(ended.outcome),
		_ => None,
	})
}

fn is_turn_activity(frame: &Frame) -> bool {
	matches!(frame, Frame::StreamEvent(_) | Frame::Assistant(_) | Frame::ControlRequest(_))
}

fn is_turn_frame(frame: &Frame) -> bool {
	is_turn_activity(frame) || matches!(frame, Frame::User(_) | Frame::Result(_))
}

fn crashed(closed: &ClosedFrame) -> TransportError {
	TransportError::Crashed { code: None, detail: closed.detail.clone() }
}

struct HostDesk {
	sidecar: Arc<Sidecar>,
	key: String,
	hosts: Vec<Arc<dyn HostRequests>>,
	sink: Arc<dyn EventSink>,
}

impl HostDesk {
	fn answer(&self, asked: HostRequestFrame) {
		let sidecar = self.sidecar.clone();
		let key = self.key.clone();
		let host = declaring(&self.hosts, &asked.request);
		let sink = self.sink.clone();
		tokio::spawn(async move {
			let answer = match host {
				Ok(host) => host.serve(asked.request).await,
				Err(refusal) => Err(refusal),
			};
			let command = protocol::host_response_command(&key, &asked.request_id, &answer);
			if let Err(error) = sidecar.send(command) {
				sink.emit(AgentEvent::Failed { error });
			}
		});
	}
}

fn declaring(
	hosts: &[Arc<dyn HostRequests>],
	request: &Value,
) -> Result<Arc<dyn HostRequests>, Value> {
	let subtype = request.get("subtype").and_then(Value::as_str).unwrap_or_default();
	hosts.iter().find(|host| host.subtype() == subtype).cloned().ok_or_else(|| unserved(subtype))
}

fn unserved(subtype: &str) -> Value {
	serde_json::json!({ "kind": "unservedSubtype", "subtype": subtype })
}

async fn read_loop(
	mut frames: mpsc::UnboundedReceiver<Value>,
	shared: Arc<Mutex<Shared>>,
	sink: Arc<dyn EventSink>,
	opened_tx: oneshot::Sender<Result<(), TransportError>>,
	desk: HostDesk,
	rearmed: Arc<Notify>,
) {
	let mut opened_tx = Some(opened_tx);
	let mut seen: u64 = 0;

	loop {
		let raw = tokio::select! {
			biased;
			received = frames.recv() => match received {
				Some(raw) => raw,
				None => break,
			},
			() = lease_lapsed(&shared, &rearmed) => {
				end_lapsed_turn(&shared, sink.as_ref(), &desk.key).await;
				continue;
			}
		};
		seen += 1;
		shared.lock().await.heard();
		let Ok(frame) = serde_json::from_value::<Frame>(raw) else {
			sink.emit(AgentEvent::Failed {
				error: TransportError::InvalidFrame {
					detail: format!("unreadable frame {seen} of this session"),
				},
			});
			continue;
		};

		match &frame {
			Frame::Opened => {
				if let Some(tx) = opened_tx.take() {
					let _ = tx.send(Ok(()));
				}
				continue;
			}
			Frame::Closed(closed) => {
				if let Some(tx) = opened_tx.take() {
					let _ = tx.send(Err(crashed(closed)));
					return;
				}
				on_exit(shared, sink, &desk.key, Some(crashed(closed))).await;
				return;
			}
			_ => {}
		}

		if let Frame::HostRequest(asked) = frame {
			desk.answer(asked);
			continue;
		}

		if let Frame::Heartbeat = frame {
			continue;
		}

		{
			let mut guard = shared.lock().await;
			if guard.shutting_down {
				return;
			}
			if guard.drops_stale(&frame) {
				continue;
			}
			let entering = match guard.turn {
				TurnState::Submitting if is_turn_activity(&frame) => {
					guard.set_turn(TurnState::Running)
				}
				_ => None,
			};
			let events = guard.translator.ingest(frame);
			let outcome = turn_outcome(&events);
			if let Some(outcome) = outcome {
				guard.turn_ended(&desk.key, outcome);
			}
			let ending = outcome.and_then(|outcome| guard.set_turn(outcome.into()));
			for event in entering.into_iter().chain(events).chain(ending) {
				sink.emit(event);
			}
		}
	}

	if let Some(tx) = opened_tx.take() {
		let _ = tx.send(Err(desk.sidecar.startup_crash()));
		return;
	}
	on_exit(shared, sink, &desk.key, None).await;
}

async fn lease_lapsed(shared: &Mutex<Shared>, rearmed: &Notify) {
	loop {
		let deadline = shared.lock().await.lease_deadline();
		let Some(deadline) = deadline else {
			rearmed.notified().await;
			continue;
		};
		tokio::select! {
			() = tokio::time::sleep_until(deadline) => return,
			() = rearmed.notified() => {}
		}
	}
}

async fn end_lapsed_turn(shared: &Mutex<Shared>, sink: &dyn EventSink, session: &str) {
	let events = {
		let mut guard = shared.lock().await;
		let Some(lapse) = guard.lapse_due() else {
			return;
		};
		guard.end_lapsed(session, lapse)
	};
	for event in events {
		sink.emit(event);
	}
}

async fn on_exit(
	shared: Arc<Mutex<Shared>>,
	sink: Arc<dyn EventSink>,
	session: &str,
	reason: Option<TransportError>,
) {
	let failing = {
		let mut guard = shared.lock().await;
		if guard.shutting_down {
			return;
		}
		guard.turn_ended(session, TurnOutcome::Failed);
		guard.set_turn(TurnState::Failed)
	};

	sink.emit(AgentEvent::ConnectionChanged { state: ConnectionState::Crashed });
	sink.emit(AgentEvent::Failed {
		error: reason.unwrap_or(TransportError::Crashed {
			code: None,
			detail: Some("the agent exited unexpectedly".into()),
		}),
	});
	if let Some(event) = failing {
		sink.emit(event);
	}
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::removed_on_drop::RemovedOnDrop;

	#[derive(Debug)]
	struct StubHost {
		subtype: &'static str,
	}

	impl HostRequests for StubHost {
		fn subtype(&self) -> &'static str {
			self.subtype
		}

		fn serve(&self, request: Value) -> Answering {
			Box::pin(async move { Ok(request) })
		}
	}

	fn options() -> SessionOptions {
		SessionOptions::new(PathBuf::from("/tmp"))
	}

	fn mounted() -> Vec<Arc<dyn HostRequests>> {
		options()
			.hosting(Arc::new(StubHost { subtype: "routine" }))
			.hosting(Arc::new(StubHost { subtype: "mission" }))
			.hosts
	}

	#[test]
	fn a_request_is_carried_to_the_host_that_declares_the_subtype_it_names() {
		let hosts = mounted();

		for subtype in ["routine", "mission"] {
			let chosen = declaring(&hosts, &serde_json::json!({ "subtype": subtype }))
				.expect("a host declares it");

			assert_eq!(chosen.subtype(), subtype);
		}
	}

	#[test]
	fn a_subtype_no_mounted_host_declares_is_refused_by_name() {
		let refused = declaring(&mounted(), &serde_json::json!({ "subtype": "ledger" }))
			.expect_err("no host declares it");

		assert_eq!(refused, serde_json::json!({ "kind": "unservedSubtype", "subtype": "ledger" }));
	}

	#[test]
	fn a_bot_opens_on_the_bundle_it_runs_as() {
		let bundle = Bundle {
			path: "/bots/b1".to_owned(),
			system_path: Some("/system/kiroshi".to_owned()),
			user_path: Some("/user/me".to_owned()),
			space_path: Some("/spaces/s1".to_owned()),
			agent: "bean".to_owned(),
			identity: "You are Bean, the baker.".to_owned(),
			output_style: "Concise".to_owned(),
			settings_path: None,
		};
		let request = options().bundled(Some(bundle)).open_request(true);

		assert_eq!(request.plugin_path.as_deref(), Some("/bots/b1"));
		assert_eq!(request.space_plugin_path.as_deref(), Some("/spaces/s1"));
		assert_eq!(request.agent.as_deref(), Some("bean"));
		assert_eq!(request.identity.as_deref(), Some("You are Bean, the baker."));
	}

	#[test]
	fn a_run_carries_the_directory_the_host_keeps_its_own_data_in() {
		let request =
			options().with_app_data(Some(PathBuf::from("/app-data/kiroshi"))).open_request(true);

		assert_eq!(request.app_data_dir.as_deref(), Some("/app-data/kiroshi"));
		assert_eq!(options().open_request(true).app_data_dir, None);
	}

	#[test]
	fn a_run_carries_the_conversation_it_answers_in() {
		let request = options().in_conversation("c1").open_request(true);

		assert_eq!(request.conversation_id.as_deref(), Some("c1"));
		assert_eq!(options().open_request(true).conversation_id, None);
	}

	#[test]
	fn only_a_mission_thread_run_names_its_thread() {
		let serialized = |options: SessionOptions| {
			serde_json::to_value(options.open_request(true)).expect("the request serializes")
		};

		assert_eq!(serialized(options().on_mission_thread(true))["missionThread"], true);
		assert_eq!(serialized(options().on_mission_thread(false)).get("missionThread"), None);
		assert_eq!(serialized(options()).get("missionThread"), None);
	}

	#[test]
	fn a_resumed_run_carries_the_bundle_again() {
		let bundle = Bundle {
			path: "/bots/b1".to_owned(),
			system_path: Some("/system/kiroshi".to_owned()),
			user_path: Some("/user/me".to_owned()),
			space_path: Some("/spaces/s1".to_owned()),
			agent: "bean".to_owned(),
			identity: "You are Bean, the baker.".to_owned(),
			output_style: "Concise".to_owned(),
			settings_path: None,
		};
		let request =
			options().bundled(Some(bundle)).resuming(Some("s1".to_owned())).open_request(true);

		assert_eq!(request.resume.as_deref(), Some("s1"));
		assert_eq!(request.plugin_path.as_deref(), Some("/bots/b1"));
		assert_eq!(request.agent.as_deref(), Some("bean"));
	}

	#[test]
	fn a_bot_opens_on_the_style_its_bundle_carries() {
		let bundle = Bundle {
			path: "/bots/b1".to_owned(),
			system_path: Some("/system/kiroshi".to_owned()),
			user_path: Some("/user/me".to_owned()),
			space_path: Some("/spaces/s1".to_owned()),
			agent: "bean".to_owned(),
			identity: "You are Bean, the baker.".to_owned(),
			output_style: "default".to_owned(),
			settings_path: None,
		};
		let request = options().bundled(Some(bundle)).open_request(true);

		assert_eq!(request.output_style.as_deref(), Some("default"));
	}

	#[test]
	fn a_bot_opens_on_the_settings_file_its_bundle_carries() {
		let bundle = Bundle {
			path: "/bots/b1".to_owned(),
			system_path: None,
			user_path: None,
			space_path: None,
			agent: "bean".to_owned(),
			identity: "You are Bean, the baker.".to_owned(),
			output_style: "default".to_owned(),
			settings_path: Some("/bots/b1/settings.json".to_owned()),
		};
		let request = options().bundled(Some(bundle)).open_request(true);

		assert_eq!(request.settings_path.as_deref(), Some("/bots/b1/settings.json"));
	}

	#[test]
	fn a_bot_carrying_no_bundle_names_none() {
		let plain = options().bundled(None).open_request(true);

		assert_eq!(plain.plugin_path, None);
		assert_eq!(plain.space_plugin_path, None);
		assert_eq!(plain.agent, None);
		assert_eq!(plain.identity, None);
		assert_eq!(plain.output_style, None);
		assert_eq!(plain.settings_path, None);
	}

	#[test]
	fn a_run_carries_the_environment_read_when_it_opened() {
		let resolved = ResolvedEnv {
			base: [("TOKEN".to_owned(), "held".to_owned())].into(),
			per_server: [("clock".to_owned(), [("TOKEN".to_owned(), "narrow".to_owned())].into())]
				.into(),
			..ResolvedEnv::default()
		};
		let request = options().serving(resolved.clone()).open_request(true);

		assert_eq!(request.server_env, resolved);
		assert_eq!(
			serde_json::to_value(&request).expect("the request serializes")["serverEnv"],
			serde_json::json!({
				"base": { "TOKEN": "held" },
				"perServer": { "clock": { "TOKEN": "narrow" } }
			})
		);
	}

	#[test]
	fn a_run_serves_neither_connection_name_and_carries_the_held_source_alone() {
		use crate::environment::connection;
		use crate::environment::contract::{
			ConnectionKind, EnvOwner, EnvScope, API_KEY, CONNECTION_NAMES, SUBSCRIPTION_TOKEN,
		};
		use crate::environment::store;

		let root = RemovedOnDrop(std::env::temp_dir().join("kiroshi-session-connection"));
		let _ = std::fs::remove_dir_all(&root);
		let owner = EnvOwner::Bot { id: "b1".to_owned(), space_id: "s1".to_owned() };
		let space = EnvScope::Space { id: "s1".to_owned() };
		let server = EnvScope::Server { name: "clock".to_owned(), owner: owner.clone() };
		store::set(&root, &space, API_KEY, "from-the-space").expect("the space keeps it");
		store::set(&root, &EnvScope::from(&owner), SUBSCRIPTION_TOKEN, "from-the-bot")
			.expect("the bot keeps it");
		store::set(&root, &server, API_KEY, "from-the-server").expect("the server keeps it");
		store::set(&root, &server, "TOKEN", "clock").expect("the server keeps it");
		connection::hold(&root, ConnectionKind::ApiKey, "sk-held").expect("the key is held");

		let request = options()
			.serving(store::resolve(&root, &owner).expect("the store reads"))
			.connected(connection::held(&root).expect("the store reads"))
			.open_request(true);

		for name in CONNECTION_NAMES {
			assert_eq!(request.server_env.base.get(name), None, "{name} reached the base");
			assert!(
				request.server_env.per_server.values().all(|own| !own.contains_key(name)),
				"{name} reached an overlay"
			);
		}
		assert_eq!(request.server_env.per_server["clock"]["TOKEN"], "clock");
		assert_eq!(
			serde_json::to_value(&request).expect("the request serializes")["connection"],
			serde_json::json!({ "ANTHROPIC_API_KEY": "sk-held" })
		);
	}

	#[test]
	fn a_run_opened_with_no_source_held_leaves_the_connection_field_out() {
		let request = options().open_request(true);

		assert!(request.connection.is_empty());
		assert_eq!(
			serde_json::to_value(&request).expect("the request serializes").get("connection"),
			None
		);
	}

	#[test]
	fn a_run_opened_with_no_environment_leaves_the_field_out() {
		let request = options().open_request(true);

		assert!(request.server_env.is_untouched());
		assert_eq!(
			serde_json::to_value(&request).expect("the request serializes").get("serverEnv"),
			None
		);
	}

	#[test]
	fn a_run_whose_environment_could_not_be_read_carries_the_failure() {
		let request = options().serving(ResolvedEnv::failed("unreadable")).open_request(true);

		assert_eq!(
			serde_json::to_value(&request).expect("the request serializes")["serverEnv"],
			serde_json::json!({ "base": {}, "perServer": {}, "failure": "unreadable" })
		);
	}

	#[test]
	fn a_run_asked_for_a_structured_answer_carries_the_schema_it_was_given_and_nothing_else() {
		let schema = serde_json::json!({
			"type": "object",
			"properties": { "outcome": { "enum": ["ok", "nothing"] } },
			"required": ["outcome"]
		});
		let request = options().answering(Some(schema.clone())).open_request(true);

		assert_eq!(request.output_schema.as_ref(), Some(&schema));
		assert_eq!(
			serde_json::to_value(&request).expect("the request serializes")["outputSchema"],
			schema
		);
	}

	#[test]
	fn a_run_asked_for_no_structured_answer_leaves_the_field_out() {
		let request = options().open_request(true);

		assert_eq!(request.output_schema, None);
		assert_eq!(
			serde_json::to_value(&request).expect("the request serializes").get("outputSchema"),
			None
		);
	}

	#[test]
	fn a_sidecar_that_names_no_deltas_is_asked_for_whole_messages() {
		assert!(!options().open_request(false).partial_messages);
		assert!(options().open_request(true).partial_messages);
	}
}
