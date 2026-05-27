require("dotenv").config();
const cds = require("@sap/cds");
const path = require("path");

process.env.PORT = process.env.PORT || 4004;

cds.on("bootstrap", (app) => {
  console.log("✅ CPI Monitor CAP server bootstrapping...");
  console.log(`🚀 Server running on http://localhost:${process.env.PORT}`);

  // Serve UI5 resources locally to avoid CORB
  const ui5Path = path.join(__dirname, "node_modules/@openui5/sap.ui.core/");
  const express = require("express");
  try {
    app.use("/resources", express.static(
      path.join(__dirname, "node_modules/@sapui5/distribution-metadata")
    ));
  } catch(e) {
    console.log("UI5 local resources not available, using CDN");
  }
});

module.exports = cds.server;
