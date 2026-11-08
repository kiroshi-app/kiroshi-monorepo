use std::collections::{HashMap, VecDeque};
use std::future::Future;
use std::path::PathBuf;
use std::pin::Pin;
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde_json::Value;
use tokio::sync::{mpsc, oneshot, Mutex, Notify};

use super::contract::{
	AgentEvent, ConnectionState, PermissionDecision, SubmittedTurn, TransportError, TurnEnded,
	TurnHold, TurnHoldReason, TurnOutcome, TurnState,
};
use super::lease::{Lapse, Liveness, RunLease};
use super::protocol::{
	self, ClosedFrame, Frame, HostAnswer, HostRequestFrame, OpenRequest, SpaceMember, StreamEvent,
	StreamEventFrame,
};
use super::sidecar::Sidecar;
use super::translate::Translator;
use crate::environment::contract::{ResolvedEnv, Values};

pub const DEFAULT_STARTUP_TIMEOUT: Duration = Duration::from_secs(30);

pub const PARTIAL_MESSAGES: &str = "partialMessages";

pub enum FollowUp {
	Started,
	FoldedIn,
	Settled(Vec<AgentEvent>),
}

pub trait EventSink: Send + Sync + 'static {
	fn emit(&self, event: AgentEvent);

	fn submitted(&self, _turn: SubmittedTurn) {}

	fn follow_up(&self, step: FollowUp) {
		if let FollowUp::Settled(events) = step {
			for event in events {
				self.emit(event);
			}
		}
	}

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

	fn follow_up(&self, step: FollowUp) {
		self.inner.follow_up(step);
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
	pub members: Vec<SpaceMember>,
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
			members: Vec::new(),
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

	pub fn hosting_all(mut self, hosts: Vec<Arc<dyn HostRequests>>) -> Self {
		self.hosts.extend(hosts);
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

	pub fn read_by(mut self, members: Vec<SpaceMember>) -> Self {
		self.members = members;
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
			members: self.members.clone(),
		}
	}
}

struct Shared {
	key: String,
	reopening: OpenRequest,
	translator: Translator,
	turn: TurnState,
	shutting_down: bool,
	running: Option<RunningTurn>,
	queued: VecDeque<QueuedPrompt>,
	lease: RunLease,
	streams_a_follow_up: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Handed {
	Delivered,
	Queued,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LinePlace {
	Running,
	Queued,
	Absent,
}

struct QueuedPrompt {
	text: String,
	turn: SubmittedTurn,
}

struct RunningTurn {
	id: Option<String>,
	prompt_uuid: String,
	started_at: Instant,
	liveness: Liveness,
	pending_tasks: u32,
}

impl RunningTurn {
	fn held_on(&mut self, count: u32) -> Option<AgentEvent> {
		if self.pending_tasks == count {
			return None;
		}
		self.pending_tasks = count;
		let hold =
			(count > 0).then_some(TurnHold { reason: TurnHoldReason::BackgroundTasks, count });
		Some(AgentEvent::TurnHeld { hold })
	}

	fn released(&self) -> Option<AgentEvent> {
		(self.pending_tasks > 0).then_some(AgentEvent::TurnHeld { hold: None })
	}
}

impl Shared {
	fn is_mid_turn(&self) -> bool {
		matches!(self.turn, TurnState::Submitting | TurnState::Running | TurnState::Stopping)
	}

	fn set_turn(&mut self, next: TurnState) -> Option<AgentEvent> {
		if self.turn == next {
			return None;
		}
		self.turn = next;
		Some(AgentEvent::TurnChanged { state: next })
	}

	fn turn_started(&mut self, session: &str, id: Option<String>, prompt_uuid: String) {
		log::info!("the turn started session={session} turn={id:?}");
		self.running = Some(RunningTurn {
			id,
			prompt_uuid,
			started_at: Instant::now(),
			liveness: Liveness::since(tokio::time::Instant::now()),
			pending_tasks: 0,
		});
	}

	fn answers_the_running_prompt(&self, frame: &Frame) -> bool {
		let running = self.running.as_ref().map(|running| running.prompt_uuid.as_str());
		frame.answered_prompt().is_some_and(|answered| Some(answered) == running)
	}

	fn follow_up_of(&mut self, frame: &Frame) -> Option<FollowUp> {
		if !is_turn_activity(frame) {
			return None;
		}
		if self.answers_the_running_prompt(frame) {
			return std::mem::take(&mut self.streams_a_follow_up).then_some(FollowUp::FoldedIn);
		}
		if self.streams_a_follow_up || !self.opens_a_follow_up(frame) {
			return None;
		}
		self.streams_a_follow_up = true;
		Some(FollowUp::Started)
	}

	fn opens_a_follow_up(&self, frame: &Frame) -> bool {
		match self.turn {
			TurnState::Submitting => starts_a_reply(frame),
			_ => !self.is_mid_turn(),
		}
	}

	fn settles_the_follow_up_alone(&self, frame: &Frame) -> bool {
		matches!(frame, Frame::TurnSettled(_))
			&& self.streams_a_follow_up
			&& self.turn != TurnState::Stopping
			&& !self.answers_the_running_prompt(frame)
	}

	fn liveness(&mut self) -> Option<&mut Liveness> {
		self.running.as_mut().map(|running| &mut running.liveness)
	}

	fn heard(&mut self) {
		if let Some(liveness) = self.liveness() {
			liveness.heard(tokio::time::Instant::now());
		}
	}

	fn result_held(&mut self) {
		if let Some(liveness) = self.liveness() {
			liveness.result_held(tokio::time::Instant::now());
		}
	}

	fn tasks_pending(&mut self, count: u32) -> Vec<AgentEvent> {
		let Some(running) = self.running.as_mut() else {
			return Vec::new();
		};
		log::info!(
			"the turn holds for its background tasks session={} turn={:?} reason={count} background tasks",
			self.key,
			running.id
		);
		let held = running.held_on(count);
		let entering = match self.turn {
			TurnState::Submitting => self.set_turn(TurnState::Running),
			_ => None,
		};
		entering.into_iter().chain([AgentEvent::TasksPending { count }]).chain(held).collect()
	}

	fn lease_deadline(&self) -> Option<(tokio::time::Instant, Lapse)> {
		let running = self.running.as_ref()?;
		running.liveness.deadline(self.lease, self.translator.is_waiting_on_person())
	}

	fn end_lapsed(&mut self, lapse: Lapse) -> Vec<AgentEvent> {
		let session = self.key.clone();
		log::warn!(
			"the turn lost its lease session={session} turn={:?} reason={lapse}",
			self.running.as_ref().and_then(|running| running.id.as_deref())
		);
		let mut events: Vec<AgentEvent> =
			self.turn_ended(&session, TurnOutcome::Failed).into_iter().collect();
		events.extend(self.translator.abandon_turn());
		events.extend(self.set_turn(TurnState::Failed));
		let bound_ms = self.lease.bound_of(lapse).as_millis() as u64;
		events.push(AgentEvent::Failed { error: TransportError::RunLapsed { lapse, bound_ms } });
		events
	}

	fn reopen(
		&mut self,
		sidecar: &Sidecar,
	) -> (mpsc::UnboundedReceiver<Value>, Result<(), TransportError>) {
		let lapsed = std::mem::replace(&mut self.key, uuid::Uuid::new_v4().to_string());
		sidecar.detach(&lapsed);
		let frames = sidecar.attach(&self.key);
		let mut request = self.reopening.clone();
		request.resume = self.translator.session_id().map(str::to_owned).or(request.resume);
		let written = sidecar
			.send(protocol::close_command(&lapsed))
			.and_then(|()| sidecar.send(protocol::open_command(&self.key, &request)));
		log::info!("the session reopened after a lapse lapsed={lapsed} session={}", self.key);
		(frames, written)
	}

	#[must_use]
	fn turn_ended(&mut self, session: &str, outcome: TurnOutcome) -> Option<AgentEvent> {
		self.streams_a_follow_up = false;
		let running = self.running.take()?;
		log::info!(
			"the turn ended session={session} turn={:?} outcome={outcome:?} took_ms={}",
			running.id,
			running.started_at.elapsed().as_millis()
		);
		running.released()
	}

	fn ended_by_shutdown(&mut self, session: &str) -> Vec<AgentEvent> {
		if self.running.is_none() {
			return Vec::new();
		}
		log::info!("the session shut down while its turn ran session={session}");
		let released = self.turn_ended(session, TurnOutcome::Cancelled);
		released.into_iter().chain([self.ended_as(TurnOutcome::Cancelled)]).collect()
	}

	fn ended_as(&self, outcome: TurnOutcome) -> AgentEvent {
		AgentEvent::TurnEnded {
			ended: TurnEnded {
				session_id: self.translator.session_id().map(str::to_owned),
				outcome,
				structured_output: None,
				total_cost_usd: None,
				model_usage: None,
				web_sources: Vec::new(),
			},
		}
	}

	fn abandon_queued(&mut self, outcome: TurnOutcome) -> Abandoned {
		let turns: Vec<SubmittedTurn> = self.queued.drain(..).map(|queued| queued.turn).collect();
		for turn in &turns {
			log::info!("a queued prompt was dropped session={} turn={}", self.key, turn.turn_id);
		}
		Abandoned { turns, ended: self.ended_as(outcome) }
	}
}

struct Abandoned {
	turns: Vec<SubmittedTurn>,
	ended: AgentEvent,
}

impl Abandoned {
	fn tell(self, sink: &dyn EventSink) {
		for turn in self.turns {
			sink.submitted(turn);
			sink.emit(self.ended.clone());
		}
	}
}

struct Line<'a> {
	sidecar: &'a Sidecar,
	sink: &'a dyn EventSink,
	rearmed: &'a Notify,
}

impl Line<'_> {
	fn deliver(
		&self,
		shared: &mut Shared,
		text: &str,
		turn: Option<SubmittedTurn>,
	) -> Result<(), TransportError> {
		let key = shared.key.clone();
		let prompt_uuid = uuid::Uuid::new_v4().to_string();
		shared.turn_started(
			&key,
			turn.as_ref().map(|turn| turn.turn_id.clone()),
			prompt_uuid.clone(),
		);
		let entering = shared.set_turn(TurnState::Submitting);
		self.rearmed.notify_one();
		let handed = turn.is_some();
		if let Some(turn) = turn {
			self.sink.submitted(turn);
		}
		if let Some(entering) = entering {
			self.sink.emit(entering);
		}
		let written = self.sidecar.send(protocol::prompt_command(&key, text, &prompt_uuid));
		if written.is_err() {
			if let Some(released) = shared.turn_ended(&key, TurnOutcome::Failed) {
				self.sink.emit(released);
			}
		}
		if written.is_err() && handed {
			self.sink.withdrawn();
		}
		written
	}

	fn deliver_next(&self, shared: &mut Shared) {
		if shared.is_mid_turn() {
			return;
		}
		let Some(next) = shared.queued.pop_front() else {
			return;
		};
		if let Err(error) = self.deliver(shared, &next.text, Some(next.turn)) {
			self.sink.emit(AgentEvent::Failed { error });
		}
	}
}

pub struct Session {
	sidecar: Arc<Sidecar>,
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
		let request = options.open_request(sidecar.supports(PARTIAL_MESSAGES));

		let shared = Arc::new(Mutex::new(Shared {
			key: key.clone(),
			reopening: request.clone(),
			translator: Translator::new(resumed),
			turn: TurnState::Idle,
			shutting_down: false,
			running: None,
			queued: VecDeque::new(),
			lease: options.lease,
			streams_a_follow_up: false,
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

		let session = Self { sidecar, shared, sink, resumed, rearmed };
		if let Err(error) = session.write(protocol::open_command(&key, &request)) {
			session.sidecar.detach(&key);
			return Err(error);
		}

		let logged_key = key;
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
		let mut shared = self.shared.lock().await;
		if shared.is_mid_turn() {
			return Err(TransportError::TurnAlreadyRunning);
		}
		self.line().deliver(&mut shared, text, turn)
	}

	pub async fn submit_in_line(
		&self,
		text: &str,
		turn: SubmittedTurn,
	) -> Result<Handed, TransportError> {
		let mut shared = self.shared.lock().await;
		if shared.is_mid_turn() {
			log::info!(
				"a prompt waits for the running turn session={} turn={}",
				shared.key,
				turn.turn_id
			);
			shared.queued.push_back(QueuedPrompt { text: text.to_owned(), turn });
			return Ok(Handed::Queued);
		}
		self.line().deliver(&mut shared, text, Some(turn))?;
		Ok(Handed::Delivered)
	}

	pub async fn withdraw(&self, turn_id: &str) -> bool {
		let mut shared = self.shared.lock().await;
		let held = shared.queued.len();
		shared.queued.retain(|queued| queued.turn.turn_id != turn_id);
		shared.queued.len() < held
	}

	pub async fn place_of(&self, turn_id: &str) -> LinePlace {
		let shared = self.shared.lock().await;
		let running_id = shared.running.as_ref().and_then(|running| running.id.as_deref());
		if running_id == Some(turn_id) {
			return LinePlace::Running;
		}
		if shared.queued.iter().any(|queued| queued.turn.turn_id == turn_id) {
			return LinePlace::Queued;
		}
		LinePlace::Absent
	}

	pub async fn is_idle(&self) -> bool {
		let shared = self.shared.lock().await;
		!shared.is_mid_turn() && shared.queued.is_empty()
	}

	fn line(&self) -> Line<'_> {
		Line { sidecar: &self.sidecar, sink: self.sink.as_ref(), rearmed: &self.rearmed }
	}

	pub async fn cancel_turn(&self) -> Result<(), TransportError> {
		let (key, stopping) = {
			let mut shared = self.shared.lock().await;
			if !matches!(shared.turn, TurnState::Submitting | TurnState::Running) {
				return Err(TransportError::NoActiveTurn);
			}
			shared.translator.mark_cancelling();
			if let Some(liveness) = shared.liveness() {
				liveness.interrupted(tokio::time::Instant::now());
			}
			(shared.key.clone(), shared.set_turn(TurnState::Stopping))
		};
		self.rearmed.notify_one();
		self.emit(stopping);
		self.write(protocol::interrupt_command(&key))
	}

	async fn take_pending_input(&self, id: &str) -> Result<(String, Value), TransportError> {
		let mut shared = self.shared.lock().await;
		let input = shared
			.translator
			.take_permission_input(id)
			.ok_or_else(|| TransportError::UnknownPermission { id: id.to_owned() })?;
		shared.heard();
		self.rearmed.notify_one();
		Ok((shared.key.clone(), input))
	}

	pub async fn respond_to_permission(
		&self,
		id: &str,
		decision: PermissionDecision,
	) -> Result<(), TransportError> {
		let (key, input) = self.take_pending_input(id).await?;

		let command = match decision {
			PermissionDecision::AllowOnce => protocol::allow_command(&key, id, &input),
			PermissionDecision::Deny => {
				protocol::deny_command(&key, id, "User denied this action.")
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
		let (key, input) = self.take_pending_input(id).await?;

		let answered = answered_input(input, answers, annotations);
		self.write(protocol::allow_command(&key, id, &answered))?;
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
		let key = {
			let mut shared = self.shared.lock().await;
			shared.shutting_down = true;
			let key = shared.key.clone();
			for ended in shared.ended_by_shutdown(&key) {
				self.sink.emit(ended);
			}
			shared.abandon_queued(TurnOutcome::Cancelled).tell(self.sink.as_ref());
			key
		};
		self.sink.drained().await;
		let _ = self.write(protocol::close_command(&key));
		self.sidecar.detach(&key);
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

fn turn_outcome(events: &[AgentEvent]) -> Option<TurnOutcome> {
	events.iter().find_map(|event| match event {
		AgentEvent::TurnEnded { ended } => Some(ended.outcome),
		_ => None,
	})
}

fn is_turn_activity(frame: &Frame) -> bool {
	matches!(frame, Frame::StreamEvent(_) | Frame::Assistant(_) | Frame::ControlRequest(_))
}

fn starts_a_reply(frame: &Frame) -> bool {
	matches!(
		frame,
		Frame::Assistant(_)
			| Frame::StreamEvent(StreamEventFrame {
				event: Some(StreamEvent::MessageStart { .. }),
				..
			})
	)
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
	mut desk: HostDesk,
	rearmed: Arc<Notify>,
) {
	let mut opened_tx = Some(opened_tx);
	let mut seen: u64 = 0;

	loop {
		let next = tokio::select! {
			biased;
			received = frames.recv() => received.map_or(Next::Ended, Next::Frame),
			() = lease_lapsed(&shared, &rearmed) => Next::Lapsed,
		};
		let raw = match next {
			Next::Frame(raw) => raw,
			Next::Ended => break,
			Next::Lapsed => {
				let lapsed = end_lapsed_turn(&shared, sink.as_ref(), &mut desk, &rearmed).await;
				if let Some(reopened) = lapsed {
					frames = reopened;
				}
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

		if let Frame::TasksPending(pending) = frame {
			let held = {
				let mut guard = shared.lock().await;
				if guard.shutting_down {
					return;
				}
				guard.tasks_pending(pending.count)
			};
			for event in held {
				sink.emit(event);
			}
			continue;
		}

		{
			let mut guard = shared.lock().await;
			if guard.shutting_down {
				return;
			}
			if guard.settles_the_follow_up_alone(&frame) {
				guard.streams_a_follow_up = false;
				sink.follow_up(FollowUp::Settled(guard.translator.ingest(frame)));
				continue;
			}
			if let Some(step) = guard.follow_up_of(&frame) {
				sink.follow_up(step);
			}
			if matches!(frame, Frame::TurnSettled(_))
				&& std::mem::take(&mut guard.streams_a_follow_up)
			{
				sink.follow_up(FollowUp::FoldedIn);
			}
			let entering = match guard.turn {
				TurnState::Submitting if is_turn_activity(&frame) && !guard.streams_a_follow_up => {
					guard.set_turn(TurnState::Running)
				}
				_ => None,
			};
			let holds_a_result = matches!(frame, Frame::Result(_)) && !guard.streams_a_follow_up;
			if holds_a_result {
				guard.result_held();
			}
			let events = guard.translator.ingest(frame);
			let outcome = turn_outcome(&events);
			let released = outcome.and_then(|outcome| guard.turn_ended(&desk.key, outcome));
			let ending = outcome.and_then(|outcome| guard.set_turn(outcome.into()));
			if holds_a_result {
				rearmed.notify_one();
			}
			for event in entering.into_iter().chain(released).chain(events).chain(ending) {
				sink.emit(event);
			}
			if outcome.is_some() {
				let line = Line { sidecar: &desk.sidecar, sink: sink.as_ref(), rearmed: &rearmed };
				line.deliver_next(&mut guard);
			}
		}
	}

	if let Some(tx) = opened_tx.take() {
		let _ = tx.send(Err(desk.sidecar.startup_crash()));
		return;
	}
	on_exit(shared, sink, &desk.key, None).await;
}

enum Next {
	Frame(Value),
	Ended,
	Lapsed,
}

async fn lease_lapsed(shared: &Mutex<Shared>, rearmed: &Notify) {
	loop {
		let deadline = shared.lock().await.lease_deadline();
		let Some((deadline, _)) = deadline else {
			rearmed.notified().await;
			continue;
		};
		tokio::select! {
			() = tokio::time::sleep_until(deadline) => return,
			() = rearmed.notified() => {}
		}
	}
}

async fn end_lapsed_turn(
	shared: &Mutex<Shared>,
	sink: &dyn EventSink,
	desk: &mut HostDesk,
	rearmed: &Notify,
) -> Option<mpsc::UnboundedReceiver<Value>> {
	let mut guard = shared.lock().await;
	let (deadline, lapse) = guard.lease_deadline()?;
	if guard.shutting_down || deadline > tokio::time::Instant::now() {
		return None;
	}
	for event in guard.end_lapsed(lapse) {
		sink.emit(event);
	}
	let (frames, reopened) = guard.reopen(&desk.sidecar);
	desk.key = guard.key.clone();
	match reopened {
		Ok(()) => Line { sidecar: &desk.sidecar, sink, rearmed }.deliver_next(&mut guard),
		Err(error) => {
			sink.emit(AgentEvent::Failed { error });
			guard.abandon_queued(TurnOutcome::Failed).tell(sink);
		}
	}
	Some(frames)
}

async fn on_exit(
	shared: Arc<Mutex<Shared>>,
	sink: Arc<dyn EventSink>,
	session: &str,
	reason: Option<TransportError>,
) {
	let (released, failing, abandoned) = {
		let mut guard = shared.lock().await;
		if guard.shutting_down {
			return;
		}
		(
			guard.turn_ended(session, TurnOutcome::Failed),
			guard.set_turn(TurnState::Failed),
			guard.abandon_queued(TurnOutcome::Failed),
		)
	};

	if let Some(event) = released {
		sink.emit(event);
	}
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
	abandoned.tell(sink.as_ref());
}

#[cfg(test)]
mod tests {
	use super::*;

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
	fn a_run_names_the_members_reading_it_only_when_there_are_some() {
		let serialized = |options: SessionOptions| {
			serde_json::to_value(options.open_request(true)).expect("the request serializes")
		};
		let members = vec![
			SpaceMember {
				name: Some("Ada".to_owned()),
				email: "ada@example.com".to_owned(),
				is_host: true,
			},
			SpaceMember { name: None, email: "bea@example.com".to_owned(), is_host: false },
		];

		assert_eq!(
			serialized(options().read_by(members))["members"],
			serde_json::json!([
				{ "name": "Ada", "email": "ada@example.com", "isHost": true },
				{ "email": "bea@example.com", "isHost": false },
			])
		);
		assert_eq!(serialized(options()).get("members"), None);
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
		use crate::db::connection::fixture_root;
		use crate::environment::connection;
		use crate::environment::contract::{
			ConnectionKind, EnvOwner, EnvScope, API_KEY, CONNECTION_NAMES, SUBSCRIPTION_TOKEN,
		};
		use crate::environment::store;

		let root = fixture_root("session-connection");
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

	fn a_running_turn() -> Shared {
		let mut shared = Shared {
			key: "s1".to_owned(),
			reopening: options().open_request(false),
			translator: Translator::new(false),
			turn: TurnState::Running,
			shutting_down: false,
			running: None,
			queued: VecDeque::new(),
			lease: RunLease::default(),
			streams_a_follow_up: false,
		};
		shared.turn_started("s1", Some("t1".to_owned()), "p1".to_owned());
		shared
	}

	fn held(count: u32) -> AgentEvent {
		AgentEvent::TurnHeld {
			hold: Some(TurnHold { reason: TurnHoldReason::BackgroundTasks, count }),
		}
	}

	const RELEASED: AgentEvent = AgentEvent::TurnHeld { hold: None };

	fn holds_in(events: Vec<AgentEvent>) -> Vec<AgentEvent> {
		events.into_iter().filter(|event| matches!(event, AgentEvent::TurnHeld { .. })).collect()
	}

	#[test]
	fn a_hold_is_told_once_per_count_change_and_released_at_zero() {
		let mut shared = a_running_turn();

		let told: Vec<AgentEvent> =
			[2, 2, 1, 0, 0].into_iter().flat_map(|count| shared.tasks_pending(count)).collect();

		assert_eq!(holds_in(told), vec![held(2), held(1), RELEASED]);
	}

	#[test]
	fn a_hold_travels_as_its_reason_and_count_and_a_release_as_null() {
		assert_eq!(
			serde_json::to_value(held(3)).expect("a hold serializes"),
			serde_json::json!({ "type": "turnHeld", "hold": { "reason": "backgroundTasks", "count": 3 } })
		);
		assert_eq!(
			serde_json::to_value(RELEASED).expect("a release serializes"),
			serde_json::json!({ "type": "turnHeld", "hold": null })
		);
	}

	#[test]
	fn a_closing_of_prompts_travels_as_its_permission_and_question_ids() {
		let closed = AgentEvent::PromptsClosed {
			permission_ids: vec!["w1".to_owned()],
			question_ids: vec!["q1".to_owned()],
		};

		assert_eq!(
			serde_json::to_value(closed).expect("a closing serializes"),
			serde_json::json!({ "type": "promptsClosed", "permissionIds": ["w1"], "questionIds": ["q1"] })
		);
	}

	const PROMPTING_SIDECAR: &str = r#"#!/bin/sh
printf '%s\n' '{"type":"ready","provider":"stub","version":"0"}'
while IFS= read -r line; do
	key=$(printf '%s' "$line" | sed -n 's/.*"session":"\([^"]*\)".*/\1/p')
	case "$line" in
	*'"type":"open"'*)
		printf '{"session":"%s","frame":{"type":"opened"}}\n' "$key"
		;;
	*'"type":"prompt"'*)
		printf '{"session":"%s","frame":{"type":"control_request","request_id":"w1","request":{"subtype":"can_use_tool","tool_name":"Bash","input":{}}}}\n' "$key"
		printf '{"session":"%s","frame":{"type":"control_request","request_id":"q1","request":{"subtype":"can_use_tool","tool_name":"AskUserQuestion","input":{"questions":[]}}}}\n' "$key"
		;;
	*'"type":"interrupt"'*)
		printf '{"session":"%s","frame":{"type":"turn_settled","subtype":"error_during_execution"}}\n' "$key"
		;;
	esac
done
"#;

	async fn heard_until(
		heard: &mut mpsc::UnboundedReceiver<AgentEvent>,
		ends: impl Fn(&AgentEvent) -> bool,
	) -> Vec<AgentEvent> {
		let mut told = Vec::new();
		let listening = async {
			while let Some(event) = heard.recv().await {
				let has_ended = ends(&event);
				told.push(event);
				if has_ended {
					return;
				}
			}
		};
		tokio::time::timeout(Duration::from_secs(10), listening).await.expect("heard in time");
		told
	}

	#[tokio::test]
	async fn an_answer_to_a_prompt_its_stop_closed_is_refused_and_resolves_nothing() {
		let script = crate::removed_on_drop::RemovedOnDrop(std::env::temp_dir().join(format!(
			"kiroshi-prompting-sidecar-{}-{}.sh",
			std::process::id(),
			uuid::Uuid::new_v4()
		)));
		crate::executable_script::an_executable_script(&script, PROMPTING_SIDECAR);
		let sidecar =
			Sidecar::start(super::super::sidecar::SidecarOptions::new(script.to_path_buf()))
				.await
				.expect("the sidecar is ready");
		let (sink, mut heard) = mpsc::unbounded_channel();
		let session =
			Session::start(sidecar, SessionOptions::new(std::env::temp_dir()), Arc::new(sink))
				.await
				.expect("the session opens");
		session.submit_prompt("hello").await.expect("the prompt is sent");
		let mut told =
			heard_until(&mut heard, |event| matches!(event, AgentEvent::QuestionRequested { .. }))
				.await;
		session.cancel_turn().await.expect("the turn stops");
		told.extend(
			heard_until(&mut heard, |event| matches!(event, AgentEvent::TurnEnded { .. })).await,
		);

		let permitted = session.respond_to_permission("w1", PermissionDecision::AllowOnce).await;
		let answered = session.answer_question("q1", HashMap::new(), None).await;
		session.shutdown().await;
		while let Ok(event) = heard.try_recv() {
			told.push(event);
		}

		assert_eq!(permitted, Err(TransportError::UnknownPermission { id: "w1".to_owned() }));
		assert_eq!(answered, Err(TransportError::UnknownPermission { id: "q1".to_owned() }));
		assert!(
			!told.iter().any(|event| matches!(event, AgentEvent::PermissionResolved { .. })),
			"a closed prompt resolved: {told:?}"
		);
	}

	#[test]
	fn a_turn_ending_while_held_releases_its_hold_and_an_unheld_one_releases_nothing() {
		let mut held_turn = a_running_turn();
		held_turn.tasks_pending(1);
		assert_eq!(held_turn.turn_ended("s1", TurnOutcome::Completed), Some(RELEASED));

		let mut unheld_turn = a_running_turn();
		assert!(holds_in(unheld_turn.tasks_pending(0)).is_empty());
		assert_eq!(unheld_turn.turn_ended("s1", TurnOutcome::Completed), None);
	}

	#[test]
	fn a_turn_lapsing_while_held_releases_its_hold_before_the_failure() {
		let mut shared = a_running_turn();
		shared.tasks_pending(1);

		let events = shared.end_lapsed(Lapse::TasksPending);

		assert_eq!(events.first(), Some(&RELEASED));
		assert!(matches!(events.last(), Some(AgentEvent::Failed { .. })));
	}

	#[test]
	fn a_shutdown_while_held_releases_the_hold_before_the_turn_ends() {
		let mut shared = a_running_turn();
		shared.tasks_pending(1);

		let events = shared.ended_by_shutdown("s1");

		assert_eq!(events.first(), Some(&RELEASED));
		assert!(matches!(events.get(1), Some(AgentEvent::TurnEnded { .. })));
	}
}
