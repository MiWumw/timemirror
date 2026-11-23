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

// 智能读取《今日计划.md》：兼容 Google Docs 与纯文本、多重名文件按最新更新时间取舍、防 PDF 乱码
function readBestPlanContent(folder) {
  var candidateFiles = [];

  function collectFiles(fileIterator) {
    while (fileIterator.hasNext()) {
      var f = fileIterator.next();
      if (!f.isTrashed()) {
        candidateFiles.push(f);
      }
    }
  }

  // 1. 搜集候选文件：查 TimeMirror_Sync 文件夹和云盘根目录
  try {
    collectFiles(folder.getFilesByName("今日计划.md"));
    collectFiles(folder.getFilesByName("今日计划"));
    collectFiles(DriveApp.getFilesByName("今日计划.md"));
    collectFiles(DriveApp.getFilesByName("今日计划"));
  } catch(e) {}

  if (candidateFiles.length === 0) return "";

  // 2. 去重并按最后更新时间 (LastUpdated) 降序排序，最新修改的排在最前！
  var uniqueFiles = [];
  var seenIds = {};
  for (var i = 0; i < candidateFiles.length; i++) {
    var file = candidateFiles[i];
    if (!seenIds[file.getId()]) {
      seenIds[file.getId()] = true;
      uniqueFiles.push(file);
    }
  }

  uniqueFiles.sort(function(a, b) {
    return b.getLastUpdated().getTime() - a.getLastUpdated().getTime();
  });

  // 3. 逐个提取文本内容，避免 PDF 导出乱码
  for (var j = 0; j < uniqueFiles.length; j++) {
    var targetFile = uniqueFiles[j];
    var text = "";
    try {
      var mime = targetFile.getMimeType();
      if (mime === MimeType.GOOGLE_DOCS) {
        // 关键防护：如果是 Google Docs 文档，用 DocumentApp 提取纯文本！绝不能用 getBlob() 导出为 PDF！
        text = DocumentApp.openById(targetFile.getId()).getBody().getText();
      } else {
        // 纯文本 Markdown
        text = targetFile.getBlob().getDataAsString("utf-8");
      }

      // 4. 防呆校验：如果内容被意外解析成了 PDF，丢弃并尝试下一个候选
      if (text && !text.startsWith("%PDF-") && !text.includes("/Producer (Skia/PDF")) {
        return text.trim();
      }
    } catch(err) {
      // 容错继续下一个候选
    }
  }

  return "";
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

  // B. 🎯 核心增强：读取 Gemini 写入的《今日计划.md》(最新文件优先 + Google Docs 智能提取)
  const planMarkdown = readBestPlanContent(folder);

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
