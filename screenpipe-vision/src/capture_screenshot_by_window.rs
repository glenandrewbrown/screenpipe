use image::DynamicImage;
use once_cell::sync::Lazy;
use std::collections::HashSet;
use std::error::Error;
use std::fmt;
use tracing::debug;

#[cfg(target_os = "macos")]
use crate::macos_capture;

#[cfg(not(target_os = "macos"))]
use xcap::{Window, XCapError};

use crate::browser_utils::create_url_detector;
use crate::monitor::SafeMonitor;

const BROWSER_NAMES: [&str; 9] = [
    "chrome", "firefox", "safari", "edge", "brave", "arc", "chromium", "vivaldi", "opera",
];

#[derive(Debug)]
enum CaptureError {
    NoWindows,
    #[cfg(target_os = "macos")]
    XCapError(xcap::XCapError),
    #[cfg(not(target_os = "macos"))]
    XCapError(XCapError),
}

impl fmt::Display for CaptureError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            CaptureError::NoWindows => write!(f, "No windows found"),
            CaptureError::XCapError(e) => write!(f, "XCap error: {}", e),
        }
    }
}

impl Error for CaptureError {}

#[cfg(target_os = "macos")]
impl From<xcap::XCapError> for CaptureError {
    fn from(error: xcap::XCapError) -> Self {
        debug!("XCap error occurred: {}", error);
        CaptureError::XCapError(error)
    }
}

#[cfg(not(target_os = "macos"))]
impl From<XCapError> for CaptureError {
    fn from(error: XCapError) -> Self {
        debug!("XCap error occurred: {}", error);
        CaptureError::XCapError(error)
    }
}

// Platform specific skip lists
#[cfg(target_os = "macos")]
static SKIP_APPS: Lazy<HashSet<&'static str>> = Lazy::new(|| {
    HashSet::from([
        "Window Server",
        "SystemUIServer",
        "ControlCenter",
        "Dock",
        "NotificationCenter",
        "loginwindow",
        "WindowManager",
        "Contexts",
        "Screenshot",
        // Apps with overlay windows that frequently fail capture
        "TheBoringNotch",
        "Grammarly Desktop",
    ])
});

#[cfg(target_os = "windows")]
static SKIP_APPS: Lazy<HashSet<&'static str>> = Lazy::new(|| {
    HashSet::from([
        "Windows Shell Experience Host",
        "Microsoft Text Input Application",
        "Windows Explorer",
        "Program Manager",
        "Microsoft Store",
        "Search",
        "TaskBar",
    ])
});

#[cfg(target_os = "linux")]
static SKIP_APPS: Lazy<HashSet<&'static str>> = Lazy::new(|| {
    HashSet::from([
        "Gnome-shell",
        "Plasma",
        "Xfdesktop",
        "Polybar",
        "i3bar",
        "Plank",
        "Dock",
    ])
});

#[cfg(target_os = "macos")]
static SKIP_TITLES: Lazy<HashSet<&'static str>> = Lazy::new(|| {
    HashSet::from([
        "Item-0",
        "App Icon Window",
        "Dock",
        "NowPlaying",
        "FocusModes",
        "Shortcuts",
        "AudioVideoModule",
        "Clock",
        "WiFi",
        "Battery",
        "BentoBox",
        "Menu Bar",
        "Notification Center",
        "Control Center",
        "Spotlight",
        "Mission Control",
        "Desktop",
        "Screen Sharing",
        "Touch Bar",
        "Status Bar",
        "Menu Extra",
        "System Settings",
    ])
});

#[cfg(target_os = "windows")]
static SKIP_TITLES: Lazy<HashSet<&'static str>> = Lazy::new(|| {
    HashSet::from([
        "Program Manager",
        "Windows Input Experience",
        "Microsoft Text Input Application",
        "Task View",
        "Start",
        "System Tray",
        "Notification Area",
        "Action Center",
        "Task Bar",
        "Desktop",
    ])
});

#[cfg(target_os = "linux")]
static SKIP_TITLES: Lazy<HashSet<&'static str>> = Lazy::new(|| {
    HashSet::from([
        "Desktop",
        "Panel",
        "Top Bar",
        "Status Bar",
        "Dock",
        "Dashboard",
        "Activities",
        "System Tray",
        "Notification Area",
    ])
});

#[derive(Debug, Clone)]
pub struct CapturedWindow {
    pub image: DynamicImage,
    pub app_name: String,
    pub window_name: String,
    pub process_id: i32,
    pub is_focused: bool,
    /// Browser URL captured atomically with the screenshot to prevent timing mismatches
    pub browser_url: Option<String>,
    /// Window position and size on screen for coordinate transformation
    pub window_x: i32,
    pub window_y: i32,
    pub window_width: u32,
    pub window_height: u32,
}

pub struct WindowFilters {
    ignore_set: HashSet<String>,
    include_set: HashSet<String>,
}

impl WindowFilters {
    pub fn new(ignore_list: &[String], include_list: &[String]) -> Self {
        Self {
            ignore_set: ignore_list.iter().map(|s| s.to_lowercase()).collect(),
            include_set: include_list.iter().map(|s| s.to_lowercase()).collect(),
        }
    }

    // O(n) - we could figure out a better way to do this
    pub fn is_valid(&self, app_name: &str, title: &str) -> bool {
        let app_name_lower = app_name.to_lowercase();
        let title_lower = title.to_lowercase();

        // If include list is empty, we're done
        if self.include_set.is_empty() {
            return true;
        }

        // Check include list
        if self
            .include_set
            .iter()
            .any(|include| app_name_lower.contains(include) || title_lower.contains(include))
        {
            return true;
        }

        // Check ignore list first (usually smaller)
        if !self.ignore_set.is_empty()
            && self
                .ignore_set
                .iter()
                .any(|ignore| app_name_lower.contains(ignore) || title_lower.contains(ignore))
        {
            return false;
        }

        false
    }
}

/// Check if running on macOS Intel (x86_64)
/// Window capture causes SIGSEGV on macOS Intel due to xcap library threading issues
#[cfg(target_os = "macos")]
fn is_macos_intel() -> bool {
    #[cfg(target_arch = "x86_64")]
    {
        true
    }
    #[cfg(not(target_arch = "x86_64"))]
    {
        false
    }
}

#[cfg(target_os = "macos")]
pub async fn capture_all_visible_windows(
    monitor: &SafeMonitor,
    window_filters: &WindowFilters,
    capture_unfocused_windows: bool,
) -> Result<Vec<CapturedWindow>, Box<dyn Error>> {
    // On macOS Intel, window capture causes SIGSEGV due to xcap library threading issues
    // with the Objective-C runtime (lookUpImpOrForward crash). Return empty to skip
    // window-level capture and only use monitor capture.
    if is_macos_intel() {
        debug!("Skipping window capture on macOS Intel due to xcap threading issues");
        return Ok(Vec::new());
    }

    let mut all_captured_images = Vec::new();

    // Use the centralized capture module to get windows
    let (windows_data, frontmost_pid) = macos_capture::capture_all_windows()?;

    if windows_data.is_empty() {
        return Err(Box::new(CaptureError::NoWindows));
    }

    // Process the captured data
    for window_data in windows_data {
        let app_name = window_data.info.app_name;
        let window_name = window_data.info.title;
        let process_id = window_data.info.process_id;
        let buffer = window_data.image;
        let window_x = window_data.info.x;
        let window_y = window_data.info.y;
        let window_width = window_data.info.width;
        let window_height = window_data.info.height;

        // Determine focus by comparing PID with frontmost app
        let is_focused = frontmost_pid.map_or(false, |fpid| process_id == fpid);

        // Convert to DynamicImage
        let image = DynamicImage::ImageRgba8(
            image::ImageBuffer::from_raw(buffer.width(), buffer.height(), buffer.into_raw())
                .unwrap(),
        );

        // Apply filters
        // Note: Empty window_name check fixes frame-window mismatch bug where apps like Arc
        // have internal windows with empty titles that create duplicate DB records
        let is_valid = !SKIP_APPS.contains(app_name.as_str())
            && !window_name.is_empty()
            && !SKIP_TITLES.contains(window_name.as_str())
            && (capture_unfocused_windows || (is_focused && monitor.id() == monitor.id()))
            && window_filters.is_valid(&app_name, &window_name);

        if is_valid {
            // Fetch browser URL atomically with screenshot for focused browser windows
            // This prevents timing mismatches where URL is fetched after navigation
            let browser_url = if is_focused
                && BROWSER_NAMES
                    .iter()
                    .any(|&browser| app_name.to_lowercase().contains(browser))
            {
                let detector = create_url_detector();
                match detector.get_active_url(&app_name, process_id, &window_name) {
                    Ok(url) => url,
                    Err(e) => {
                        debug!("Failed to get browser URL for {}: {}", app_name, e);
                        None
                    }
                }
            } else {
                None
            };

            all_captured_images.push(CapturedWindow {
                image,
                app_name,
                window_name,
                process_id,
                is_focused,
                browser_url,
                window_x,
                window_y,
                window_width,
                window_height,
            });
        }
    }

    Ok(all_captured_images)
}

#[cfg(not(target_os = "macos"))]
pub async fn capture_all_visible_windows(
    monitor: &SafeMonitor,
    window_filters: &WindowFilters,
    capture_unfocused_windows: bool,
) -> Result<Vec<CapturedWindow>, Box<dyn Error>> {
    let mut all_captured_images = Vec::new();

    let windows = Window::all()?;

    if windows.is_empty() {
        return Err(Box::new(CaptureError::NoWindows));
    }

    for window in windows {
        let app_name = match window.app_name() {
            Ok(name) => name.to_string(),
            Err(e) => {
                debug!("Failed to get app_name for window: {}", e);
                continue;
            }
        };

        let window_name = match window.title() {
            Ok(title) => title.to_string(),
            Err(e) => {
                debug!("Failed to get title for window {}: {}", app_name, e);
                continue;
            }
        };

        match window.is_minimized() {
            Ok(is_minimized) => {
                if is_minimized {
                    debug!("Window {} ({}) is_minimized", app_name, window_name);
                    continue;
                }
            }
            Err(e) => {
                debug!("Failed to get is_minimized for window {}: {}", app_name, e);
            }
        };

        let is_focused = match window.is_focused() {
            Ok(focused) => focused,
            Err(e) => {
                debug!(
                    "Failed to get focus state for window {} ({}): {}",
                    app_name, window_name, e
                );
                continue;
            }
        };

        let process_id = match window.pid() {
            Ok(pid) => pid as i32,
            Err(e) => {
                debug!(
                    "Failed to get process ID for window {} ({}): {}",
                    app_name, window_name, e
                );
                -1
            }
        };

        let (window_x, window_y, window_width, window_height) = (
            window.x().unwrap_or(0),
            window.y().unwrap_or(0),
            window.width().unwrap_or(0),
            window.height().unwrap_or(0),
        );

        // Apply filters
        let is_valid = !SKIP_APPS.contains(app_name.as_str())
            && !window_name.is_empty()
            && !SKIP_TITLES.contains(window_name.as_str())
            && (capture_unfocused_windows || (is_focused && monitor.id() == monitor.id()))
            && window_filters.is_valid(&app_name, &window_name);

        if is_valid {
            match window.capture_image() {
                Ok(buffer) => {
                    let image = DynamicImage::ImageRgba8(
                        image::ImageBuffer::from_raw(
                            buffer.width(),
                            buffer.height(),
                            buffer.into_raw(),
                        )
                        .unwrap(),
                    );

                    // Fetch browser URL for focused browser windows
                    let browser_url = if is_focused
                        && BROWSER_NAMES
                            .iter()
                            .any(|&browser| app_name.to_lowercase().contains(browser))
                    {
                        let detector = create_url_detector();
                        match detector.get_active_url(&app_name, process_id, &window_name) {
                            Ok(url) => url,
                            Err(e) => {
                                debug!("Failed to get browser URL for {}: {}", app_name, e);
                                None
                            }
                        }
                    } else {
                        None
                    };

                    all_captured_images.push(CapturedWindow {
                        image,
                        app_name,
                        window_name,
                        process_id,
                        is_focused,
                        browser_url,
                        window_x,
                        window_y,
                        window_width,
                        window_height,
                    });
                }
                Err(e) => {
                    debug!(
                        "Failed to capture image for window {} ({}): {}",
                        app_name, window_name, e
                    );
                }
            }
        }
    }

    Ok(all_captured_images)
}
