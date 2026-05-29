use std::fs;
use std::path::PathBuf;

use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopSessionFile {
    path: String,
    contents: String,
}

fn validate_session_path(path: &PathBuf) -> Result<(), String> {
    match path.file_name().and_then(|name| name.to_str()) {
        Some(".coxeter-session.json") => Ok(()),
        Some(_) => Err("session files must be named .coxeter-session.json".into()),
        None => Err("session path has no file name".into()),
    }
}

#[tauri::command]
fn read_project_session(path: String) -> Result<DesktopSessionFile, String> {
    let path_buf = PathBuf::from(&path);
    validate_session_path(&path_buf)?;
    let contents = fs::read_to_string(&path_buf)
        .map_err(|error| format!("could not read session file: {error}"))?;
    Ok(DesktopSessionFile { path, contents })
}

#[tauri::command]
fn write_project_session(path: String, contents: String) -> Result<DesktopSessionFile, String> {
    let path_buf = PathBuf::from(&path);
    validate_session_path(&path_buf)?;
    fs::write(&path_buf, contents.as_bytes())
        .map_err(|error| format!("could not write session file: {error}"))?;
    Ok(DesktopSessionFile { path, contents })
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            read_project_session,
            write_project_session
        ])
        .run(tauri::generate_context!())
        .expect("error while running CoxeterViewer5D desktop shell");
}
