use lopdf::content::{Content, Operation};
use lopdf::{Document, Object, StringFormat};
use std::collections::BTreeMap;
use tauri::ipc::Response; // 如果是 Tauri v2

// 定义我们要在前端调用的命令
// 参数：input_path (输入文件路径), output_path (保存路径), text (水印文字)
#[tauri::command]
fn add_watermark(input_path: String, output_path: String, text: String) -> Result<String, String> {
    println!("正在处理文件: {}", input_path);

    // 1. 加载 PDF 文档
    let mut doc = Document::load(&input_path).map_err(|e| e.to_string())?;

    // 2. 遍历每一页 (Page)
    // 注意：这里我们为了简化，使用了简单的文本追加方式。
    // 实际生产中需要处理字体嵌入、旋转和透明度，这需要更复杂的逻辑。
    for (page_id, object_id) in doc.get_pages() {
        // 获取该页面的内容流
        let content_data = doc.get_page_content(object_id).map_err(|e| e.to_string())?;
        let mut content = Content::decode(&content_data).map_err(|e| e.to_string())?;

        // 3. 构建水印操作指令 (PDF 语法)
        // BT: Begin Text
        // /F1 24 Tf: 使用字体 F1 (Helvetica), 大小 48
        // 100 100 Td: 坐标位置 (x=100, y=100)
        // Tj: 显示文本
        // ET: End Text
        let operations = vec![
            Operation::new("BT", vec![]),
            Operation::new("Tf", vec!["F1".into(), 48.into()]),
            Operation::new("Td", vec![100.into(), 100.into()]),
            Operation::new(
                "Tj",
                vec![Object::String(
                    text.as_bytes().to_vec(),
                    StringFormat::Literal,
                )],
            ),
            Operation::new("ET", vec![]),
        ];

        // 将水印追加到当前页面内容末尾
        for op in operations {
            content.operations.push(op);
        }

        // 将修改后的内容写回文档
        doc.change_page_content(object_id, content.encode().map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    }

    // 4. 保存文件
    doc.save(&output_path).map_err(|e| e.to_string())?;

    Ok(format!("成功！文件已保存至: {}", output_path))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init()) // Tauri v2 默认插件
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::DragDrop(event) = event {
                println!(
                    "Backend DragDrop Event on window '{}': {:?}",
                    window.label(),
                    event
                );
            }
        })
        .invoke_handler(tauri::generate_handler![add_watermark]) // <--- 关键：注册你的命令
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
