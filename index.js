// ================================================================
// GOOGLE APPS SCRIPT — Updated doGet()
// Paste this ENTIRE function into your Apps Script editor,
// replacing the existing doGet() function.
// Then: Deploy → Manage Deployments → New Deployment (or update)
// ================================================================

function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const action = e.parameter.action || "lead";

    // ─── CONVERSATION LOG (every user + bot message) ──────────
    if (action === "conversation") {
      let convSheet = ss.getSheetByName("Conversations");
      if (!convSheet) {
        convSheet = ss.insertSheet("Conversations");
        // Header row
        convSheet.appendRow(["Timestamp", "SenderID", "Role", "Message"]);
        convSheet.getRange(1, 1, 1, 4).setFontWeight("bold");
        convSheet.setColumnWidth(1, 160);
        convSheet.setColumnWidth(2, 140);
        convSheet.setColumnWidth(3, 60);
        convSheet.setColumnWidth(4, 500);
      }
      convSheet.appendRow([
        e.parameter.ts || new Date().toISOString(),
        e.parameter.senderId || "",
        e.parameter.role || "user",      // "user" or "bot"
        e.parameter.message || "",
      ]);
      return ContentService.createTextOutput("ok");
    }

    // ─── LEAD TRACKING (existing logic — keep as-is) ──────────
    // This is the existing sheet tab for funnel stage tracking.
    // Keep your existing lead-logging code below this line.
    // Example (replace with your actual existing code):

    let leadsSheet = ss.getSheetByName("Leads") || ss.getSheets()[0];
    leadsSheet.appendRow([
      new Date(),
      e.parameter.platform || "",
      e.parameter.senderId || "",
      e.parameter.name || "",
      e.parameter.stage || "",
      e.parameter.symptom || "",
      e.parameter.message || "",
      e.parameter.status || "",
    ]);

    return ContentService.createTextOutput("ok");

  } catch (err) {
    return ContentService.createTextOutput("error: " + err.message);
  }
}
