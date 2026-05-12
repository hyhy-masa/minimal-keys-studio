// Google Apps Script — minimal-keys telemetry receiver
// Deploy: Execute as "Me", Access "Anyone"
// After deploy, set the URL in src/telemetry/telemetry-client.ts

const SPREADSHEET_ID = "YOUR_SPREADSHEET_ID_HERE";

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const items = Array.isArray(data) ? data : [data];
    let count = 0;
    items.forEach(function (item) {
      if (routePayload(ss, item)) count++;
    });
    return ContentService.createTextOutput(
      JSON.stringify({ status: "ok", count: count })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ status: "error", message: err.message })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

function routePayload(ss, item) {
  if (!item || !item.type) return false;
  if (!["event", "error", "keymap"].includes(item.type)) return false;
  if (!item.deviceId || !/^[0-9a-f-]{36}$/.test(item.deviceId)) return false;

  var sheetName = item.type + "s";
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    addHeaders(sheet, item.type);
  }

  switch (item.type) {
    case "event":
      sheet.appendRow([
        item.timestamp || "",
        item.deviceId || "",
        item.appVersion || "",
        item.name || "",
        item.payload ? JSON.stringify(item.payload) : "",
      ]);
      break;
    case "error":
      sheet.appendRow([
        item.timestamp || "",
        item.deviceId || "",
        item.appVersion || "",
        item.message || "",
        item.stack || "",
        item.componentStack || "",
      ]);
      break;
    case "keymap":
      sheet.appendRow([
        item.timestamp || "",
        item.deviceId || "",
        item.appVersion || "",
        item.trigger || "",
        item.keymapJson || "",
      ]);
      break;
  }
  return true;
}

function addHeaders(sheet, type) {
  switch (type) {
    case "event":
      sheet.appendRow([
        "timestamp",
        "deviceId",
        "appVersion",
        "name",
        "payload",
      ]);
      break;
    case "error":
      sheet.appendRow([
        "timestamp",
        "deviceId",
        "appVersion",
        "message",
        "stack",
        "componentStack",
      ]);
      break;
    case "keymap":
      sheet.appendRow([
        "timestamp",
        "deviceId",
        "appVersion",
        "trigger",
        "keymapJson",
      ]);
      break;
  }
}
