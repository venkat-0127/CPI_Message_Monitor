const cds = require("@sap/cds");
const axios = require("axios");
const { getCPIToken } = require("./cpi-auth");

require("dotenv").config();

const BASE_URL = process.env.CPI_BASE_URL;

// -----------------------------
// Helper: CPI API Call (OAuth Token from cpi-auth.js)
// -----------------------------
async function callCPI(path) {
    try {
        const token = await getCPIToken();

        const response = await axios.get(
            `${BASE_URL}/api/v1${path}`,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: "application/json"
                }
            }
        );

        return response.data;

    } catch (error) {
        console.error(
            "CPI API ERROR:",
            error.response?.status,
            error.response?.data || error.message
        );
        throw new Error(
            JSON.stringify(error.response?.data || error.message)
        );
    }
}

module.exports = cds.service.impl(async function () {

    // =========================================
    // GET ALL CPI MESSAGES
    // =========================================
    this.on("messages", async (req) => {
        try {
            const {
                status,
                top = 100,
                flow,
                fromDate
            } = req.data;

            const conditions = [];

            // Status filter
            if (status && status !== "ALL") {
                conditions.push(`Status eq '${status}'`);
            }

            // Flow filter
            if (flow) {
                conditions.push(`IntegrationFlowName eq '${flow}'`);
            }

            // Date filter
            if (fromDate) {
                conditions.push(`LogStart gt datetime'${fromDate}'`);
            } else {
                const yesterday = new Date(Date.now() - 86400000)
                    .toISOString()
                    .split(".")[0];
                conditions.push(`LogStart gt datetime'${yesterday}'`);
            }

            // Build filter query
            const filter = conditions.length > 0
                ? `&$filter=${conditions.join(" and ")}`
                : "";

            const data = await callCPI(
                `/MessageProcessingLogs?$format=json&$top=${top}${filter}&$orderby=LogStart desc`
            );

            return data.d?.results || [];

        } catch (error) {
            return { error: error.message };
        }
    });

    // =========================================
    // SUMMARY COUNTS
    // =========================================
    this.on("summary", async () => {
        try {
            const yesterday = new Date(Date.now() - 86400000)
                .toISOString()
                .split(".")[0];

            const statuses = [
                "COMPLETED",
                "FAILED",
                "PROCESSING",
                "RETRY"
            ];

            const results = {};

            for (const s of statuses) {
                const data = await callCPI(
                    `/MessageProcessingLogs?$format=json&$top=1&$filter=LogStart gt datetime'${yesterday}' and Status eq '${s}'&$inlinecount=allpages&$select=MessageGuid`
                );
                results[s] = parseInt(data.d?.__count || 0);
            }

            const totalData = await callCPI(
                `/MessageProcessingLogs?$format=json&$top=1&$filter=LogStart gt datetime'${yesterday}'&$inlinecount=allpages&$select=MessageGuid`
            );
            results["TOTAL"] = parseInt(totalData.d?.__count || 0);

            return results;

        } catch (error) {
            return { error: error.message };
        }
    });

    // =========================================
    // ERROR DETAILS
    // =========================================
    this.on("errorDetails", async (req) => {
        try {
            const { guid } = req.data;
            const data = await callCPI(
                `/MessageProcessingLogs('${guid}')/ErrorInformation?$format=json`
            );
            return data.d || {};
        } catch (error) {
            return { error: error.message };
        }
    });

    // =========================================
    // ATTACHMENTS
    // =========================================
    this.on("attachments", async (req) => {
        try {
            const { guid } = req.data;
            const data = await callCPI(
                `/MessageProcessingLogs('${guid}')/Attachments?$format=json`
            );
            return data.d?.results || [];
        } catch (error) {
            return { error: error.message };
        }
    });

    // =========================================
    // FLOWS
    // =========================================
    this.on("flows", async () => {
        try {
            const yesterday = new Date(Date.now() - 86400000)
                .toISOString()
                .split(".")[0];

            const data = await callCPI(
                `/MessageProcessingLogs?$format=json&$top=500&$filter=LogStart gt datetime'${yesterday}'&$select=IntegrationFlowName`
            );

            const all = data.d?.results || [];
            const unique = [
                ...new Set(all.map((m) => m.IntegrationFlowName))
            ];
            return unique.map((name) => ({ name }));

        } catch (error) {
            return { error: error.message };
        }
    });

});