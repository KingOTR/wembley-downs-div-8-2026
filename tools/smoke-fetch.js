const https = require("https");

function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "wembley-smoke/1" } }, (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode, body: Buffer.concat(chunks), type: res.headers["content-type"] })
        );
      })
      .on("error", reject);
  });
}

(async () => {
  const base = "https://wembley-downs-div-8-2026.web.app";
  const htmlRes = await get(base + "/?t=" + Date.now());
  const logoRes = await get(base + "/wembley-downs-logo.png");
  const manifestRes = await get(base + "/manifest.json");

  const html = htmlRes.body.toString("utf8");
  const tagMatch = html.match(/tag=(v\d+)/);
  const expectedTag = tagMatch ? tagMatch[1] : "v138";
  const checks = {
    html200: htmlRes.status === 200,
    logo200: logoRes.status === 200,
    manifest200: manifestRes.status === 200,
    logoBytes: logoRes.body.length,
    hasLogoImg: html.includes('src="/wembley-downs-logo.png"'),
    hasLogoAlt: html.includes('alt="Wembley Downs Soccer Club logo"'),
    hasFavicon: html.includes('rel="icon"') && html.includes("/wembley-downs-logo.png"),
    hasAppleTouch: html.includes('rel="apple-touch-icon"'),
    hasManifestLink: html.includes('rel="manifest"'),
    hasPreloadLogo: html.includes('rel="preload"') && html.includes("/wembley-downs-logo.png"),
    hasVoteSection: html.includes('id="voteSection"'),
    hasShowAdminBtn: html.includes('id="showAdminBtn"'),
    hasVersionTag: html.includes("tag=" + expectedTag),
    fatalHiddenByDefault: html.includes('id="fatalBanner" style="display:none'),
  };

  const pass = Object.values(checks).every(Boolean);
  console.log(JSON.stringify({ pass, checks, logoContentType: logoRes.type }, null, 2));
  process.exit(pass ? 0 : 1);
})().catch((e) => {
  console.error("FETCH_FAIL", e.message);
  process.exit(1);
});
