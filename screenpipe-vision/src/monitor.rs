use anyhow::{Error, Result};
use image::DynamicImage;
use std::sync::Arc;
use tracing;
use xcap::Monitor;

#[derive(Clone)]
pub struct SafeMonitor {
    monitor_id: u32,
    monitor_data: Arc<MonitorData>,
}

#[derive(Clone)]
pub struct MonitorData {
    pub width: u32,
    pub height: u32,
    pub name: String,
    pub is_primary: bool,
}

/// On macOS, xcap uses AppKit APIs (NSScreen) that MUST be called from the main thread.
/// The xcap library uses `MainThreadMarker::new_unchecked()` which lies to the type system
/// about being on the main thread. When called from tokio worker threads or std::thread::spawn,
/// this causes a segfault in the Objective-C runtime (lookUpImpOrForward crash at address 0x0).
///
/// This module provides safe wrappers that dispatch all xcap calls to the main thread on macOS.
#[cfg(target_os = "macos")]
mod macos_main_thread {
    use super::*;
    use dispatch::Queue;
    use std::sync::OnceLock;

    extern "C" {
        /// Returns non-zero if the current thread is the main thread.
        fn pthread_main_np() -> libc::c_int;
    }

    /// Check if the current thread is the main thread
    fn is_main_thread() -> bool {
        unsafe { pthread_main_np() != 0 }
    }

    /// Get the main dispatch queue for macOS
    fn main_queue() -> &'static Queue {
        static MAIN_QUEUE: OnceLock<Queue> = OnceLock::new();
        MAIN_QUEUE.get_or_init(Queue::main)
    }

    /// Execute a closure on the main thread synchronously.
    /// This is required for xcap's Monitor operations on macOS.
    pub fn run_on_main_thread<F, R>(f: F) -> R
    where
        F: FnOnce() -> R + Send,
        R: Send,
    {
        // If we're already on the main thread, just run directly
        if is_main_thread() {
            return f();
        }

        // Otherwise dispatch to main thread and wait for result
        main_queue().exec_sync(f)
    }

    /// Capture image from a monitor by ID (main thread safe)
    pub fn capture_image_sync(monitor_id: u32) -> Result<image::RgbaImage> {
        run_on_main_thread(move || {
            let monitor = Monitor::all()
                .map_err(Error::from)?
                .into_iter()
                .find(|m| m.id().unwrap() == monitor_id)
                .ok_or_else(|| anyhow::anyhow!("Monitor not found"))?;

            if monitor.width().unwrap() == 0 || monitor.height().unwrap() == 0 {
                return Err(anyhow::anyhow!("Invalid monitor dimensions"));
            }

            monitor.capture_image().map_err(Error::from)
        })
    }
}

#[cfg(not(target_os = "macos"))]
mod macos_main_thread {
    use super::*;

    /// On non-macOS platforms, just run directly (no main thread requirement)
    pub fn run_on_main_thread<F, R>(f: F) -> R
    where
        F: FnOnce() -> R + Send,
        R: Send,
    {
        f()
    }

    /// Capture image from a monitor by ID (no special handling needed on non-macOS)
    pub fn capture_image_sync(monitor_id: u32) -> Result<image::RgbaImage> {
        let monitor = Monitor::all()
            .map_err(Error::from)?
            .into_iter()
            .find(|m| m.id().unwrap() == monitor_id)
            .ok_or_else(|| anyhow::anyhow!("Monitor not found"))?;

        if monitor.width().unwrap() == 0 || monitor.height().unwrap() == 0 {
            return Err(anyhow::anyhow!("Invalid monitor dimensions"));
        }

        monitor.capture_image().map_err(Error::from)
    }
}

use macos_main_thread::{capture_image_sync, run_on_main_thread};

impl SafeMonitor {
    pub fn new(monitor: Monitor) -> Self {
        let monitor_id = monitor.id().unwrap();
        let monitor_data = Arc::new(MonitorData {
            width: monitor.width().unwrap(),
            height: monitor.height().unwrap(),
            name: monitor.name().unwrap().to_string(),
            is_primary: monitor.is_primary().unwrap(),
        });

        Self {
            monitor_id,
            monitor_data,
        }
    }

    pub async fn capture_image(&self) -> Result<DynamicImage> {
        let monitor_id = self.monitor_id;

        // Use tokio's spawn_blocking to not block the async runtime,
        // but inside we dispatch to main thread for the actual xcap call
        let image = tokio::task::spawn_blocking(move || -> Result<DynamicImage> {
            let rgba_image = capture_image_sync(monitor_id)?;
            Ok(DynamicImage::ImageRgba8(rgba_image))
        })
        .await
        .map_err(|e| anyhow::anyhow!("Task panicked: {}", e))??;

        Ok(image)
    }

    pub fn id(&self) -> u32 {
        self.monitor_id
    }

    pub fn dimensions(&self) -> (u32, u32) {
        (self.monitor_data.width, self.monitor_data.height)
    }

    pub fn name(&self) -> &str {
        &self.monitor_data.name
    }

    pub fn width(&self) -> u32 {
        self.monitor_data.width
    }

    pub fn height(&self) -> u32 {
        self.monitor_data.height
    }

    pub fn is_primary(&self) -> bool {
        self.monitor_data.is_primary
    }

    pub fn get_info(&self) -> MonitorData {
        (*self.monitor_data).clone()
    }
}

pub async fn list_monitors() -> Vec<SafeMonitor> {
    tokio::task::spawn_blocking(|| {
        // Dispatch to main thread on macOS
        run_on_main_thread(|| {
            Monitor::all()
                .unwrap()
                .into_iter()
                .map(SafeMonitor::new)
                .collect()
        })
    })
    .await
    .unwrap()
}

pub async fn get_default_monitor() -> SafeMonitor {
    tokio::task::spawn_blocking(|| {
        // Dispatch to main thread on macOS
        run_on_main_thread(|| {
            SafeMonitor::new(Monitor::all().unwrap().first().unwrap().clone())
        })
    })
    .await
    .unwrap()
}

pub async fn get_monitor_by_id(id: u32) -> Option<SafeMonitor> {
    tokio::task::spawn_blocking(move || {
        // Dispatch to main thread on macOS
        run_on_main_thread(move || match Monitor::all() {
            Ok(monitors) => {
                let monitor_count = monitors.len();
                let monitor_ids: Vec<u32> = monitors.iter().map(|m| m.id().unwrap()).collect();

                tracing::debug!(
                    "Found {} monitors with IDs: {:?}",
                    monitor_count,
                    monitor_ids
                );

                monitors
                    .into_iter()
                    .find(|m| m.id().unwrap() == id)
                    .map(SafeMonitor::new)
            }
            Err(e) => {
                tracing::error!("Failed to list monitors: {}", e);
                None
            }
        })
    })
    .await
    .unwrap_or_else(|e| {
        tracing::error!("Task to get monitor by ID {} panicked: {}", id, e);
        None
    })
}
