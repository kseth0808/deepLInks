import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { nanoid } from "nanoid";
import connectDB from "./db.js";
import DeepLink from "./model/DeepLink.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(helmet());
app.use(compression());
app.use(morgan("tiny"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

await connectDB();

const configPath = path.join(__dirname, "apps.config.json");
const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));

const getApp = (appId) => cfg.apps.find((a) => a.appId === appId);

const buildUniversalUrl = ({ appId, route = "/", params = {} }) => {
    const query = new URLSearchParams({ app: appId, r: route, ...params });
    return `https://${cfg.domain}/u/${appId}?${query.toString()}`;
};

const buildShortUrl = (id) => `https://${cfg.domain}/s/${id}`;
const uaIsMobile = (ua = "") => /iphone|ipad|ipod|android|mobile/i.test(ua);

app.get("/.well-known/apple-app-site-association", (req, res) => {
    const details = cfg.apps.map((app) => ({
        appIDs: [`${app.ios.teamId}.${app.ios.bundleId}`],
        components: app.ios.paths.map((p) => ({ "/": p })),
    }));
    const body = { applinks: { apps: [], details } };
    res.setHeader("Content-Type", "application/json");
    res.status(200).send(JSON.stringify(body));
});

app.get("/.well-known/assetlinks.json", (req, res) => {
    const targets = cfg.apps.map((app) => ({
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
            namespace: "android_app",
            package_name: app.android.package,
            sha256_cert_fingerprints: app.android.sha256CertFingerprints,
        },
    }));
    res.setHeader("Content-Type", "application/json");
    res.status(200).send(JSON.stringify(targets, null, 2));
});

app.post("/generate-link", async (req, res) => {
    const { appId, route = "/", params = {}, useShort = false } = req.body || {};
    const appCfg = getApp(appId);
    if (!appCfg) return res.status(400).json({ error: "Invalid appId" });
    const longUrl = buildUniversalUrl({ appId, route, params });
    if (!useShort) return res.json({ url: longUrl });
    const id = nanoid(8);
    try {
        await DeepLink.create({
            slug: id,
            appId,
            route,
            params,
        });
        return res.json({ url: buildShortUrl(id), longUrl });
    } catch (err) {
        console.log("Error saving deep link:", err);
        return res.status(500).json({ error: "Failed to save deep link" });
    }
});

app.get("/s/:id", async (req, res) => {
    try {
        const link = await DeepLink.findOne({ slug: req.params.id, isActive: true });
        if (!link) return res.status(404).send("Link not found");
        link.clicks.push({
            ip: req.ip,
            platform: req.headers["user-agent"] || "unknown",
        });
        await link.save();
        return res.redirect(302, buildUniversalUrl(link));
    } catch (err) {
        console.log("Error resolving short link:", err);
        return res.status(500).send("Internal Server Error");
    }
});

app.get("/u/:appId", (req, res) => {
    const ua = req.headers["user-agent"] || "";
    const appId = String(req.params.appId || "");
    const route = String(req.query.r || "/");
    const params = { ...req.query };
    delete params.r;
    const appCfg = getApp(appId);
    const fallbackBase = appCfg?.fallbackUrl || cfg.defaultFallback;
    const fallbackUrl = new URL(fallbackBase);
    fallbackUrl.searchParams.set("r", route);
    Object.entries(params).forEach(([k, v]) =>
        fallbackUrl.searchParams.set(k, String(v))
    );
    const isMobile = uaIsMobile(ua);
    if (!isMobile) {
        return res.redirect(fallbackUrl.toString());
    }
    res.setHeader("Content-Type", "text/html");
    res.status(200).send(`
        <!DOCTYPE html>
        <html>
        <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Opening…</title>
        <script>
        (function(){
            var isMobile = ${isMobile};
            var fallback = ${JSON.stringify(fallbackUrl.toString())};
            window.location.replace(fallback);
        })();
        </script>
        <style>
        html,body{height:100%;margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto}
        .wrap{height:100%;display:grid;place-items:center}
        </style>
        </head>
        <body>
        <div class="wrap">Redirecting…</div>
        </body>
        </html>
    `);
});

app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Deep link router listening on ${PORT}`);
});
