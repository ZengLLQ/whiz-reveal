mod engine;
mod storage;

use engine::{Config, Presentation, Snapshot, DRAW_DURATION_MS};
use rand::{
    rngs::{OsRng, StdRng},
    SeedableRng,
};
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use storage::{new_session_id, SessionStore};
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

const STATE_EVENT: &str = "whizreveal://state";

struct Backend {
    store: Mutex<Result<SessionStore, String>>,
    display_launching: AtomicBool,
}

fn require_controller(window: &WebviewWindow) -> Result<(), String> {
    if window.label() != "controller" {
        Err("Only the controller can change a draw session.".into())
    } else {
        Ok(())
    }
}

fn current_time_ms() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|time| time.as_millis() as u64)
        .map_err(|_| "The system clock is before January 1970. Correct it before drawing.".into())
}

fn publish(app: &AppHandle, snapshot: &Snapshot) {
    // A durable mutation must not be reported as a failed draw if a closing webview
    // cannot receive its event. The command response remains an authoritative snapshot.
    if let Err(error) = app.emit(STATE_EVENT, snapshot) {
        eprintln!("WhizReveal could not deliver a state event: {error}");
    }
}

fn mutate<F>(backend: &Backend, app: &AppHandle, operation: F) -> Result<Snapshot, String>
where
    F: FnOnce(&mut Snapshot) -> Result<(), String>,
{
    let mut guard = backend
        .store
        .lock()
        .map_err(|_| "The session lock is unavailable. Restart WhizReveal.".to_string())?;
    let store = guard.as_mut().map_err(|error| error.clone())?;
    let mut draft = store.snapshot.clone();
    operation(&mut draft)?;
    let snapshot = store.commit(draft)?;
    // Keep events serialized with commits; clients also reject old revisions.
    publish(app, &snapshot);
    Ok(snapshot)
}

#[tauri::command]
fn get_snapshot(backend: State<'_, Backend>) -> Result<Snapshot, String> {
    let guard = backend
        .store
        .lock()
        .map_err(|_| "The session lock is unavailable. Restart WhizReveal.".to_string())?;
    guard
        .as_ref()
        .map(|store| store.snapshot.clone())
        .map_err(|error| error.clone())
}

#[tauri::command]
fn update_config(
    window: WebviewWindow,
    app: AppHandle,
    backend: State<'_, Backend>,
    config: Config,
) -> Result<Snapshot, String> {
    require_controller(&window)?;
    mutate(&backend, &app, |snapshot| snapshot.update_config(config))
}

#[tauri::command]
fn update_presentation(
    window: WebviewWindow,
    app: AppHandle,
    backend: State<'_, Backend>,
    presentation: Presentation,
) -> Result<Snapshot, String> {
    require_controller(&window)?;
    mutate(&backend, &app, |snapshot| {
        snapshot.update_presentation(presentation)
    })
}

#[tauri::command]
fn draw(
    window: WebviewWindow,
    app: AppHandle,
    backend: State<'_, Backend>,
) -> Result<Snapshot, String> {
    require_controller(&window)?;
    let mut rng = StdRng::from_rng(OsRng)
        .map_err(|error| format!("Windows could not supply secure randomness: {error}"))?;
    let snapshot = mutate(&backend, &app, |snapshot| {
        snapshot.draw(&mut rng, current_time_ms()?)
    })?;
    let session_id = snapshot.session_id.clone();
    let draw_id = snapshot
        .active_draw
        .as_ref()
        .ok_or("The draw could not be started.")?
        .draw
        .id;
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(DRAW_DURATION_MS));
        let backend = app.state::<Backend>();
        if let Ok(mut guard) = backend.store.lock() {
            if let Ok(store) = guard.as_mut() {
                // activeDraw is intentionally transient: persisted history already contains
                // this result and reopening the app should reveal it immediately.
                match store.snapshot.finish_draw(&session_id, draw_id) {
                    Ok(true) => publish(&app, &store.snapshot),
                    Ok(false) => {}
                    Err(error) => eprintln!("WhizReveal could not complete animation: {error}"),
                }
            }
        };
    });
    Ok(snapshot)
}

#[tauri::command]
fn reset_session(
    window: WebviewWindow,
    app: AppHandle,
    backend: State<'_, Backend>,
) -> Result<Snapshot, String> {
    require_controller(&window)?;
    mutate(&backend, &app, |snapshot| snapshot.reset(new_session_id()?))
}

#[tauri::command]
async fn launch_display(
    window: WebviewWindow,
    app: AppHandle,
    backend: State<'_, Backend>,
) -> Result<(), String> {
    require_controller(&window)?;
    if backend.display_launching.swap(true, Ordering::AcqRel) {
        return Err("The display is already opening.".into());
    }
    // Webview creation must run in an async command on Windows (WebView2).
    let result = (|| -> Result<(), String> {
        if let Some(display) = app.get_webview_window("display") {
            display.show().map_err(|error| error.to_string())?;
            display
                .set_decorations(false)
                .map_err(|error| error.to_string())?;
            display
                .set_fullscreen(true)
                .map_err(|error| error.to_string())?;
            display.set_focus().map_err(|error| error.to_string())?;
            window.set_focus().map_err(|error| error.to_string())?;
            return Ok(());
        }
        let monitors = window
            .available_monitors()
            .map_err(|error| error.to_string())?;
        let controller_monitor = window
            .current_monitor()
            .map_err(|error| error.to_string())?;
        let target = monitors
            .iter()
            .find(|monitor| {
                controller_monitor
                    .as_ref()
                    .map(|current| current.position() != monitor.position())
                    .unwrap_or(false)
            })
            .or(controller_monitor.as_ref())
            .or(monitors.first());
        let display = WebviewWindowBuilder::new(
            &app,
            "display",
            WebviewUrl::App("index.html?window=display".into()),
        )
        .title("WhizReveal - Display")
        .decorations(false)
        .visible(false)
        .focused(false)
        .inner_size(1280.0, 720.0)
        .background_color(tauri::window::Color(11, 13, 16, 255))
        .build()
        .map_err(|error| format!("Could not launch the display: {error}"))?;
        // Use physical monitor coordinates to respect mixed-DPI and negative-position displays.
        let show_result = (|| -> Result<(), String> {
            if let Some(monitor) = target {
                display
                    .set_position(tauri::Position::Physical(*monitor.position()))
                    .map_err(|error| error.to_string())?;
                display
                    .set_size(tauri::Size::Physical(*monitor.size()))
                    .map_err(|error| error.to_string())?;
            }
            display
                .set_fullscreen(true)
                .map_err(|error| error.to_string())?;
            display.show().map_err(|error| error.to_string())?;
            window.set_focus().map_err(|error| error.to_string())?;
            Ok(())
        })();
        if show_result.is_err() {
            let _ = display.close();
        }
        show_result
    })();
    backend.display_launching.store(false, Ordering::Release);
    result
}

#[tauri::command]
fn close_display(window: WebviewWindow, app: AppHandle) -> Result<(), String> {
    require_controller(&window)?;
    if let Some(display) = app.get_webview_window("display") {
        display.close().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let store = app
                .path()
                .app_local_data_dir()
                .map_err(|error| format!("Could not locate local app data: {error}"))
                .and_then(|directory| SessionStore::open(&directory));
            // Surface startup/persistence errors inside the controller instead of replacing data.
            app.manage(Backend {
                store: Mutex::new(store),
                display_launching: AtomicBool::new(false),
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "controller" && matches!(event, tauri::WindowEvent::Destroyed) {
                if let Some(display) = window.app_handle().get_webview_window("display") {
                    let _ = display.close();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_snapshot,
            update_config,
            update_presentation,
            draw,
            reset_session,
            launch_display,
            close_display
        ])
        .run(tauri::generate_context!())
        .expect("WhizReveal could not start the native application");
}
