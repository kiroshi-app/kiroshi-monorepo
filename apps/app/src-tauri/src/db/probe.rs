use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::{Mutex, Once, OnceLock, PoisonError};
use std::time::{Duration, Instant};

static START: OnceLock<Instant> = OnceLock::new();
static WATCHDOG: Once = Once::new();
static QUEUED: AtomicUsize = AtomicUsize::new(0);
static WAITING: AtomicUsize = AtomicUsize::new(0);
static SEQ: AtomicU64 = AtomicU64::new(0);
static HOLDER: Mutex<Option<(u64, String, Instant)>> = Mutex::new(None);
static OLDEST_QUEUED: Mutex<Vec<(u64, String, Instant)>> = Mutex::new(Vec::new());

pub fn elapsed() -> f64 {
	START.get_or_init(Instant::now).elapsed().as_secs_f64()
}

#[macro_export]
macro_rules! ope1176 {
	($($arg:tt)*) => {{
		let line = format!($($arg)*);
		if cfg!(test) {
			eprintln!("[ope1176 t={:.3}] {}", $crate::db::probe::elapsed(), line);
		} else {
			log::info!("[ope1176] rust t={:.3} {}", $crate::db::probe::elapsed(), line);
		}
	}};
}

pub fn caller_of<F>() -> String {
	let name = std::any::type_name::<F>();
	let trimmed = name.trim_end_matches("::{{closure}}");
	trimmed.trim_start_matches("kiroshi_app::").to_owned()
}

pub struct Ticket {
	seq: u64,
	caller: String,
	spawned: Instant,
}

pub fn spawned(caller: String) -> Ticket {
	watchdog_started();
	let seq = SEQ.fetch_add(1, Ordering::SeqCst);
	let spawned = Instant::now();
	QUEUED.fetch_add(1, Ordering::SeqCst);
	OLDEST_QUEUED.lock().unwrap_or_else(PoisonError::into_inner).push((seq, caller.clone(), spawned));
	Ticket { seq, caller, spawned }
}

pub fn started(ticket: &Ticket) -> Instant {
	QUEUED.fetch_sub(1, Ordering::SeqCst);
	OLDEST_QUEUED.lock().unwrap_or_else(PoisonError::into_inner).retain(|(seq, _, _)| *seq != ticket.seq);
	WAITING.fetch_add(1, Ordering::SeqCst);
	Instant::now()
}

pub fn acquired(ticket: &Ticket, started: Instant) -> Instant {
	WAITING.fetch_sub(1, Ordering::SeqCst);
	let now = Instant::now();
	*HOLDER.lock().unwrap_or_else(PoisonError::into_inner) = Some((ticket.seq, ticket.caller.clone(), now));
	let queued = started.duration_since(ticket.spawned);
	let waited = now.duration_since(started);
	if is_watched(&ticket.caller) || queued > SLOW || waited > SLOW {
		crate::ope1176!(
			"db acquired #{} caller={} pool_queue_ms={} lock_wait_ms={} queued_now={} waiting_now={}",
			ticket.seq,
			ticket.caller,
			queued.as_millis(),
			waited.as_millis(),
			QUEUED.load(Ordering::SeqCst),
			WAITING.load(Ordering::SeqCst)
		);
	}
	now
}

pub fn released(ticket: &Ticket, started: Instant, acquired: Instant) {
	*HOLDER.lock().unwrap_or_else(PoisonError::into_inner) = None;
	let held = acquired.elapsed();
	let line = format!(
		"db released #{} caller={} pool_queue_ms={} lock_wait_ms={} hold_ms={}",
		ticket.seq,
		ticket.caller,
		started.duration_since(ticket.spawned).as_millis(),
		acquired.duration_since(started).as_millis(),
		held.as_millis()
	);
	if is_watched(&ticket.caller) || held > SLOW {
		crate::ope1176!("{line}");
	} else {
		eprintln!("[ope1176 t={:.3}] {line}", elapsed());
	}
}

const SLOW: Duration = Duration::from_millis(100);

fn is_watched(caller: &str) -> bool {
	caller.contains("page_messages") || caller.contains("MissionsRepository::of_conversation")
}

fn watchdog_started() {
	WATCHDOG.call_once(|| {
		let Ok(handle) = tokio::runtime::Handle::try_current() else {
			return;
		};
		let spawned = std::thread::Builder::new().name("ope1176-watchdog".into()).spawn(move || loop {
			std::thread::sleep(Duration::from_millis(500));
			report_holder();
			report_queue();
			report_runtime(&handle);
		});
		if let Err(failure) = spawned {
			crate::ope1176!("watchdog did not start: {failure}");
		}
	});
}

fn report_holder() {
	let holder = HOLDER.lock().unwrap_or_else(PoisonError::into_inner).clone();
	if let Some((seq, caller, since)) = holder {
		if since.elapsed() > Duration::from_secs(1) {
			crate::ope1176!(
				"watchdog LOCK HELD #{seq} caller={caller} for_ms={} waiting={} queued={}",
				since.elapsed().as_millis(),
				WAITING.load(Ordering::SeqCst),
				QUEUED.load(Ordering::SeqCst)
			);
		}
	}
}

fn report_queue() {
	let queued = OLDEST_QUEUED.lock().unwrap_or_else(PoisonError::into_inner).clone();
	if let Some((seq, caller, since)) = queued.first() {
		if since.elapsed() > Duration::from_secs(1) {
			crate::ope1176!(
				"watchdog POOL QUEUE #{seq} caller={caller} queued_for_ms={} queued_total={}",
				since.elapsed().as_millis(),
				queued.len()
			);
		}
	}
}

fn report_runtime(handle: &tokio::runtime::Handle) {
	let probe = Instant::now();
	let (blocking_tx, blocking_rx) = std::sync::mpsc::channel();
	let (worker_tx, worker_rx) = std::sync::mpsc::channel();
	handle.spawn_blocking(move || blocking_tx.send(probe.elapsed()).is_ok());
	handle.spawn(async move { worker_tx.send(probe.elapsed()).is_ok() });
	let bound = Duration::from_secs(2);
	let blocking = blocking_rx.recv_timeout(bound);
	let worker = worker_rx.recv_timeout(bound);
	let metrics = handle.metrics();
	let is_slow = !matches!(blocking, Ok(d) if d < SLOW) || !matches!(worker, Ok(d) if d < SLOW);
	if is_slow {
		crate::ope1176!(
			"watchdog RUNTIME blocking_probe={blocking:?} worker_probe={worker:?} workers={} alive_tasks={} global_queue={}",
			metrics.num_workers(),
			metrics.num_alive_tasks(),
			metrics.global_queue_depth()
		);
	}
}
