use lopdf::content::{Content, Operation};
use lopdf::{Document, Object, Stream, StringFormat};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WatermarkConfig {
    pub name: String,
    pub text: String, // Template string
    pub font_size: f32,
    pub font_family: String, // "Helvetica", "Times-Roman", "Courier"
    pub color: String,       // "#RRGGBB"
    pub opacity: f32,
    pub position: String, // "TopLeft", ...
    pub rotation: f32,
    pub is_repeated: bool,
    pub spacing: String, // "Loose", "Normal", "Tight"
}

impl Default for WatermarkConfig {
    fn default() -> Self {
        Self {
            name: "Default".to_string(),
            text: "{}".to_string(),
            font_size: 48.0,
            font_family: "Helvetica".to_string(),
            color: "#808080".to_string(),
            opacity: 0.5,
            position: "Center".to_string(),
            rotation: 45.0,
            is_repeated: false,
            spacing: "Normal".to_string(),
        }
    }
}

// Helper: Resolve configurations directory
fn get_configs_dir() -> PathBuf {
    // Try to be smart: if in dev, use current dir; if packaged, use executable dir
    // For simplicity in this logical context, we check if "configs" exists in current dir,
    // otherwise we try to use the executable's parent.
    let current = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let local_configs = current.join("configs");

    if local_configs.exists() || std::env::var("TAURI_ENV_DEBUG").is_ok() {
        return local_configs;
    }

    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(parent) = exe_path.parent() {
            return parent.join("configs");
        }
    }

    local_configs // Fallback
}

#[tauri::command]
fn get_all_configs() -> Result<Vec<WatermarkConfig>, String> {
    let dir = get_configs_dir();
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

        // 1. Create Default Config
        let default_config = WatermarkConfig::default();
        let path1 = dir.join("Default.json");
        let json1 = serde_json::to_string_pretty(&default_config).map_err(|e| e.to_string())?;
        fs::write(path1, json1).map_err(|e| e.to_string())?;

        // 2. Create Confidential Config
        let confidential = WatermarkConfig {
            name: "Confidential".to_string(),
            text: "CONFIDENTIAL - {}".to_string(),
            font_size: 60.0,
            font_family: "Helvetica-Bold".to_string(),
            color: "#FF0000".to_string(),
            opacity: 0.3,
            position: "Center".to_string(),
            rotation: 45.0,
            is_repeated: true,
            spacing: "Normal".to_string(),
        };
        let path2 = dir.join("Confidential.json");
        let json2 = serde_json::to_string_pretty(&confidential).map_err(|e| e.to_string())?;
        fs::write(path2, json2).map_err(|e| e.to_string())?;
    }

    let mut configs = Vec::new();
    let entries = fs::read_dir(&dir).map_err(|e| e.to_string())?;

    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) == Some("json") {
            let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
            if let Ok(mut config) = serde_json::from_str::<WatermarkConfig>(&content) {
                // Ensure name matches filename just in case, or trust file
                if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                    config.name = stem.to_string();
                }
                configs.push(config);
            }
        }
    }

    // Sort by name if desired
    configs.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(configs)
}

#[tauri::command]
fn save_config(config: WatermarkConfig) -> Result<String, String> {
    let dir = get_configs_dir();
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }

    // Sanitize filename
    let safe_name: String = config
        .name
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
        .collect();

    let filename = if safe_name.is_empty() {
        "config".to_string()
    } else {
        safe_name
    };
    let path = dir.join(format!("{}.json", filename));

    let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())?;

    Ok("Success".to_string())
}

#[tauri::command]
fn delete_config(name: String) -> Result<String, String> {
    let dir = get_configs_dir();
    let safe_name: String = name
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    let path = dir.join(format!("{}.json", safe_name));

    if path.exists() {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok("Deleted".to_string())
}

#[tauri::command]
fn read_external_config(path: String) -> Result<WatermarkConfig, String> {
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let config = serde_json::from_str::<WatermarkConfig>(&content).map_err(|e| e.to_string())?;
    Ok(config)
}

// Parse hex color to (r, g, b) float 0.0-1.0
fn parse_color(hex: &str) -> (f32, f32, f32) {
    let hex = hex.trim_start_matches('#');
    let r = u8::from_str_radix(&hex[0..2], 16).unwrap_or(0) as f32 / 255.0;
    let g = u8::from_str_radix(&hex[2..4], 16).unwrap_or(0) as f32 / 255.0;
    let b = u8::from_str_radix(&hex[4..6], 16).unwrap_or(0) as f32 / 255.0;
    (r, g, b)
}

#[tauri::command]
fn add_watermark(
    input_path: String,
    user_text: String,
    config: WatermarkConfig,
) -> Result<String, String> {
    println!("Processing: {}", input_path);

    let path = Path::new(&input_path);
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or("Invalid filename")?;
    let parent = path.parent().unwrap_or(Path::new("."));
    let output_filename = format!("{}_marked.pdf", stem);
    let output_path = parent.join(output_filename);

    let mut doc = Document::load(&input_path).map_err(|e| e.to_string())?;

    // Prepare content text
    let final_text = config.text.replace("{}", &user_text);
    if final_text.trim().is_empty() {
        return Err("Watermark text is empty".to_string());
    }

    println!("Watermark text: {}", final_text);

    let (r, g, b) = parse_color(&config.color);
    let rad = config.rotation.to_radians();
    let cos_theta = rad.cos();
    let sin_theta = rad.sin();

    println!("Color: ({}, {}, {})", r, g, b);
    println!("Rotation: {}", config.rotation);
    println!("Cosine: {}, Sine: {}", cos_theta, sin_theta);

    for (page_id, object_id) in doc.get_pages() {
        // 1. Get MediaBox to calculate position
        // MediaBox is usually inherited, but lopdf tries to resolve it.
        // We'll simplisticly try to find it in the page object or assume A4/Letter if missing (fallback).
        let mut width = 595.0; // A4 width default
        let mut height = 842.0; // A4 height default

        println!("Page: {}", page_id);

        if let Ok(page_dict) = doc.get_object(object_id).and_then(|o| o.as_dict()) {
            if let Ok(media_box) = page_dict.get(b"MediaBox").and_then(|o| o.as_array()) {
                if media_box.len() >= 4 {
                    // [x1, y1, x2, y2]
                    // simplistic assumption: x1=0, y1=0 usually. width = x2-x1, height = y2-y1
                    let x1 = media_box[0].as_f32().unwrap_or(0.0);
                    let y1 = media_box[1].as_f32().unwrap_or(0.0);
                    let x2 = media_box[2].as_f32().unwrap_or(0.0);
                    let y2 = media_box[3].as_f32().unwrap_or(0.0);
                    width = (x2 - x1).abs();
                    height = (y2 - y1).abs();
                }
            }
        }

        println!("MediaBox: {}x{}", width, height);

        // Calculate Position
        // Simplistic anchor points
        let (cx, cy) = (width / 2.0, height / 2.0);
        let margin = 50.0;

        // We need coordinates for the TEXT origin.
        // Rotation happens around the text origin if we translate first.
        let mut x = cx;
        let mut y = cy;

        match config.position.as_str() {
            "TopLeft" => {
                x = margin;
                y = height - margin;
            }
            "TopCenter" => {
                x = cx;
                y = height - margin;
            }
            "TopRight" => {
                x = width - margin;
                y = height - margin;
            }
            "CenterLeft" => {
                x = margin;
                y = cy;
            }
            "Center" => {
                x = cx;
                y = cy;
            }
            "CenterRight" => {
                x = width - margin;
                y = cy;
            }
            "BottomLeft" => {
                x = margin;
                y = margin;
            }
            "BottomCenter" => {
                x = cx;
                y = margin;
            }
            "BottomRight" => {
                x = width - margin;
                y = margin;
            }
            _ => {}
        }

        // Construct Content Stream
        // q: Save state
        // /F1 12 Tf: Font
        // r g b rg: Color
        // a b c d e f cm: Transformation Matrix
        // a=cos, b=sin, c=-sin, d=cos, e=x, f=y

        let content_data = doc.get_page_content(object_id).unwrap_or(Vec::new());
        let mut content =
            Content::decode(&content_data).unwrap_or_else(|_| Content { operations: vec![] });

        // We use a separate block for the watermark to ensure it overlays correctly
        // IMPORTANT: To support rotation, we use the matrix 'cm'.
        // To center text properly with rotation, we usually need text metrics (width).
        // LOPDF doesn't compute text width. We will just pivot around the anchor.

        let mut ops = Vec::new();
        ops.push(Operation::new("q", vec![])); // Save graphics state

        // Set Color (RGB non-stroking)
        ops.push(Operation::new("rg", vec![r.into(), g.into(), b.into()]));

        // Set Font
        // Hardcoded generic font F1 mapping to Standard14 (handled usually by consumer or existing resource).
        // Since we don't have a Font Manager here, we assume the Page Resources has F1 or we add it?
        // Actually, previous code assumed "F1" existed or LOPDF creates it?
        // LOPDF doesn't auto-create resources.
        // Previous working code: Operation::new("Tf", vec!["F1".into(), 48.into()]),
        // If F1 is not defined in Page Resources, user might see nothing or error in Reader.
        // We will stick to "F1" and hope existing logic or previous simple example implies it worked or we need to add it.
        // *Correction*: To be safe, we should add F1 to Resources if we can.
        // But for this task, I'll follow previous pattern.

        // Transformation Matrix
        // If repeated, we loop. If single, we do once.

        let points = if config.is_repeated {
            // Generate grid of points
            let mut pts = Vec::new();
            let step_x = match config.spacing.as_str() {
                "Tight" => 200.0,
                "Loose" => 400.0,
                _ => 300.0,
            };
            let step_y = match config.spacing.as_str() {
                "Tight" => 200.0,
                "Loose" => 400.0,
                _ => 300.0,
            };

            let mut cur_y = 50.0;
            while cur_y < height {
                let mut cur_x = 50.0;
                while cur_x < width {
                    pts.push((cur_x, cur_y));
                    cur_x += step_x;
                }
                cur_y += step_y;
            }
            pts
        } else {
            vec![(x, y)]
        };

        ops.push(Operation::new("BT", vec![])); // Begin Text
        ops.push(Operation::new(
            "Tf",
            vec!["F1".into(), config.font_size.into()],
        ));

        for (px, py) in points {
            // Reset matrix for text object is tricky inside BT...ET in some readers if we use cm inside?
            // Usually cm is outside BT.
            // Let's use Td (Translate) and Tm (Text Matrix).
            // Tm a b c d e f

            ops.push(Operation::new(
                "Tm",
                vec![
                    cos_theta.into(),
                    sin_theta.into(),
                    (-sin_theta).into(),
                    cos_theta.into(),
                    px.into(),
                    py.into(),
                ],
            ));

            ops.push(Operation::new(
                "Tj",
                vec![Object::String(
                    final_text.as_bytes().to_vec(),
                    StringFormat::Literal,
                )],
            ));
        }

        ops.push(Operation::new("ET", vec![])); // End Text
        ops.push(Operation::new("Q", vec![])); // Restore graphics state

        // Append
        for op in ops {
            content.operations.push(op);
        }

        // Add Fonts to Resources! (Crucial fix if F1 is missing)
        // We need to ensure /Resources /Font /F1 -> /BaseFont /Helvetica

        // Correct approach: Add the new content stream as a new object, then update the page to reference it.
        // Note: This replaces all previous content streams with this single merged one.
        let stream_obj = Stream::new(lopdf::Dictionary::new(), content.encode().unwrap());
        let new_content_id = doc.add_object(stream_obj);

        if let Ok(page_dict) = doc.get_object_mut(object_id).and_then(|o| o.as_dict_mut()) {
            page_dict.set(b"Contents", Object::Reference(new_content_id));
        }

        // Check if F1 exists before borrowing mutably
        let has_f1 = doc
            .get_object(object_id)
            .and_then(|o| o.as_dict())
            .and_then(|d| d.get(b"Resources"))
            .and_then(|o| o.as_dict())
            .and_then(|d| d.get(b"Font"))
            .and_then(|o| o.as_dict())
            .map(|d| d.has(b"F1"))
            .unwrap_or(false);

        if !has_f1 {
            // Create Font Object
            let font_id = doc.add_object(lopdf::Dictionary::from_iter(vec![
                ("Type", "Font".into()),
                ("Subtype", "Type1".into()),
                ("BaseFont", config.font_family.as_str().into()),
            ]));

            if let Ok(mut page_dict) = doc.get_object_mut(object_id).and_then(|o| o.as_dict_mut()) {
                if !page_dict.has(b"Resources") {
                    page_dict.set(b"Resources", lopdf::Dictionary::new());
                }
                if let Ok(resources) = page_dict
                    .get_mut(b"Resources")
                    .and_then(|o| o.as_dict_mut())
                {
                    if !resources.has(b"Font") {
                        resources.set(b"Font", lopdf::Dictionary::new());
                    }
                    if let Ok(fonts) = resources.get_mut(b"Font").and_then(|o| o.as_dict_mut()) {
                        fonts.set(b"F1", Object::Reference(font_id));
                    }
                }
            }
        }
    }

    doc.save(&output_path).map_err(|e| e.to_string())?;
    Ok(format!("Saved to {}", output_path.display()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::DragDrop(event) = event {
                // ... existing drag drop logging
            }
        })
        .invoke_handler(tauri::generate_handler![
            add_watermark,
            get_all_configs,
            save_config,
            delete_config,
            read_external_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
