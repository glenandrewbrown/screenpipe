//! Thread-safe capture module for macOS
//!
//! On macOS, the xcap library has several thread safety issues:
//! 1. `Monitor::name()` uses NSScreen which requires the main thread
//! 2. `Window::is_focused()` uses NSWorkspace which requires the main thread
//! 3. Core Graphics APIs cause SIGSEGV on Intel Macs due to Objective-C runtime issues
//!
//! IMPORTANT: On macOS Intel (x86_64), window capture is disabled entirely due to
//! persistent crashes in libobjc.A.dylib (lookUpImpOrForward). Only monitor-level
//! capture is supported on Intel Macs. Apple Silicon Macs work normally.
//!
//! This module provides a single-threaded capture worker that serializes all
//! xcap operations to avoid race conditions and thread safety violations.

use image::RgbaImage;
use std::sync::mpsc;
use std::sync::OnceLock;
use std::thread;
use tracing::debug;
use xcap::{Monitor, Window, XCapError};

/// Task sent to the capture worker thread
type CaptureTask = Box<dyn FnOnce() + Send + 'static>;

/// Global sender for the capture worker thread
static CAPTURE_SENDER: OnceLock<mpsc::Sender<CaptureTask>> = OnceLock::new();

/// Get or initialize the capture worker thread.
/// All xcap operations are serialized through this single thread to avoid
/// thread safety issues on macOS Intel.
fn get_sender() -> &'static mpsc::Sender<CaptureTask> {
    CAPTURE_SENDER.get_or_init(|| {
        let (tx, rx) = mpsc::channel::<CaptureTask>();

        thread::Builder::new()
            .name("xcap-capture-worker".to_string())
            .spawn(move || {
                debug!("xcap-capture-worker thread started");

                // Process tasks forever
                while let Ok(task) = rx.recv() {
                    task();
                }

                debug!("xcap-capture-worker thread exiting");
            })
            .expect("Failed to spawn xcap capture worker thread");

        tx
    })
}

/// Execute a closure on the capture worker thread and wait for result.
/// This serializes all xcap operations to avoid thread safety issues.
pub fn run_on_capture_thread<F, R>(f: F) -> R
where
    F: FnOnce() -> R + Send + 'static,
    R: Send + 'static,
{
    let (result_tx, result_rx) = mpsc::channel();

    let task = Box::new(move || {
        let result = f();
        let _ = result_tx.send(result);
    });

    get_sender()
        .send(task)
        .expect("xcap capture worker thread has panicked");

    result_rx.recv().expect("xcap capture worker thread has panicked")
}

/// Monitor data that can be safely transferred between threads
#[derive(Clone, Debug)]
pub struct MonitorInfo {
    pub id: u32,
    pub width: u32,
    pub height: u32,
    pub is_primary: bool,
    /// Name uses display ID as fallback since NSScreen requires main thread
    pub name: String,
}

/// Get all monitors using the capture worker thread
pub fn get_all_monitors() -> Result<Vec<MonitorInfo>, XCapError> {
    run_on_capture_thread(|| {
        debug!("get_all_monitors executing on thread: {:?}", std::thread::current().name());
        let monitors = Monitor::all()?;
        let mut results = Vec::with_capacity(monitors.len());

        for monitor in monitors {
            let id = monitor.id().unwrap_or(0);
            let width = monitor.width().unwrap_or(0);
            let height = monitor.height().unwrap_or(0);
            let is_primary = monitor.is_primary().unwrap_or(false);
            // DO NOT call monitor.name() - it requires main thread
            let name = format!("Display {}", id);

            results.push(MonitorInfo {
                id,
                width,
                height,
                is_primary,
                name,
            });
        }

        Ok(results)
    })
}

/// Capture a monitor image using the capture worker thread
pub fn capture_monitor_image(monitor_id: u32) -> Result<RgbaImage, XCapError> {
    run_on_capture_thread(move || {
        debug!("capture_monitor_image executing on thread: {:?}", std::thread::current().name());
        let monitor = Monitor::all()?
            .into_iter()
            .find(|m| m.id().unwrap_or(0) == monitor_id)
            .ok_or_else(|| XCapError::new("Monitor not found"))?;

        if monitor.width().unwrap_or(0) == 0 || monitor.height().unwrap_or(0) == 0 {
            return Err(XCapError::new("Invalid monitor dimensions"));
        }

        monitor.capture_image()
    })
}

/// Window data that can be safely transferred between threads
#[derive(Clone, Debug)]
pub struct WindowInfo {
    pub app_name: String,
    pub title: String,
    pub process_id: i32,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub is_minimized: bool,
}

/// Captured window with image data
pub struct CapturedWindowData {
    pub info: WindowInfo,
    pub image: RgbaImage,
}

/// Get the PID of the frontmost application using AppleScript (thread-safe)
fn get_frontmost_app_pid() -> Option<i32> {
    use std::process::Command;

    let output = Command::new("osascript")
        .args(["-e", "tell application \"System Events\" to unix id of first process whose frontmost is true"])
        .output()
        .ok()?;

    if output.status.success() {
        let pid_str = String::from_utf8_lossy(&output.stdout);
        pid_str.trim().parse::<i32>().ok()
    } else {
        None
    }
}

/// Capture all visible windows using the capture worker thread
pub fn capture_all_windows() -> Result<(Vec<CapturedWindowData>, Option<i32>), XCapError> {
    // Get frontmost PID outside the capture thread (osascript is thread-safe)
    let frontmost_pid = get_frontmost_app_pid();

    run_on_capture_thread(move || {
        debug!("capture_all_windows executing on thread: {:?}", std::thread::current().name());
        let windows = Window::all()?;
        let mut results = Vec::new();

        for window in windows {
            // Get window info using CG APIs (thread-safe)
            let app_name = match window.app_name() {
                Ok(name) => name.to_string(),
                Err(e) => {
                    debug!("Failed to get app_name: {}", e);
                    continue;
                }
            };

            let title = match window.title() {
                Ok(t) => t.to_string(),
                Err(e) => {
                    debug!("Failed to get title for {}: {}", app_name, e);
                    continue;
                }
            };

            let is_minimized = window.is_minimized().unwrap_or(false);
            if is_minimized {
                debug!("Window {} ({}) is minimized, skipping", app_name, title);
                continue;
            }

            // DO NOT call window.is_focused() - it requires main thread
            // Focus detection is done by comparing PID with frontmost_pid

            let process_id = window.pid().unwrap_or(0) as i32;
            let x = window.x().unwrap_or(0);
            let y = window.y().unwrap_or(0);
            let width = window.width().unwrap_or(0);
            let height = window.height().unwrap_or(0);

            // Capture window image
            match window.capture_image() {
                Ok(image) => {
                    results.push(CapturedWindowData {
                        info: WindowInfo {
                            app_name,
                            title,
                            process_id,
                            x,
                            y,
                            width,
                            height,
                            is_minimized,
                        },
                        image,
                    });
                }
                Err(e) => {
                    debug!("Failed to capture window {} ({}): {}", app_name, title, e);
                }
            }
        }

        Ok((results, frontmost_pid))
    })
}
