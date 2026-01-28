use anyhow::Result;
use image::DynamicImage;
use std::sync::Arc;
use tracing;

#[cfg(target_os = "macos")]
use crate::macos_capture;

#[cfg(not(target_os = "macos"))]
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

impl SafeMonitor {
    pub async fn capture_image(&self) -> Result<DynamicImage> {
        let monitor_id = self.monitor_id;

        let image = tokio::task::spawn_blocking(move || -> Result<DynamicImage> {
            #[cfg(target_os = "macos")]
            {
                let rgba_image = macos_capture::capture_monitor_image(monitor_id)
                    .map_err(|e| anyhow::anyhow!("Monitor capture failed: {}", e))?;
                Ok(DynamicImage::ImageRgba8(rgba_image))
            }

            #[cfg(not(target_os = "macos"))]
            {
                let monitor = Monitor::all()
                    .map_err(Error::from)?
                    .into_iter()
                    .find(|m| m.id().unwrap() == monitor_id)
                    .ok_or_else(|| anyhow::anyhow!("Monitor not found"))?;

                if monitor.width().unwrap() == 0 || monitor.height().unwrap() == 0 {
                    return Err(anyhow::anyhow!("Invalid monitor dimensions"));
                }

                let rgba_image = monitor.capture_image().map_err(Error::from)?;
                Ok(DynamicImage::ImageRgba8(rgba_image))
            }
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

/// List all monitors
pub async fn list_monitors() -> Vec<SafeMonitor> {
    tokio::task::spawn_blocking(|| {
        #[cfg(target_os = "macos")]
        {
            match macos_capture::get_all_monitors() {
                Ok(monitors) => monitors
                    .into_iter()
                    .map(|m| SafeMonitor {
                        monitor_id: m.id,
                        monitor_data: Arc::new(MonitorData {
                            width: m.width,
                            height: m.height,
                            name: m.name,
                            is_primary: m.is_primary,
                        }),
                    })
                    .collect(),
                Err(e) => {
                    tracing::error!("Failed to list monitors: {}", e);
                    Vec::new()
                }
            }
        }

        #[cfg(not(target_os = "macos"))]
        {
            Monitor::all()
                .unwrap()
                .iter()
                .map(|monitor| SafeMonitor {
                    monitor_id: monitor.id().unwrap(),
                    monitor_data: Arc::new(MonitorData {
                        width: monitor.width().unwrap(),
                        height: monitor.height().unwrap(),
                        name: monitor.name().unwrap().to_string(),
                        is_primary: monitor.is_primary().unwrap(),
                    }),
                })
                .collect()
        }
    })
    .await
    .unwrap()
}

/// Get the default (first) monitor
pub async fn get_default_monitor() -> SafeMonitor {
    let monitors = list_monitors().await;
    monitors.into_iter().next().expect("No monitors found")
}

/// Get a monitor by ID
pub async fn get_monitor_by_id(id: u32) -> Option<SafeMonitor> {
    tokio::task::spawn_blocking(move || {
        #[cfg(target_os = "macos")]
        {
            match macos_capture::get_all_monitors() {
                Ok(monitors) => {
                    let monitor_count = monitors.len();
                    let monitor_ids: Vec<u32> = monitors.iter().map(|m| m.id).collect();

                    tracing::debug!(
                        "Found {} monitors with IDs: {:?}",
                        monitor_count,
                        monitor_ids
                    );

                    monitors.into_iter().find(|m| m.id == id).map(|m| SafeMonitor {
                        monitor_id: m.id,
                        monitor_data: Arc::new(MonitorData {
                            width: m.width,
                            height: m.height,
                            name: m.name,
                            is_primary: m.is_primary,
                        }),
                    })
                }
                Err(e) => {
                    tracing::error!("Failed to list monitors: {}", e);
                    None
                }
            }
        }

        #[cfg(not(target_os = "macos"))]
        {
            match Monitor::all() {
                Ok(monitors) => {
                    let monitor_count = monitors.len();
                    let monitor_ids: Vec<u32> = monitors.iter().map(|m| m.id().unwrap()).collect();

                    tracing::debug!(
                        "Found {} monitors with IDs: {:?}",
                        monitor_count,
                        monitor_ids
                    );

                    monitors.iter().find(|m| m.id().unwrap() == id).map(|monitor| {
                        SafeMonitor {
                            monitor_id: monitor.id().unwrap(),
                            monitor_data: Arc::new(MonitorData {
                                width: monitor.width().unwrap(),
                                height: monitor.height().unwrap(),
                                name: monitor.name().unwrap().to_string(),
                                is_primary: monitor.is_primary().unwrap(),
                            }),
                        }
                    })
                }
                Err(e) => {
                    tracing::error!("Failed to list monitors: {}", e);
                    None
                }
            }
        }
    })
    .await
    .unwrap_or_else(|e| {
        tracing::error!("Task to get monitor by ID {} panicked: {}", id, e);
        None
    })
}
