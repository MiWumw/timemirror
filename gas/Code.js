/**
 * 《时镜 TimeMirror》谷歌云端直连中枢 (Google Apps Script Web App)
 * 作用：无需登录即可在任意设备同步全量数据，自动读取 Gemini《今日计划.md》，并自动在云盘生成 Obsidian 每日知行日志
 */

const SYNC_FOLDER_NAME = "TimeMirror_Sync"; // 存放全量数据与日记的云盘文件夹

function getOrCreateFolder() {
  const folders = DriveApp.getFoldersByName(SYNC_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(SYNC_FOLDER_NAME);
}

// 1. 处理 GET 请求：从云盘拉取最新全量状态 + 自动提取《今日计划.md》
function doGet(e) {
  const folder = getOrCreateFolder();

  // A. 读取全量状态 JSON
  const files = folder.getFilesByName("timemirror_state.json");
  let state = {};
  if (files.hasNext()) {
    try {
      state = JSON.parse(files.next().getBlob().getDataAsString("utf-8"));
    } catch(err) {}
  }

  // B. 🎯 核心增强：读取 Gemini 写入的《今日计划.md》
  // （支持双重嗅探：优先在 TimeMirror_Sync 查，若没有则在云盘根目录查）
  let planMarkdown = "";
  try {
    let planFiles = folder.getFilesByName("今日计划.md");
    if (!planFiles.hasNext()) {
      planFiles = DriveApp.getFilesByName("今日计划.md");
    }
    if (planFiles.hasNext()) {
      planMarkdown = planFiles.next().getBlob().getDataAsString("utf-8");
    }
  } catch(planErr) {}

  // C. 打包返回给时镜
  const responseData = {
    status: "ok",
    success: true,
    state: state,
    planMarkdown: planMarkdown
  };

  return ContentService.createTextOutput(JSON.stringify(responseData))
    .setMimeType(ContentService.MimeType.JSON);
}

// 2. 处理 POST 请求：保存全量数据并写入 Obsidian Markdown 日记
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const folder = getOrCreateFolder();

    // A. 保存全量 JSON 状态 (timemirror_state.json)
    if (data.state) {
      const stateFiles = folder.getFilesByName("timemirror_state.json");
      const content = JSON.stringify(data.state, null, 2);
      if (stateFiles.hasNext()) {
        stateFiles.next().setContent(content);
      } else {
        folder.createFile("timemirror_state.json", content, "application/json");
      }
    }

    // B. 保存 Obsidian 日记 Markdown (YYYY-MM-DD_每日知行日志.md)
    if (data.date && data.markdownContent) {
      const fileName = data.date + "_每日知行日志.md";
      const mdFiles = folder.getFilesByName(fileName);
      if (mdFiles.hasNext()) {
        mdFiles.next().setContent(data.markdownContent);
      } else {
        folder.createFile(fileName, data.markdownContent, "text/markdown");
      }
    }

    return ContentService.createTextOutput(JSON.stringify({ success: true, message: "已成功直连写入谷歌云盘！" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
