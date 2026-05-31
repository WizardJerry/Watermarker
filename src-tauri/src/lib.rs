use lopdf::content::{Content, Operation};
use lopdf::{Dictionary, Document, Object, ObjectId, Stream, StringFormat};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

const WATERMARK_FONT_RESOURCE: &str = "WMF1";
const WATERMARK_GRAPHICS_STATE_RESOURCE: &str = "WMGS1";
const MAX_REPEATED_AXIS_POINTS: usize = 25;

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
    #[serde(default)]
    pub export_path: String, // "" = Same as source, or absolute path
    #[serde(default)]
    pub export_suffix: String, // e.g. "_marked_{}"
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
            export_path: "".to_string(),
            export_suffix: "_marked".to_string(),
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
            export_path: "".to_string(),
            export_suffix: "_CONFIDENTIAL".to_string(),
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

// Character widths for Helvetica Standard 14 at 1000 units
const HELVETICA_WIDTHS: [u16; 128] = [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
    556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
    611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
    667, 611, 278, 278, 278, 469, 556, 222, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
    222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
    0,
];

// Character widths for Times-Roman Standard 14 at 1000 units
const TIMES_ROMAN_WIDTHS: [u16; 128] = [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    250, 333, 408, 500, 500, 833, 778, 180, 333, 333, 500, 564, 250, 333, 250, 278, 500, 500, 500,
    500, 500, 500, 500, 500, 500, 500, 278, 278, 564, 564, 564, 444, 921, 722, 667, 667, 722, 611,
    556, 722, 722, 333, 389, 722, 611, 889, 722, 722, 556, 722, 667, 556, 611, 722, 722, 944, 722,
    722, 611, 333, 278, 333, 469, 500, 250, 444, 500, 444, 500, 444, 333, 500, 500, 278, 278, 500,
    278, 778, 500, 500, 500, 500, 333, 389, 278, 500, 500, 722, 500, 500, 444, 480, 200, 480, 541,
    0,
];

// Estimate text width using font character width tables
fn estimate_text_width(text: &str, font: &str, size: f32) -> f32 {
    let widths = if font.starts_with("Times") {
        &TIMES_ROMAN_WIDTHS
    } else if font.starts_with("Courier") {
        // Courier is monospace (600 units)
        return text.chars().count() as f32 * size * 0.60;
    } else {
        &HELVETICA_WIDTHS
    };

    let mut total_width = 0.0;
    for c in text.chars() {
        let char_code = c as usize;
        let char_width = if char_code < 128 {
            widths[char_code] as f32
        } else {
            // Fallback for non-ASCII: use a generic average width for proportional fonts
            600.0
        };
        total_width += char_width;
    }

    (total_width / 1000.0) * size
}

fn repeated_row_gap_ratio(spacing: &str) -> f32 {
    match spacing {
        "Tight" => -0.25,
        "Loose" => 0.70,
        _ => 0.25,
    }
}

fn repeated_column_gap_ratio(spacing: &str) -> f32 {
    match spacing {
        "Tight" => 0.12,
        "Loose" => 0.45,
        _ => 0.25,
    }
}

fn fit_centered_axis_step(
    page_extent: f32,
    footprint_extent: f32,
    target_step: f32,
    min_footprint_factor: f32,
) -> f32 {
    let extent = page_extent.max(1.0);
    let footprint = footprint_extent.max(1.0);
    let minimum_step = footprint * min_footprint_factor;
    let target = target_step.max(minimum_step);
    let radius_with_bleed = (extent / 2.0) + footprint;
    let rings = (radius_with_bleed / target).round().max(1.0);

    (radius_with_bleed / rings).max(minimum_step)
}

fn centered_axis_offsets(page_extent: f32, footprint_extent: f32, step: f32) -> Vec<f32> {
    let center = page_extent / 2.0;
    let bleed = footprint_extent.max(1.0);
    let mut offsets = vec![0.0];
    let mut ring = 1;

    while offsets.len() < MAX_REPEATED_AXIS_POINTS {
        let distance = step * ring as f32;
        let mut added = false;

        if center - distance >= -bleed {
            offsets.push(-distance);
            added = true;
        }

        if offsets.len() < MAX_REPEATED_AXIS_POINTS && center + distance <= page_extent + bleed {
            offsets.push(distance);
            added = true;
        }

        if !added {
            break;
        }

        ring += 1;
    }

    offsets
}

fn calculate_repeated_watermark_points(
    page_width: f32,
    page_height: f32,
    text_width: f32,
    font_size: f32,
    rotation_radians: f32,
    spacing: &str,
) -> Vec<(f32, f32)> {
    let page_width = page_width.max(1.0);
    let page_height = page_height.max(1.0);
    let text_width = text_width.max(font_size * 4.0).max(1.0);
    let text_height = font_size.max(1.0);
    let cos = rotation_radians.cos().abs();
    let sin = rotation_radians.sin().abs();
    let rotated_width = (text_width * cos + text_height * sin).max(font_size * 4.0);
    let rotated_height = (text_width * sin + text_height * cos).max(font_size * 3.0);
    let column_gap_ratio = repeated_column_gap_ratio(spacing);
    let row_gap_ratio = repeated_row_gap_ratio(spacing);
    let target_step_x = rotated_width * (1.0 + column_gap_ratio);
    let target_step_y = rotated_height * (1.0 + row_gap_ratio);
    let step_x = fit_centered_axis_step(page_width, rotated_width, target_step_x, 1.05);
    let step_y = fit_centered_axis_step(page_height, rotated_height, target_step_y, 0.45);
    let x_offsets = centered_axis_offsets(page_width, rotated_width, step_x);
    let y_offsets = centered_axis_offsets(page_height, rotated_height, step_y);
    let cx = page_width / 2.0;
    let cy = page_height / 2.0;
    let mut points = Vec::with_capacity(x_offsets.len() * y_offsets.len());

    for y_offset in &y_offsets {
        for x_offset in &x_offsets {
            points.push((cx + x_offset, cy + y_offset));
        }
    }

    points
}

fn add_font_to_resource_dict(
    resources: &mut Dictionary,
    font_resource_name: &[u8],
    font_id: ObjectId,
) -> Result<Option<ObjectId>, String> {
    if !resources.has(b"Font") {
        resources.set(b"Font", Dictionary::new());
    }

    match resources.get_mut(b"Font").map_err(|e| e.to_string())? {
        Object::Dictionary(fonts) => {
            fonts.set(font_resource_name.to_vec(), Object::Reference(font_id));
            Ok(None)
        }
        Object::Reference(fonts_id) => Ok(Some(*fonts_id)),
        _ => {
            resources.set(b"Font", Dictionary::new());
            let fonts = resources
                .get_mut(b"Font")
                .and_then(Object::as_dict_mut)
                .map_err(|e| e.to_string())?;
            fonts.set(font_resource_name.to_vec(), Object::Reference(font_id));
            Ok(None)
        }
    }
}

fn add_font_to_resource_object(
    doc: &mut Document,
    resources_id: ObjectId,
    font_resource_name: &[u8],
    font_id: ObjectId,
) -> Result<(), String> {
    let referenced_font_dict_id = {
        let resources = doc
            .get_object_mut(resources_id)
            .and_then(Object::as_dict_mut)
            .map_err(|e| e.to_string())?;
        add_font_to_resource_dict(resources, font_resource_name, font_id)?
    };

    if let Some(fonts_id) = referenced_font_dict_id {
        let fonts = doc
            .get_object_mut(fonts_id)
            .and_then(Object::as_dict_mut)
            .map_err(|e| e.to_string())?;
        fonts.set(font_resource_name.to_vec(), Object::Reference(font_id));
    }

    Ok(())
}

fn add_graphics_state_to_resource_dict(
    resources: &mut Dictionary,
    graphics_state_name: &[u8],
    graphics_state_id: ObjectId,
) -> Result<Option<ObjectId>, String> {
    if !resources.has(b"ExtGState") {
        resources.set(b"ExtGState", Dictionary::new());
    }

    match resources.get_mut(b"ExtGState").map_err(|e| e.to_string())? {
        Object::Dictionary(states) => {
            states.set(
                graphics_state_name.to_vec(),
                Object::Reference(graphics_state_id),
            );
            Ok(None)
        }
        Object::Reference(states_id) => Ok(Some(*states_id)),
        _ => {
            resources.set(b"ExtGState", Dictionary::new());
            let states = resources
                .get_mut(b"ExtGState")
                .and_then(Object::as_dict_mut)
                .map_err(|e| e.to_string())?;
            states.set(
                graphics_state_name.to_vec(),
                Object::Reference(graphics_state_id),
            );
            Ok(None)
        }
    }
}

fn add_graphics_state_to_resource_object(
    doc: &mut Document,
    resources_id: ObjectId,
    graphics_state_name: &[u8],
    graphics_state_id: ObjectId,
) -> Result<(), String> {
    let referenced_state_dict_id = {
        let resources = doc
            .get_object_mut(resources_id)
            .and_then(Object::as_dict_mut)
            .map_err(|e| e.to_string())?;
        add_graphics_state_to_resource_dict(resources, graphics_state_name, graphics_state_id)?
    };

    if let Some(states_id) = referenced_state_dict_id {
        let states = doc
            .get_object_mut(states_id)
            .and_then(Object::as_dict_mut)
            .map_err(|e| e.to_string())?;
        states.set(
            graphics_state_name.to_vec(),
            Object::Reference(graphics_state_id),
        );
    }

    Ok(())
}

fn ensure_page_watermark_font(
    doc: &mut Document,
    page_id: ObjectId,
    font_resource_name: &[u8],
    font_id: ObjectId,
) -> Result<(), String> {
    let direct_resources_ref = doc
        .get_object(page_id)
        .and_then(Object::as_dict)
        .ok()
        .and_then(|page| page.get(b"Resources").and_then(Object::as_reference).ok());

    if let Some(resources_id) = direct_resources_ref {
        return add_font_to_resource_object(doc, resources_id, font_resource_name, font_id);
    }

    let has_direct_inline_resources = doc
        .get_object(page_id)
        .and_then(Object::as_dict)
        .ok()
        .and_then(|page| page.get(b"Resources").and_then(Object::as_dict).ok())
        .is_some();

    if has_direct_inline_resources {
        let referenced_font_dict_id = {
            let page = doc
                .get_object_mut(page_id)
                .and_then(Object::as_dict_mut)
                .map_err(|e| e.to_string())?;
            let resources = page
                .get_mut(b"Resources")
                .and_then(Object::as_dict_mut)
                .map_err(|e| e.to_string())?;
            add_font_to_resource_dict(resources, font_resource_name, font_id)?
        };

        if let Some(fonts_id) = referenced_font_dict_id {
            let fonts = doc
                .get_object_mut(fonts_id)
                .and_then(Object::as_dict_mut)
                .map_err(|e| e.to_string())?;
            fonts.set(font_resource_name.to_vec(), Object::Reference(font_id));
        }

        return Ok(());
    }

    let inherited_resource_ids = doc
        .get_page_resources(page_id)
        .map(|(_, ids)| ids)
        .unwrap_or_default();

    if let Some(resources_id) = inherited_resource_ids.first().copied() {
        return add_font_to_resource_object(doc, resources_id, font_resource_name, font_id);
    }

    let page = doc
        .get_object_mut(page_id)
        .and_then(Object::as_dict_mut)
        .map_err(|e| e.to_string())?;
    page.set(b"Resources", Dictionary::new());
    let resources = page
        .get_mut(b"Resources")
        .and_then(Object::as_dict_mut)
        .map_err(|e| e.to_string())?;
    add_font_to_resource_dict(resources, font_resource_name, font_id)?;

    Ok(())
}

fn ensure_page_watermark_graphics_state(
    doc: &mut Document,
    page_id: ObjectId,
    graphics_state_name: &[u8],
    graphics_state_id: ObjectId,
) -> Result<(), String> {
    let direct_resources_ref = doc
        .get_object(page_id)
        .and_then(Object::as_dict)
        .ok()
        .and_then(|page| page.get(b"Resources").and_then(Object::as_reference).ok());

    if let Some(resources_id) = direct_resources_ref {
        return add_graphics_state_to_resource_object(
            doc,
            resources_id,
            graphics_state_name,
            graphics_state_id,
        );
    }

    let has_direct_inline_resources = doc
        .get_object(page_id)
        .and_then(Object::as_dict)
        .ok()
        .and_then(|page| page.get(b"Resources").and_then(Object::as_dict).ok())
        .is_some();

    if has_direct_inline_resources {
        let referenced_state_dict_id = {
            let page = doc
                .get_object_mut(page_id)
                .and_then(Object::as_dict_mut)
                .map_err(|e| e.to_string())?;
            let resources = page
                .get_mut(b"Resources")
                .and_then(Object::as_dict_mut)
                .map_err(|e| e.to_string())?;
            add_graphics_state_to_resource_dict(resources, graphics_state_name, graphics_state_id)?
        };

        if let Some(states_id) = referenced_state_dict_id {
            let states = doc
                .get_object_mut(states_id)
                .and_then(Object::as_dict_mut)
                .map_err(|e| e.to_string())?;
            states.set(
                graphics_state_name.to_vec(),
                Object::Reference(graphics_state_id),
            );
        }

        return Ok(());
    }

    let inherited_resource_ids = doc
        .get_page_resources(page_id)
        .map(|(_, ids)| ids)
        .unwrap_or_default();

    if let Some(resources_id) = inherited_resource_ids.first().copied() {
        return add_graphics_state_to_resource_object(
            doc,
            resources_id,
            graphics_state_name,
            graphics_state_id,
        );
    }

    let page = doc
        .get_object_mut(page_id)
        .and_then(Object::as_dict_mut)
        .map_err(|e| e.to_string())?;
    page.set(b"Resources", Dictionary::new());
    let resources = page
        .get_mut(b"Resources")
        .and_then(Object::as_dict_mut)
        .map_err(|e| e.to_string())?;
    add_graphics_state_to_resource_dict(resources, graphics_state_name, graphics_state_id)?;

    Ok(())
}

// Helper: Resolve configurations directory

#[tauri::command]
fn add_watermark(
    input_path: String,
    user_text: String,
    config: WatermarkConfig,
) -> Result<String, String> {
    println!("Processing: {}", input_path);

    let path = Path::new(&input_path);
    if !path.exists() {
        return Err(format!("Input PDF does not exist: {}", input_path));
    }

    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or("Invalid filename")?;

    // Determine Output Directory
    let parent = if config.export_path.is_empty() || config.export_path == "SOURCE" {
        path.parent().unwrap_or(Path::new(".")).to_path_buf()
    } else {
        PathBuf::from(&config.export_path)
    };

    // Ensure output directory exists if custom
    if !parent.exists() {
        fs::create_dir_all(&parent).map_err(|e| e.to_string())?;
    }

    // Determine Output Filename Suffix
    // Replace {} in suffix with user_text if present, otherwise just append suffix
    let suffix = if config.export_suffix.contains("{}") {
        config.export_suffix.replace("{}", &user_text)
    } else {
        config.export_suffix.clone()
    };

    let output_filename = format!("{}{}.pdf", stem, suffix);
    let output_path = parent.join(output_filename);
    if output_path == path {
        return Err(
            "Output path is the same as input path. Please set an export suffix.".to_string(),
        );
    }

    let mut doc = Document::load(&input_path).map_err(|e| e.to_string())?;

    // Prepare content text
    if config.text.contains("{}") && user_text.trim().is_empty() {
        return Err(
            "Watermark template contains {}, please enter text before processing.".to_string(),
        );
    }

    let final_text = config.text.replace("{}", &user_text);
    if final_text.trim().is_empty() {
        return Err("Watermark text is empty".to_string());
    }

    println!("Watermark text: {}", final_text);

    let (r, g, b) = parse_color(&config.color);
    let opacity = config.opacity.clamp(0.0, 1.0);
    let font_id = doc.add_object(Dictionary::from_iter(vec![
        ("Type", "Font".into()),
        ("Subtype", "Type1".into()),
        ("BaseFont", config.font_family.as_str().into()),
        ("Encoding", "WinAnsiEncoding".into()),
    ]));
    let graphics_state_id = doc.add_object(Dictionary::from_iter(vec![
        ("Type", "ExtGState".into()),
        ("ca", opacity.into()),
        ("CA", opacity.into()),
    ]));
    let rad = config.rotation.to_radians();
    let cos_theta = rad.cos();
    let sin_theta = rad.sin();

    // Calculate offsets based on alignment strategy
    let text_width = estimate_text_width(&final_text, &config.font_family, config.font_size);

    // Determine alignment ratio (0.0 = Left/Start, 0.5 = Center, 1.0 = Right/End)
    let x_align_ratio = match config.position.as_str() {
        "TopLeft" | "BottomLeft" => 0.0,
        "TopRight" | "BottomRight" => 1.0,
        _ => 0.5, // Center, TopCenter, BottomCenter, CenterLeft, CenterRight
    };

    let offset_x = -text_width * x_align_ratio;
    let offset_y = -config.font_size / 3.0; // Shift down slightly to center vertically on baseline (approx 1/3 em)

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
                    // 考虑继承属性的 Meida box：doc.get_page_resources(object_id)
                    // 考虑间接对象引用的 Media box: let media_box = page_dict.get(b"MediaBox")
                    //.and_then(|obj| doc.get_object(obj.as_reference().unwrap_or(object_id)).ok()) // 如果是引用则获取引用对象
                    //.and_then(|obj| obj.as_array().ok());
                    let get_f32 = |obj: &lopdf::Object| -> f32 {
                        match obj {
                            lopdf::Object::Real(f) => *f,
                            lopdf::Object::Integer(i) => *i as f32,
                            _ => 0.0,
                        }
                    };
                    let x1 = get_f32(&media_box[0]);
                    let y1 = get_f32(&media_box[1]);
                    let x2 = get_f32(&media_box[2]);
                    let y2 = get_f32(&media_box[3]);
                    println!("MediaBox: [{}, {}, {}, {}]", x1, y1, x2, y2);
                    width = (x2 - x1).abs();
                    height = (y2 - y1).abs();
                }
            }
        }

        println!("MediaBox: {}x{}", width, height);

        // Calculate Position
        // Simplistic anchor points
        let (cx, cy) = (width / 2.0, height / 2.0);
        let margin = 20.0;

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

        ops.push(Operation::new(
            "gs",
            vec![WATERMARK_GRAPHICS_STATE_RESOURCE.into()],
        ));

        // Set Color (RGB non-stroking)
        ops.push(Operation::new("rg", vec![r.into(), g.into(), b.into()]));

        // Transformation Matrix
        // If repeated, we loop. If single, we do once.

        let points = if config.is_repeated {
            calculate_repeated_watermark_points(
                width,
                height,
                text_width,
                config.font_size,
                rad,
                &config.spacing,
            )
        } else {
            vec![(x, y)]
        };
        let text_offset_x = if config.is_repeated {
            -text_width * 0.5
        } else {
            offset_x
        };

        ops.push(Operation::new("BT", vec![])); // Begin Text

        // Reset text state that may be left behind by generated PDFs.
        ops.push(Operation::new("Tc", vec![0.into()])); // Character spacing
        ops.push(Operation::new("Tw", vec![0.into()])); // Word spacing
        ops.push(Operation::new("Tz", vec![100.into()])); // Horizontal scaling
        ops.push(Operation::new("TL", vec![config.font_size.into()]));
        ops.push(Operation::new("Tr", vec![0.into()])); // Fill text rendering mode
        ops.push(Operation::new("Ts", vec![0.into()])); // Text rise
        ops.push(Operation::new(
            "Tf",
            vec![WATERMARK_FONT_RESOURCE.into(), config.font_size.into()],
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

            // Shift origin relative to rotation to center the text
            ops.push(Operation::new(
                "Td",
                vec![text_offset_x.into(), offset_y.into()],
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

        // Correct approach: Add the new content stream as a new object, then update the page to reference it.
        // Note: This replaces all previous content streams with this single merged one.
        let stream_obj = Stream::new(lopdf::Dictionary::new(), content.encode().unwrap());
        let new_content_id = doc.add_object(stream_obj);

        if let Ok(page_dict) = doc.get_object_mut(object_id).and_then(|o| o.as_dict_mut()) {
            page_dict.set(b"Contents", Object::Reference(new_content_id));
        }

        ensure_page_watermark_font(
            &mut doc,
            object_id,
            WATERMARK_FONT_RESOURCE.as_bytes(),
            font_id,
        )?;
        ensure_page_watermark_graphics_state(
            &mut doc,
            object_id,
            WATERMARK_GRAPHICS_STATE_RESOURCE.as_bytes(),
            graphics_state_id,
        )?;
    }

    doc.save(&output_path).map_err(|e| e.to_string())?;
    if !output_path.exists() {
        return Err(format!(
            "Watermark operation finished, but output file was not found: {}",
            output_path.display()
        ));
    }
    Ok(format!("Saved to {}", output_path.display()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
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

#[cfg(test)]
mod tests {
    use super::*;
    use lopdf::dictionary;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_test_dir() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after Unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("watermarker-test-{}-{}", std::process::id(), nanos))
    }

    fn write_minimal_pdf(path: &Path) {
        let mut doc = Document::with_version("1.5");
        let pages_id = doc.new_object_id();
        let content_id = doc.add_object(Stream::new(lopdf::Dictionary::new(), Vec::new()));
        let page_id = doc.add_object(dictionary! {
            "Type" => "Page",
            "Parent" => pages_id,
            "MediaBox" => vec![0.into(), 0.into(), 300.into(), 300.into()],
            "Contents" => content_id,
            "Resources" => lopdf::Dictionary::new(),
        });
        doc.objects.insert(
            pages_id,
            Object::Dictionary(dictionary! {
                "Type" => "Pages",
                "Kids" => vec![page_id.into()],
                "Count" => 1,
            }),
        );
        let catalog_id = doc.add_object(dictionary! {
            "Type" => "Catalog",
            "Pages" => pages_id,
        });
        doc.trailer.set("Root", catalog_id);
        doc.save(path).expect("minimal PDF should be saved");
    }

    fn write_pdf_with_existing_text_state(path: &Path) {
        let mut doc = Document::with_version("1.5");
        let pages_id = doc.new_object_id();
        let font_id = doc.add_object(dictionary! {
            "Type" => "Font",
            "Subtype" => "Type1",
            "BaseFont" => "Courier",
        });
        let content = Content {
            operations: vec![
                Operation::new("BT", vec![]),
                Operation::new("Tc", vec![Object::Integer(-30)]),
                Operation::new("Tw", vec![Object::Integer(-20)]),
                Operation::new("Tz", vec![Object::Integer(25)]),
                Operation::new("ET", vec![]),
            ],
        };
        let content_id = doc.add_object(Stream::new(
            lopdf::Dictionary::new(),
            content.encode().expect("content should encode"),
        ));
        let page_id = doc.add_object(dictionary! {
            "Type" => "Page",
            "Parent" => pages_id,
            "MediaBox" => vec![0.into(), 0.into(), 300.into(), 300.into()],
            "Contents" => content_id,
            "Resources" => dictionary! {
                "Font" => dictionary! {
                    "F1" => font_id,
                },
            },
        });
        doc.objects.insert(
            pages_id,
            Object::Dictionary(dictionary! {
                "Type" => "Pages",
                "Kids" => vec![page_id.into()],
                "Count" => 1,
            }),
        );
        let catalog_id = doc.add_object(dictionary! {
            "Type" => "Catalog",
            "Pages" => pages_id,
        });
        doc.trailer.set("Root", catalog_id);
        doc.save(path).expect("PDF with text state should be saved");
    }

    fn object_as_f32(object: &Object) -> Option<f32> {
        match object {
            Object::Integer(value) => Some(*value as f32),
            Object::Real(value) => Some(*value),
            _ => None,
        }
    }

    fn has_numeric_operation(operations: &[Operation], operator: &str, expected: f32) -> bool {
        operations.iter().any(|operation| {
            operation.operator == operator
                && operation
                    .operands
                    .first()
                    .and_then(object_as_f32)
                    .is_some_and(|value| (value - expected).abs() < f32::EPSILON)
        })
    }

    #[test]
    fn repeated_watermark_points_are_centered_and_density_based() {
        let tight = calculate_repeated_watermark_points(
            600.0,
            800.0,
            180.0,
            48.0,
            45f32.to_radians(),
            "Tight",
        );
        let normal = calculate_repeated_watermark_points(
            600.0,
            800.0,
            180.0,
            48.0,
            45f32.to_radians(),
            "Normal",
        );
        let loose = calculate_repeated_watermark_points(
            600.0,
            800.0,
            180.0,
            48.0,
            45f32.to_radians(),
            "Loose",
        );

        assert_eq!(normal.first().copied(), Some((300.0, 400.0)));
        assert!(
            tight.len() > normal.len() && normal.len() > loose.len(),
            "expected tight > normal > loose point counts, got {} > {} > {}",
            tight.len(),
            normal.len(),
            loose.len()
        );
        assert!(normal.iter().any(|point| *point == (300.0, 400.0)));

        for (x, y) in &normal {
            let mirrored_x = 600.0 - x;
            let mirrored_y = 800.0 - y;
            assert!(normal
                .iter()
                .any(|point| (point.0 - mirrored_x).abs() < 0.01 && (point.1 - *y).abs() < 0.01));
            assert!(normal
                .iter()
                .any(|point| (point.0 - *x).abs() < 0.01 && (point.1 - mirrored_y).abs() < 0.01));
        }
    }

    #[test]
    fn repeated_watermark_points_allow_partial_edge_marks_for_large_text() {
        let points = calculate_repeated_watermark_points(
            600.0,
            800.0,
            900.0,
            150.0,
            45f32.to_radians(),
            "Tight",
        );

        assert_eq!(points.first().copied(), Some((300.0, 400.0)));
        assert!(
            points.len() > 1,
            "large repeated watermark should still generate edge marks"
        );
        assert!(points
            .iter()
            .any(|(x, y)| *x < 0.0 || *x > 600.0 || *y < 0.0 || *y > 800.0));
    }

    #[test]
    fn repeated_watermark_columns_expand_for_long_text() {
        let short = calculate_repeated_watermark_points(
            600.0,
            800.0,
            120.0,
            48.0,
            45f32.to_radians(),
            "Tight",
        );
        let long = calculate_repeated_watermark_points(
            600.0,
            800.0,
            520.0,
            48.0,
            45f32.to_radians(),
            "Tight",
        );
        let count_columns = |points: &[(f32, f32)]| -> usize {
            let center_row_y = points.first().expect("points should include center").1;
            points
                .iter()
                .filter(|(_, y)| (*y - center_row_y).abs() < 0.01)
                .count()
        };

        assert!(
            count_columns(&short) > count_columns(&long),
            "longer text should produce fewer, wider-spaced columns"
        );
    }

    #[test]
    fn add_watermark_creates_output_pdf() {
        let dir = unique_test_dir();
        fs::create_dir_all(&dir).expect("test dir should be created");
        let input_path = dir.join("input.pdf");
        let output_path = dir.join("input_marked.pdf");
        write_minimal_pdf(&input_path);

        let result = add_watermark(
            input_path.to_string_lossy().to_string(),
            "TEST".to_string(),
            WatermarkConfig::default(),
        );

        assert!(result.is_ok(), "watermark command failed: {:?}", result);
        assert!(
            output_path.exists(),
            "expected output PDF was not generated"
        );

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn add_watermark_resets_inherited_text_state_and_uses_own_font() {
        let dir = unique_test_dir();
        fs::create_dir_all(&dir).expect("test dir should be created");
        let input_path = dir.join("input.pdf");
        let output_path = dir.join("input_marked.pdf");
        write_pdf_with_existing_text_state(&input_path);

        let result = add_watermark(
            input_path.to_string_lossy().to_string(),
            "ABC DEF".to_string(),
            WatermarkConfig::default(),
        );

        assert!(result.is_ok(), "watermark command failed: {:?}", result);

        let doc = Document::load(&output_path).expect("output PDF should load");
        let page_id = *doc
            .get_pages()
            .values()
            .next()
            .expect("output PDF should have a page");
        let content_data = doc
            .get_page_content(page_id)
            .expect("page content should decode");
        let content = Content::decode(&content_data).expect("content stream should decode");
        let watermark_start = content
            .operations
            .iter()
            .rposition(|operation| operation.operator == "BT")
            .expect("watermark text object should exist");
        let watermark_ops = &content.operations[watermark_start..];

        assert!(has_numeric_operation(watermark_ops, "Tc", 0.0));
        assert!(has_numeric_operation(watermark_ops, "Tw", 0.0));
        assert!(has_numeric_operation(watermark_ops, "Tz", 100.0));
        assert!(has_numeric_operation(watermark_ops, "Tr", 0.0));
        assert!(has_numeric_operation(watermark_ops, "Ts", 0.0));

        let tf = watermark_ops
            .iter()
            .find(|operation| operation.operator == "Tf")
            .expect("watermark should select a font");
        assert_eq!(
            tf.operands
                .first()
                .and_then(|operand| operand.as_name().ok()),
            Some(WATERMARK_FONT_RESOURCE.as_bytes())
        );

        let gs = content
            .operations
            .iter()
            .find(|operation| operation.operator == "gs")
            .expect("watermark should apply an opacity graphics state");
        assert_eq!(
            gs.operands
                .first()
                .and_then(|operand| operand.as_name().ok()),
            Some(WATERMARK_GRAPHICS_STATE_RESOURCE.as_bytes())
        );

        let fonts = doc
            .get_page_fonts(page_id)
            .expect("page fonts should be readable");
        assert!(fonts.contains_key(&b"F1".to_vec()));
        assert!(fonts.contains_key(&WATERMARK_FONT_RESOURCE.as_bytes().to_vec()));

        let page = doc
            .get_object(page_id)
            .and_then(Object::as_dict)
            .expect("page dictionary should be readable");
        let graphics_states = page
            .get(b"Resources")
            .and_then(Object::as_dict)
            .and_then(|resources| resources.get(b"ExtGState"))
            .and_then(Object::as_dict)
            .expect("page should include graphics states");
        let watermark_graphics_state_id = graphics_states
            .get(WATERMARK_GRAPHICS_STATE_RESOURCE.as_bytes())
            .and_then(Object::as_reference)
            .expect("watermark graphics state should be registered");
        let watermark_graphics_state = doc
            .get_object(watermark_graphics_state_id)
            .and_then(Object::as_dict)
            .expect("watermark graphics state should be readable");
        assert_eq!(
            watermark_graphics_state
                .get(b"ca")
                .ok()
                .and_then(object_as_f32),
            Some(WatermarkConfig::default().opacity)
        );

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn add_watermark_requires_input_when_template_has_placeholder() {
        let dir = unique_test_dir();
        fs::create_dir_all(&dir).expect("test dir should be created");
        let input_path = dir.join("input.pdf");
        write_minimal_pdf(&input_path);

        let result = add_watermark(
            input_path.to_string_lossy().to_string(),
            "   ".to_string(),
            WatermarkConfig::default(),
        );

        assert!(result
            .expect_err("placeholder should require user input")
            .contains("please enter text"));

        let _ = fs::remove_dir_all(dir);
    }
}
