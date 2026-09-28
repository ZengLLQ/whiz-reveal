mod engine;
mod storage;

use engine::{Config, Presentation, Snapshot};
use rand::{
    rngs::{OsRng, StdRng},
    SeedableRng,
};
use serde::Serialize;
use std::{
    io::Write,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Condvar, Mutex,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use storage::{new_session_id, SessionStore};
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};

const STATE_EVENT: &str = "whizreveal://state";
const DISPLAY_EVENT: &str = "whizreveal://display";
const MAX_HISTORY_PDF_BYTES: usize = 50 * 1024 * 1024;

fn validate_history_pdf(file_name: &str, bytes: &[u8]) -> Result<(), String> {
    // This is only a suggested basename, never a destination supplied by the webview.
    let stem = file_name
        .split('.')
        .next()
        .unwrap_or("")
        .to_ascii_uppercase();
    let reserved = matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (stem.len() == 4
            && (stem.starts_with("COM") || stem.starts_with("LPT"))
            && matches!(stem.as_bytes()[3], b'1'..=b'9'));
    if file_name.is_empty()
        || file_name.len() > 200
        || file_name.trim() != file_name
        || file_name.ends_with('.')
        || reserved
        || file_name
            .chars()
            .any(|ch| ch.is_control() || "\\/:*?\"<>|".contains(ch))
    {
        return Err("The PDF filename is invalid. Please try exporting again.".into());
    }
    if bytes.len() > MAX_HISTORY_PDF_BYTES {
        return Err("This PDF exceeds the 50 MB export limit.".into());
    }
    if !bytes.starts_with(b"%PDF-") {
        return Err("The history report could not be encoded as a PDF.".into());
    }
    Ok(())
}

fn pdf_destination(mut path: PathBuf) -> Result<PathBuf, String> {
    if !path.is_absolute() || path.file_name().is_none() {
        return Err("Choose a local file destination for the PDF.".into());
    }
    if !path
        .extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case("pdf"))
    {
        let mut filename = path.file_name().unwrap().to_os_string();
        filename.push(".pdf");
        path.set_file_name(filename);
    }
    Ok(path)
}

fn write_history_pdf(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let directory = path.parent().ok_or("The PDF destination is invalid.")?;
    let mut temporary = tempfile::NamedTempFile::new_in(directory)
        .map_err(|error| format!("Could not prepare the PDF save: {error}"))?;
    temporary
        .write_all(bytes)
        .and_then(|_| temporary.as_file().sync_all())
        .map_err(|error| format!("Could not save the PDF: {error}"))?;
    // Replace only after the complete report is written, retaining an existing
    // report if writing fails. The temporary lives on the destination volume.
    temporary
        .persist(path)
        .map_err(|error| format!("Could not replace the selected PDF: {error}"))?;
    Ok(())
}

#[tauri::command]
async fn save_history_pdf(
    window: WebviewWindow,
    app: AppHandle,
    file_name: String,
    bytes: Vec<u8>,
) -> Result<bool, String> {
    require_controller(&window)?;
    validate_history_pdf(&file_name, &bytes)?;
    // Native modal dialogs and disk writes must not block the UI/runtime thread.
    tauri::async_runtime::spawn_blocking(move || {
        let Some(chosen) = app
            .dialog()
            .file()
            .set_parent(&window)
            .set_title("Export session history")
            .set_file_name(file_name)
            .add_filter("PDF document", &["pdf"])
            .blocking_save_file()
        else {
            return Ok(false);
        };
        let chosen = chosen
            .into_path()
            .map_err(|_| "Choose a local file destination for the PDF.".to_string())?;
        let destination = pdf_destination(chosen.clone())?;
        // The OS handles the normal overwrite prompt. If adding the extension
        // changes the selected path, confirm before replacing a different file.
        if destination != chosen
            && destination.exists()
            && !app
                .dialog()
                .message(format!(
                    "{} already exists. Replace this PDF?",
                    destination.display()
                ))
                .title("Replace PDF")
                .parent(&window)
                .buttons(MessageDialogButtons::OkCancel)
                .blocking_show()
        {
            return Ok(false);
        }
        write_history_pdf(&destination, &bytes)?;
        Ok(true)
    })
    .await
    .map_err(|error| format!("The PDF save could not finish: {error}"))?
}

#[derive(Clone, Copy, Default, Serialize)]
struct DisplayStatus {
    open: bool,
    revision: u64,
}

impl DisplayStatus {
    fn set_open(&mut self, open: bool) -> bool {
        if self.open == open {
            return false;
        }
        self.open = open;
        self.revision += 1;
        true
    }
}

struct Backend {
    store: Mutex<Result<SessionStore, String>>,
    display_launching: AtomicBool,
    display_status: Mutex<DisplayStatus>,
    display_changed: Condvar,
}

fn display_status(backend: &Backend) -> Result<DisplayStatus, String> {
    backend
        .display_status
        .lock()
        .map(|status| *status)
        .map_err(|_| "The display status is unavailable. Restart WhizReveal.".into())
}

fn publish_display(app: &AppHandle, open: bool) -> Result<DisplayStatus, String> {
    let backend = app.state::<Backend>();
    let mut status = backend
        .display_status
        .lock()
        .map_err(|_| "The display status is unavailable. Restart WhizReveal.".to_string())?;
    if status.set_open(open) {
        // Serialize lifecycle events with revisions, independently of raffle state.
        if let Err(error) = app.emit(DISPLAY_EVENT, *status) {
            eprintln!("WhizReveal could not deliver a display event: {error}");
        }
        backend.display_changed.notify_all();
    }
    Ok(*status)
}

#[tauri::command]
fn get_display_status(backend: State<'_, Backend>) -> Result<DisplayStatus, String> {
    display_status(&backend)
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
    let duration_ms = snapshot
        .active_draw
        .as_ref()
        .ok_or("No active draw")?
        .duration_ms;
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(duration_ms));
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
) -> Result<DisplayStatus, String> {
    require_controller(&window)?;
    if backend.display_launching.swap(true, Ordering::AcqRel) {
        return Err("The display is already opening or closing.".into());
    }
    // Webview creation must run in an async command on Windows (WebView2).
    let result = (|| -> Result<DisplayStatus, String> {
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
            // This window was recorded when it was built. Read its latest
            // lifecycle state so a simultaneous manual close cannot be undone.
            return display_status(&backend);
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
        // Record the new hidden window before showing it. A manual close can
        // then only advance this revision, never be overwritten by launch.
        publish_display(&app, true)?;
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
        show_result?;
        display_status(&backend)
    })();
    backend.display_launching.store(false, Ordering::Release);
    result
}

#[tauri::command]
async fn close_display(
    window: WebviewWindow,
    app: AppHandle,
    backend: State<'_, Backend>,
) -> Result<DisplayStatus, String> {
    require_controller(&window)?;
    if backend.display_launching.swap(true, Ordering::AcqRel) {
        return Err("The display is already opening or closing.".into());
    }
    let operation = async {
        if let Some(display) = app.get_webview_window("display") {
            display.close().map_err(|error| error.to_string())?;
            // Closing is asynchronous. Wait off the main/runtime thread for
            // Destroyed before allowing the same window label to be reopened.
            let app = app.clone();
            tauri::async_runtime::spawn_blocking(move || {
                let backend = app.state::<Backend>();
                let status = backend
                    .display_status
                    .lock()
                    .map_err(|_| "The display status is unavailable.".to_string())?;
                let (status, _) = backend
                    .display_changed
                    .wait_timeout_while(status, Duration::from_secs(5), |status| status.open)
                    .map_err(|_| "The display status is unavailable.".to_string())?;
                if status.open {
                    Err("The display could not close. Close its window and try again.".into())
                } else {
                    Ok(*status)
                }
            })
            .await
            .map_err(|error| format!("Could not wait for the display to close: {error}"))?
        } else {
            publish_display(&app, false)
        }
    }
    .await;
    backend.display_launching.store(false, Ordering::Release);
    operation
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
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
                display_status: Mutex::new(DisplayStatus::default()),
                display_changed: Condvar::new(),
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "display" && matches!(event, tauri::WindowEvent::Destroyed) {
                let _ = publish_display(window.app_handle(), false);
            }
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
            get_display_status,
            launch_display,
            close_display,
            save_history_pdf
        ])
        .run(tauri::generate_context!())
        .expect("WhizReveal could not start the native application");
}

#[cfg(test)]
mod display_tests {
    use super::DisplayStatus;

    #[test]
    fn display_revisions_follow_open_close_and_reopen() {
        let mut status = DisplayStatus::default();
        assert!(!status.open);
        assert_eq!(status.revision, 0);
        assert!(status.set_open(true));
        assert!(status.open);
        assert_eq!(status.revision, 1);
        assert!(status.set_open(false));
        assert!(!status.open);
        assert_eq!(status.revision, 2);
        assert!(status.set_open(true));
        assert!(status.open);
        assert_eq!(status.revision, 3);
    }

    #[test]
    fn repeated_status_reports_do_not_create_false_transitions() {
        let mut status = DisplayStatus::default();
        assert!(!status.set_open(false));
        assert_eq!(status.revision, 0);
        assert!(status.set_open(true));
        assert!(!status.set_open(true));
        assert_eq!(status.revision, 1);
        assert!(status.set_open(false));
        assert!(!status.set_open(false));
        assert_eq!(status.revision, 2);
    }
}

#[cfg(test)]
mod history_pdf_tests {
    use super::*;
    #[test]
    fn validates_pdf_data_and_suggested_basename() {
        assert!(validate_history_pdf("report.pdf", b"%PDF-1.7\n%%EOF").is_ok());
        for name in ["../report.pdf", "CON.pdf", "a\\b.pdf", "bad:name.pdf", ""] {
            assert!(validate_history_pdf(name, b"%PDF-1.7").is_err());
        }
        assert!(validate_history_pdf("report.pdf", b"not a PDF").is_err());
    }
    #[test]
    fn adds_extension_and_replaces_only_after_complete_write() {
        let directory = tempfile::tempdir().unwrap();
        let destination = pdf_destination(directory.path().join("report")).unwrap();
        assert_eq!(destination.extension().unwrap(), "pdf");
        write_history_pdf(&destination, b"%PDF-old").unwrap();
        write_history_pdf(&destination, b"%PDF-new").unwrap();
        assert_eq!(std::fs::read(&destination).unwrap(), b"%PDF-new");
        assert!(
            write_history_pdf(&directory.path().join("missing/report.pdf"), b"%PDF-failed")
                .is_err()
        );
        assert_eq!(std::fs::read(&destination).unwrap(), b"%PDF-new");
    }
}
