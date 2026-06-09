// Workaround: Turbopack + output:standalone ne génère pas middleware.js.nft.json
// Ce fichier est requis par Next.js pour finaliser le build standalone.
const fs = require("fs");
const path = require("path");

const nftPath = path.join(".next", "server", "middleware.js.nft.json");
if (!fs.existsSync(nftPath)) {
  console.log("⚑  Creating missing middleware.js.nft.json (Turbopack workaround)");
  fs.writeFileSync(nftPath, JSON.stringify({ version: 1, files: [] }));
}
