const cds = require("@sap/cds");
const axios = require("axios");
const { getCPIToken } = require("./cpi-auth");
require("dotenv").config();

const BASE_URL = process.env.CPI_BASE_URL;

// Helper to call CPI API
async function callCPI(path) {
  const token = await getCPIToken();

  const res = await axios.get(`${BASE_URL}/api/v1${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    }
  });

  return res.data;
}

module.exports = cds.service.impl(async function () {

  // ── getStatus ──────────────────────────────────────────
  this.on("getStatus", async () => {

    try {

      const data = await callCPI(
        "/MessageProcessingLogs?$format=json&$top=5"
      );

      return {
        success: true,
        data: data.d?.results || []
      };

    } catch (error) {

      console.error("❌ CPI Error:", error.message);

      return {
        success: false,
        error: error.message,
        details: error.response?.data || "No details"
      };

    }

  });

  // ── getSummary ──────────────────────────────────────────
  this.on("getSummary", async () => {

    const yesterday = new Date(Date.now() - 86400000)
      .toISOString()
      .split(".")[0];

    const statuses = ["COMPLETED", "FAILED", "PROCESSING", "RETRY"];

    const result = {
      TOTAL: 0,
      COMPLETED: 0,
      FAILED: 0,
      PROCESSING: 0,
      RETRY: 0
    };

    for (const s of statuses) {

      const d = await callCPI(
        `/MessageProcessingLogs?$format=json&$top=1` +
        `&$filter=LogStart gt datetime'${yesterday}' and Status eq '${s}'` +
        `&$inlinecount=allpages&$select=MessageGuid`
      );

      result[s] = parseInt(d.d?.__count || 0);

    }

    const total = await callCPI(
      `/MessageProcessingLogs?$format=json&$top=1` +
      `&$filter=LogStart gt datetime'${yesterday}'` +
      `&$inlinecount=allpages&$select=MessageGuid`
    );

    result.TOTAL = parseInt(total.d?.__count || 0);

    console.log("✅ Summary:", result);

    return JSON.stringify(result);

  });

  // ── getHourlyStats ────────────────────────────────────────
  this.on("getHourlyStats", async () => {

    const yesterday = new Date(Date.now() - 86400000)
      .toISOString()
      .split(".")[0];

    const d = await callCPI(
      `/MessageProcessingLogs?$format=json&$top=500` +
      `&$filter=LogStart gt datetime'${yesterday}'` +
      `&$select=LogStart,Status&$orderby=LogStart asc`
    );

    const results = d.d?.results || [];

    // Build 24 hourly buckets
    const now = Date.now();
    const buckets = [];

    for (let i = 23; i >= 0; i--) {
      const hourStart = now - i * 3600000;
      buckets.push({
        label: new Date(hourStart).getHours() + ":00",
        hourStart,
        hourEnd: hourStart + 3600000,
        count: 0
      });
    }

    results.forEach(m => {
      const match = m.LogStart && m.LogStart.match(/\/Date\((\d+)\)\//);
      if (!match) return;
      const ts = parseInt(match[1]);
      const bucket = buckets.find(b => ts >= b.hourStart && ts < b.hourEnd);
      if (bucket) bucket.count++;
    });

    console.log("✅ HourlyStats built:", buckets.filter(b => b.count > 0).length, "active hours");

    return JSON.stringify(buckets.map(b => ({ label: b.label, count: b.count })));

  });

  // ── getMessages ─────────────────────────────────────────
  this.on("getMessages", async (req) => {

    const { status, flow, top = 100 } = req.data;

    const yesterday = new Date(Date.now() - 86400000)
      .toISOString()
      .split(".")[0];

    const conditions = [`LogStart gt datetime'${yesterday}'`];

    if (status && status !== "ALL") {
      conditions.push(`Status eq '${status}'`);
    }

    if (flow) {
      conditions.push(`IntegrationFlowName eq '${flow}'`);
    }

    const filter = conditions.join(" and ");

    const d = await callCPI(
      `/MessageProcessingLogs?$format=json&$top=${top}` +
      `&$filter=${filter}&$orderby=LogStart desc`
    );

    const results = d.d?.results || [];

    console.log(`✅ Messages loaded: ${results.length}`);

    return JSON.stringify(results.map(m => ({
      MessageGuid: m.MessageGuid,
      IntegrationFlowName: m.IntegrationFlowName,
      Status: m.Status,
      LogStart: m.LogStart,
      LogEnd: m.LogEnd,
      Sender: m.Sender,
      Receiver: m.Receiver,
      AlternateWebLink: m.AlternateWebLink
    })));

  });

  // ── getErrorInfo ─────────────────────────────────────────
  this.on("getErrorInfo", async (req) => {

    const { guid } = req.data;

    const d = await callCPI(
      `/MessageProcessingLogs('${guid}')/ErrorInformation?$format=json`
    );

    return {
      ErrorMessage: d.d?.ErrorMessage || "No error info",
      LastErrorCode: d.d?.LastErrorCode || ""
    };

  });

  // ── getAttachments ───────────────────────────────────────
  this.on("getAttachments", async (req) => {

    const { guid } = req.data;

    const d = await callCPI(
      `/MessageProcessingLogs('${guid}')/Attachments?$format=json`
    );

    return (d.d?.results || []).map(a => ({
      Id: a.Id,
      Name: a.Name,
      ContentType: a.ContentType
    }));

  });

  // ── getFlows ─────────────────────────────────────────────
  this.on("getFlows", async () => {

    const yesterday = new Date(Date.now() - 86400000)
      .toISOString()
      .split(".")[0];

    const d = await callCPI(
      `/MessageProcessingLogs?$format=json&$top=500` +
      `&$filter=LogStart gt datetime'${yesterday}'` +
      `&$select=IntegrationFlowName`
    );

    const all = d.d?.results || [];

    const unique = [...new Set(all.map(m => m.IntegrationFlowName))];

    return unique.map(name => ({ name }));

  });

});