use futures::{SinkExt, StreamExt};
use once_cell::sync::Lazy;
use parking_lot::RwLock;
use rosc::{OscMessage, OscPacket, OscType};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::net::UdpSocket;
use std::sync::Arc;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconEvent},
    Manager, Runtime,
};
use tokio::sync::broadcast;
use warp::ws::{Message, WebSocket};
use warp::Filter;

const HTTP_PORT: u16 = 3000;
const OSC_PORT: u16 = 8000;

#[derive(Clone, Serialize, Deserialize, Default)]
pub struct CueState {
    #[serde(rename = "sequenceName")]
    sequence_name: String,
    #[serde(rename = "cueNumber")]
    cue_number: String,
    #[serde(rename = "cueName")]
    cue_name: String,
    progress: f64,
    #[serde(rename = "isActive")]
    is_active: bool,
    #[serde(rename = "lastUpdate")]
    last_update: Option<String>,
    connected: bool,
}

#[derive(Clone, Serialize)]
pub struct OscLogEntry {
    timestamp: String,
    address: String,
    args: Vec<OscArg>,
}

#[derive(Clone, Serialize)]
pub struct OscArg {
    #[serde(rename = "type")]
    arg_type: String,
    value: serde_json::Value,
}

#[derive(Clone, Serialize)]
pub struct WsMessage {
    #[serde(rename = "type")]
    msg_type: String,
    data: serde_json::Value,
}

// Global state
static STATE: Lazy<Arc<RwLock<CueState>>> = Lazy::new(|| {
    Arc::new(RwLock::new(CueState {
        cue_number: "--".to_string(),
        ..Default::default()
    }))
});

static OSC_LOG: Lazy<Arc<RwLock<VecDeque<OscLogEntry>>>> =
    Lazy::new(|| Arc::new(RwLock::new(VecDeque::with_capacity(100))));

static BROADCAST_TX: Lazy<broadcast::Sender<WsMessage>> = Lazy::new(|| {
    let (tx, _) = broadcast::channel(100);
    tx
});

fn get_local_ip() -> String {
    local_ip_address::local_ip()
        .map(|ip| ip.to_string())
        .unwrap_or_else(|_| "Unknown".to_string())
}

#[tauri::command]
fn get_network_info() -> serde_json::Value {
    serde_json::json!({
        "ips": [{ "address": get_local_ip(), "interface": "en0" }],
        "httpPort": HTTP_PORT,
        "oscPort": OSC_PORT
    })
}

#[tauri::command]
fn get_osc_status() -> serde_json::Value {
    let state = STATE.read();
    serde_json::json!({
        "connected": state.connected,
        "lastUpdate": state.last_update
    })
}

#[tauri::command]
fn open_url(url: String) {
    let _ = open::that(url);
}

fn parse_osc_message(msg: &OscMessage) -> Option<()> {
    let now = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);

    // Log the message
    let args: Vec<OscArg> = msg
        .args
        .iter()
        .map(|arg| match arg {
            OscType::Int(i) => OscArg {
                arg_type: "i".to_string(),
                value: serde_json::json!(i),
            },
            OscType::Float(f) => OscArg {
                arg_type: "f".to_string(),
                value: serde_json::json!(f),
            },
            OscType::String(s) => OscArg {
                arg_type: "s".to_string(),
                value: serde_json::json!(s),
            },
            OscType::Double(d) => OscArg {
                arg_type: "d".to_string(),
                value: serde_json::json!(d),
            },
            _ => OscArg {
                arg_type: "?".to_string(),
                value: serde_json::json!("unknown"),
            },
        })
        .collect();

    let log_entry = OscLogEntry {
        timestamp: now.clone(),
        address: msg.addr.clone(),
        args: args.clone(),
    };

    {
        let mut log = OSC_LOG.write();
        log.push_front(log_entry.clone());
        if log.len() > 100 {
            log.pop_back();
        }
    }

    // Broadcast OSC log
    let _ = BROADCAST_TX.send(WsMessage {
        msg_type: "oscLog".to_string(),
        data: serde_json::to_value(&log_entry).unwrap(),
    });

    // Update state
    {
        let mut state = STATE.write();
        state.connected = true;
        state.last_update = Some(now);

        if !msg.args.is_empty() {
            if let OscType::String(action) = &msg.args[0] {
                if action == "Go+" || action == "Go-" || action == "Goto" || action == "Top" {
                    if msg.args.len() > 2 {
                        if let OscType::String(cue_name) = &msg.args[2] {
                            state.cue_name = cue_name.clone();

                            // Parse "SequenceName CueNum CueName" format
                            let re = regex::Regex::new(r"^(.+?)\s+(\d+(?:\.\d+)?)\s+(.+)$").ok()?;
                            if let Some(caps) = re.captures(cue_name) {
                                state.sequence_name = caps.get(1)?.as_str().to_string();
                                state.cue_number = caps.get(2)?.as_str().to_string();
                            }
                        }
                    }

                    if msg.args.len() > 1 && state.cue_number == "--" {
                        match &msg.args[1] {
                            OscType::Int(i) => state.cue_number = i.to_string(),
                            OscType::Float(f) => state.cue_number = f.to_string(),
                            _ => {}
                        }
                    }

                    state.is_active = true;
                } else if action == "FaderMaster" && msg.args.len() > 2 {
                    if let OscType::Float(f) = &msg.args[2] {
                        state.progress = (*f as f64) * 100.0;
                    }
                }
            }
        }
    }

    // Broadcast state update
    let state = STATE.read().clone();
    let _ = BROADCAST_TX.send(WsMessage {
        msg_type: "cueUpdate".to_string(),
        data: serde_json::to_value(&state).unwrap(),
    });

    Some(())
}

fn start_osc_server() {
    std::thread::spawn(move || {
        let socket = UdpSocket::bind(format!("0.0.0.0:{}", OSC_PORT)).expect("Failed to bind OSC socket");
        println!("OSC listening on port {}", OSC_PORT);

        let mut buf = [0u8; 4096];
        loop {
            match socket.recv_from(&mut buf) {
                Ok((size, _addr)) => {
                    if let Ok((_, packet)) = rosc::decoder::decode_udp(&buf[..size]) {
                        match packet {
                            OscPacket::Message(msg) => {
                                parse_osc_message(&msg);
                            }
                            OscPacket::Bundle(bundle) => {
                                for packet in bundle.content {
                                    if let OscPacket::Message(msg) = packet {
                                        parse_osc_message(&msg);
                                    }
                                }
                            }
                        }
                    }
                }
                Err(e) => eprintln!("OSC receive error: {}", e),
            }
        }
    });
}

async fn handle_websocket(ws: WebSocket) {
    let (mut tx, mut rx) = ws.split();

    // Send initial state
    let state = STATE.read().clone();
    let init_msg = WsMessage {
        msg_type: "state".to_string(),
        data: serde_json::to_value(&state).unwrap(),
    };
    if let Ok(json) = serde_json::to_string(&init_msg) {
        let _ = tx.send(Message::text(json)).await;
    }

    // Subscribe to broadcasts
    let mut broadcast_rx = BROADCAST_TX.subscribe();

    // Handle broadcast messages
    let send_task = tokio::spawn(async move {
        while let Ok(msg) = broadcast_rx.recv().await {
            if let Ok(json) = serde_json::to_string(&msg) {
                if tx.send(Message::text(json)).await.is_err() {
                    break;
                }
            }
        }
    });

    // Handle incoming messages (just keep connection alive)
    while let Some(result) = rx.next().await {
        if result.is_err() {
            break;
        }
    }

    send_task.abort();
}

async fn run_web_server() {
    // Serve web display (the cue viewer for browsers)
    let index = warp::path::end().map(|| {
        warp::reply::html(include_str!("../../src/web-display.html"))
    });

    // Serve osc-log.html
    let osc_log_page = warp::path("osc-log").map(|| {
        warp::reply::html(include_str!("../../src/osc-log.html"))
    });

    // API: get state
    let api_state = warp::path!("api" / "state").map(|| {
        let state = STATE.read().clone();
        warp::reply::json(&state)
    });

    // API: get OSC log
    let api_osc_log = warp::path!("api" / "osc-log").map(|| {
        let log: Vec<OscLogEntry> = OSC_LOG.read().iter().cloned().collect();
        warp::reply::json(&log)
    });

    // WebSocket endpoint
    let ws = warp::path("ws")
        .and(warp::ws())
        .map(|ws: warp::ws::Ws| ws.on_upgrade(handle_websocket));

    let routes = index
        .or(osc_log_page)
        .or(api_state)
        .or(api_osc_log)
        .or(ws);

    println!("Web server running at http://localhost:{}", HTTP_PORT);
    warp::serve(routes).run(([0, 0, 0, 0], HTTP_PORT)).await;
}

pub fn setup_tray<R: Runtime>(app: &tauri::App<R>) -> Result<(), Box<dyn std::error::Error>> {
    let quit = MenuItem::with_id(app, "quit", "Quit MA3 Cue Display", true, None::<&str>)?;
    let show = MenuItem::with_id(app, "show", "Show Launcher", true, None::<&str>)?;
    let open_browser = MenuItem::with_id(app, "open_browser", "Open Display in Browser", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&open_browser, &show, &quit])?;

    // Get the existing tray icon created by tauri.conf.json and configure it
    if let Some(tray) = app.tray_by_id("main") {
        tray.set_menu(Some(menu))?;
        tray.set_tooltip(Some("MA3 Cue Display"))?;
        tray.on_menu_event(move |app, event| match event.id.as_ref() {
            "quit" => {
                app.exit(0);
            }
            "show" => {
                if let Some(window) = app.get_webview_window("launcher") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "open_browser" => {
                let _ = open::that(format!("http://localhost:{}", HTTP_PORT));
            }
            _ => {}
        });
        tray.on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("launcher") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        });
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Start servers
    start_osc_server();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![get_network_info, get_osc_status, open_url])
        .setup(|app| {
            // Start web server in separate thread with its own tokio runtime
            std::thread::spawn(|| {
                let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
                rt.block_on(async {
                    run_web_server().await;
                });
            });

            // Setup tray
            setup_tray(app)?;

            // Hide dock icon on macOS
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Hide window instead of closing
                window.hide().unwrap();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
