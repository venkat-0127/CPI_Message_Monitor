const axios = require("axios");
require("dotenv").config();

let cachedToken = null;
let tokenExpiry = 0;

async function getCPIToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry - 30000) return cachedToken;

  const params = new URLSearchParams();
  params.append("grant_type", "client_credentials");
  params.append("client_id", process.env.CPI_CLIENT_ID);
  params.append("client_secret", process.env.CPI_CLIENT_SECRET);

  const response = await axios.post(process.env.CPI_TOKEN_URL, params, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" }
  });

  cachedToken = response.data.access_token;
  tokenExpiry = now + response.data.expires_in * 1000;
  console.log("✅ CPI Token refreshed");
  return cachedToken;
}

module.exports = { getCPIToken };
