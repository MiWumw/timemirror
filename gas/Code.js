/**
 * 《时镜 TimeMirror》谷歌云端直连中枢 (Google Apps Script Web App)
 * 作用：无需登录即可在任意设备同步全量数据，智能模糊匹配与读取 Gemini《今日计划.md》，并自动在云盘生成 Obsidian 每日知行日志
 */

const SYNC_FOLDER_NAME = "TimeMirror_Sync"; // 存放全量数据与日记的云盘文件夹

// 智能获取工作文件夹：优先返回最近更新且有效的 TimeMirror_Sync 文件夹 (兼容 TimeMirror_Sync (1) 等重名情况)
function getOrCreateFolder() {
  var latestFolder = null;
  var latestTime = 0;

  try {
    var folders = DriveApp.getFoldersByName(SYNC_FOLDER_NAME);
    while (folders.hasNext()) {
      var f = folders.next();
      if (!f.isTrashed()) {
        var t = f.getLastUpdated().getTime();
        if (t > latestTime) {
          latestTime = t;
          latestFolder = f;
        }
      }
    }
  } catch(e) {}

  if (!latestFolder) {
    try {
      var allFolders = DriveApp.getFolders();
      while (allFolders.hasNext()) {
        var f = allFolders.next();
        if (f.getName().indexOf(SYNC_FOLDER_NAME) !== -1 && !f.isTrashed()) {
          var t = f.getLastUpdated().getTime();
          if (t > latestTime) {
            latestTime = t;
            latestFolder = f;
          }
        }
      }
    } catch(e) {}
  }

  if (latestFolder) return latestFolder;
  return DriveApp.createFolder(SYNC_FOLDER_NAME);
}

// 智能全盘搜索与读取《今日计划》：支持模糊匹配、日期加权、最新修改优先、Google Docs纯文本与防乱码
function readBestPlanContent(primaryFolder, targetDate) {
  var candidateFiles = [];
  var seenIds = {};

  function addCandidate(f) {
    if (!f) return;
    try {
      if (f.isTrashed()) return;
      var fid = f.getId();
      if (!seenIds[fid]) {
        seenIds[fid] = true;
        candidateFiles.push(f);
      }
    } catch(e) {}
  }

  // 1. 深度扫描 primaryFolder 内部的文件
  try {
    if (primaryFolder) {
      var fIter = primaryFolder.getFiles();
      while (fIter.hasNext()) {
        var file = fIter.next();
        var name = file.getName();
        if (name.indexOf("计划") !== -1 && name.indexOf("每日知行日志") === -1 && name.indexOf("timemirror_state") === -1) {
          addCandidate(file);
        }
      }
    }
  } catch(e) {}

  // 2. 深度扫描所有包含 TimeMirror_Sync 的文件夹内部的所有文件
  try {
    var allFolders = DriveApp.getFolders();
    while (allFolders.hasNext()) {
      var sFolder = allFolders.next();
      if (sFolder.getName().indexOf(SYNC_FOLDER_NAME) !== -1 && !sFolder.isTrashed()) {
        var fIter = sFolder.getFiles();
        while (fIter.hasNext()) {
          var file = fIter.next();
          var name = file.getName();
          if (name.indexOf("计划") !== -1 && name.indexOf("每日知行日志") === -1 && name.indexOf("timemirror_state") === -1) {
            addCandidate(file);
          }
        }
      }
    }
  } catch(e) {}

  // 3. 全盘按常见文件名精确查找
  try {
    var pFiles = DriveApp.getFilesByName("今日计划.md");
    while (pFiles.hasNext()) addCandidate(pFiles.next());
    var pFiles2 = DriveApp.getFilesByName("今日计划");
    while (pFiles2.hasNext()) addCandidate(pFiles2.next());
  } catch(e) {}

  // 4. searchFiles 容错查询
  try {
    var searchIter = DriveApp.searchFiles("title contains '今日计划' and trashed = false");
    while (searchIter.hasNext()) addCandidate(searchIter.next());
  } catch(e) {}

  if (targetDate) {
    try {
      var dateSearchIter = DriveApp.searchFiles("title contains '" + targetDate + "' and trashed = false");
      while (dateSearchIter.hasNext()) {
        var df = dateSearchIter.next();
        if (df.getName().indexOf("计划") !== -1) addCandidate(df);
      }
    } catch(e) {}
  }

  if (candidateFiles.length === 0) return "";

  // 5. 智能权重评分与排序：最新修改与契合度最高的文件排在第一名
  candidateFiles.sort(function(a, b) {
    var scoreA = a.getLastUpdated().getTime();
    var scoreB = b.getLastUpdated().getTime();
    var nameA = a.getName();
    var nameB = b.getName();

    if (targetDate) {
      if (nameA.indexOf(targetDate) !== -1) scoreA += 10000000000000;
      if (nameB.indexOf(targetDate) !== -1) scoreB += 10000000000000;
    }
    if (nameA.indexOf("今日计划") !== -1) scoreA += 5000000000000;
    if (nameB.indexOf("今日计划") !== -1) scoreB += 5000000000000;

    return scoreB - scoreA;
  });

  // 6. 逐个提取文本内容，解析 Google Docs 并过滤 PDF 乱码
  for (var j = 0; j < candidateFiles.length; j++) {
    var targetFile = candidateFiles[j];
    var text = "";
    try {
      var mime = targetFile.getMimeType();
      if (mime === MimeType.GOOGLE_DOCS) {
        // 若为 Google Docs，尝试 Drive API 导出或 DocumentApp
        try {
          var exportUrl = "https://www.googleapis.com/drive/v3/files/" + targetFile.getId() + "/export?mimeType=text/plain";
          var res = UrlFetchApp.fetch(exportUrl, {
            headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
            muteHttpExceptions: true
          });
          if (res.getResponseCode() === 200) text = res.getContentText("utf-8");
        } catch(e1) {
          try {
            text = DocumentApp.openById(targetFile.getId()).getBody().getText();
          } catch(e2) {}
        }
      } else {
        // 普通纯文本 Markdown 文件
        text = targetFile.getBlob().getDataAsString("utf-8");
      }
      if (text) {
        text = text.trim();
        if (!text.startsWith("%PDF-") && !text.includes("/Producer (Skia/PDF") && text.length > 5) {
          return text;
        }
      }
    } catch(err) {}
  }

  return "";
}

// 1. 处理 GET 请求：从云盘拉取最新全量状态 + 自动提取《今日计划.md》
function doGet(e) {
  const folder = getOrCreateFolder();
  const targetDate = (e && e.parameter && e.parameter.date) ? e.parameter.date : "";

  // A. 读取全量状态 JSON
  const files = folder.getFilesByName("timemirror_state.json");
  let state = {};
  if (files.hasNext()) {
    try {
      state = JSON.parse(files.next().getBlob().getDataAsString("utf-8"));
    } catch(err) {}
  }

  // B. 🎯 核心增强：读取 Gemini 写入的《今日计划.md》(最新文件优先 + Google Docs 智能提取)
  const planMarkdown = readBestPlanContent(folder, targetDate);

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
