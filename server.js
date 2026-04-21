const http = require("http");
const fs = require("fs/promises");
const path = require("path");

const host = process.env.HOST || "127.0.0.1";
const port = Number.parseInt(process.env.PORT || "3000", 10);
const rootDir = __dirname;
const dataDir = path.join(rootDir, "data");
const storeFile = path.join(dataDir, "store.json");

const staticFiles = {
  "/": "index.html",
  "/index.html": "index.html",
  "/styles.css": "styles.css",
  "/app.js": "app.js",
};

const defaultProfiles = [
  { id: "admin", name: "Admin", accent: "#8b5cf6", accessCode: "000000" },
  { id: "maya", name: "Maya", accent: "#e50914", accessCode: "000000" },
  { id: "andre", name: "Andre", accent: "#1db954", accessCode: "000000" },
  { id: "sofia", name: "Sofia", accent: "#f5c518", accessCode: "000000" },
  { id: "guest", name: "Guest", accent: "#3b82f6", accessCode: "000000" },
];
const adminProfileId = "admin";
const protectedProfileIds = new Set(["admin", "guest"]);
const requiredProfiles = defaultProfiles.filter((profile) => protectedProfileIds.has(profile.id));

const defaultStore = {
  profiles: defaultProfiles,
  credits: [],
};

function normalizeProfileId(profileId) {
  const normalized = String(profileId || "").trim().toLowerCase();
  return /^[a-z0-9_-]+$/.test(normalized) ? normalized : "";
}

function normalizeAccessCode(accessCode, fallback = "000000") {
  const normalized = String(accessCode || "").trim();
  return /^\d{6}$/.test(normalized) ? normalized : fallback;
}

function sanitizeProfile(profile) {
  return {
    id: profile.id,
    name: profile.name,
    accent: profile.accent,
  };
}

function slugifyProfileName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeAccent(accent, fallback = "#3b82f6") {
  const normalized = String(accent || "").trim();
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized.toLowerCase() : fallback;
}

function normalizeProfile(profile) {
  const name = String(profile?.name || "").trim();
  const id = normalizeProfileId(profile?.id) || slugifyProfileName(name);

  if (!id || !name) {
    return null;
  }

  return {
    id,
    name,
    accent: normalizeAccent(profile?.accent),
    accessCode: normalizeAccessCode(profile?.accessCode),
  };
}

function ensureRequiredProfiles(profiles) {
  const normalizedProfiles = Array.isArray(profiles)
    ? profiles.map(normalizeProfile).filter(Boolean)
    : [];
  const profileMap = new Map(normalizedProfiles.map((profile) => [profile.id, profile]));

  requiredProfiles.forEach((profile) => {
    if (!profileMap.has(profile.id)) {
      profileMap.set(profile.id, profile);
    }
  });

  return Array.from(profileMap.values());
}

function normalizeStore(store) {
  const profiles = Array.isArray(store?.profiles)
    ? ensureRequiredProfiles(store.profiles)
    : defaultProfiles.slice();
  const knownProfileIds = new Set(profiles.map((profile) => profile.id));

  return {
    profiles,
    credits: Array.isArray(store?.credits)
      ? store.credits
          .map((credit) => ({
            ...credit,
            profileId: normalizeProfileId(credit.profileId) || "guest",
          }))
          .filter((credit) => knownProfileIds.has(credit.profileId))
      : [],
  };
}

async function ensureStore() {
  await fs.mkdir(dataDir, { recursive: true });

  try {
    await fs.access(storeFile);
    const existing = JSON.parse(await fs.readFile(storeFile, "utf8"));
    const normalized = normalizeStore(existing);
    if (!Array.isArray(existing.credits) || !Array.isArray(existing.profiles)) {
      await writeStore(normalized);
    }
  } catch {
    await writeStore(defaultStore);
  }
}

async function readStore() {
  await ensureStore();
  const raw = await fs.readFile(storeFile, "utf8");
  return normalizeStore(JSON.parse(raw));
}

async function writeStore(store) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(storeFile, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, message) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
  });
  response.end(message);
}

async function readRequestBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function buildCreditId(count, date) {
  const sequence = String(count + 1).padStart(3, "0");
  return `CR-${date.replaceAll("-", "")}-${sequence}`;
}

function isAdminProfile(profileId) {
  return profileId === adminProfileId;
}

function getProfileId(requestUrl, payload = {}) {
  const profileId = requestUrl.searchParams.get("profileId") || payload.profileId;
  const normalized = normalizeProfileId(profileId);

  if (!normalized) {
    throw new Error("Profile is required.");
  }

  return normalized;
}

function getTargetProfileId(payload = {}) {
  const targetProfileId = String(payload.targetProfileId || "").trim().toLowerCase();

  if (targetProfileId === "all") {
    return "all";
  }

  return normalizeProfileId(targetProfileId);
}

function normalizeCredit(payload) {
  const description = String(payload.description || "").trim();
  const amount = Number.parseFloat(payload.amount);
  const date = String(payload.date || "").trim();

  if (!description) {
    throw new Error("Item description is required.");
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Amount must be greater than zero.");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Date must use the YYYY-MM-DD format.");
  }

  return {
    description,
    amount: Number(amount.toFixed(2)),
    date,
  };
}

function normalizeNewProfile(payload, store) {
  const name = String(payload.name || "").trim();
  const accent = normalizeAccent(payload.accent, "#22c55e");
  const accessCode = normalizeAccessCode(payload.accessCode, "");

  if (!name) {
    throw new Error("Profile name is required.");
  }

  if (name.length > 24) {
    throw new Error("Profile name must be 24 characters or fewer.");
  }

  if (!accessCode) {
    throw new Error("Access code must be exactly 6 digits.");
  }

  const id = normalizeProfileId(payload.id) || slugifyProfileName(name);

  if (!id) {
    throw new Error("Profile name must include letters or numbers.");
  }

  if (store.profiles.some((profile) => profile.id === id)) {
    throw new Error("That profile already exists.");
  }

  return {
    id,
    name,
    accent,
    accessCode,
  };
}

function buildStatePayload(store, profileId) {
  return {
    profiles: store.profiles.map(sanitizeProfile),
    credits: isAdminProfile(profileId)
      ? store.credits
      : store.credits.filter((credit) => credit.profileId === profileId),
  };
}

function getStoredProfile(store, profileId) {
  const profile = store.profiles.find((item) => item.id === profileId);
  if (!profile) {
    throw new Error("Selected profile does not exist.");
  }
  return profile;
}

async function handleApi(request, response, requestUrl) {
  const pathname = requestUrl.pathname;

  if (request.method === "GET" && pathname === "/api/state") {
    const store = await readStore();
    const profileId = getProfileId(requestUrl);
    getStoredProfile(store, profileId);
    return sendJson(response, 200, buildStatePayload(store, profileId));
  }

  if (request.method === "POST" && pathname === "/api/session") {
    const payload = await readRequestBody(request);
    const store = await readStore();
    const profileId = getProfileId(requestUrl, payload);
    const profile = getStoredProfile(store, profileId);
    const accessCode = normalizeAccessCode(payload.accessCode, "");

    if (!accessCode || accessCode !== profile.accessCode) {
      throw new Error("Incorrect access code.");
    }

    return sendJson(response, 200, buildStatePayload(store, profileId));
  }

  if (request.method === "POST" && pathname === "/api/credits") {
    const payload = await readRequestBody(request);
    const store = await readStore();
    const normalized = normalizeCredit(payload);
    const profileId = getProfileId(requestUrl, payload);
    getStoredProfile(store, profileId);

    if (isAdminProfile(profileId)) {
      throw new Error("Admin profile cannot create credit entries.");
    }

    const credit = {
      id: buildCreditId(store.credits.length, normalized.date),
      ...normalized,
      profileId,
      createdAt: new Date().toISOString(),
    };

    store.credits.push(credit);
    await writeStore(store);

    return sendJson(response, 201, {
      credit,
      ...buildStatePayload(store, profileId),
    });
  }

  if (request.method === "POST" && pathname === "/api/reset") {
    const store = await readStore();
    const payload = await readRequestBody(request);
    const profileId = getProfileId(requestUrl, payload);
    getStoredProfile(store, profileId);
    const targetProfileId = getTargetProfileId(payload);
    const nextStore = {
      profiles: store.profiles,
      credits: isAdminProfile(profileId)
        ? (targetProfileId === "all"
            ? []
            : store.credits.filter((credit) => credit.profileId !== targetProfileId))
        : store.credits.filter((credit) => credit.profileId !== profileId),
    };

    await writeStore(nextStore);
    return sendJson(response, 200, buildStatePayload(nextStore, profileId));
  }

  if (request.method === "POST" && pathname === "/api/profiles") {
    const payload = await readRequestBody(request);
    const store = await readStore();
    const profileId = getProfileId(requestUrl, payload);

    if (!isAdminProfile(profileId)) {
      throw new Error("Only admin can add profiles.");
    }

    const nextProfile = normalizeNewProfile(payload, store);
    const nextStore = {
      profiles: [...store.profiles, nextProfile],
      credits: store.credits,
    };

    await writeStore(nextStore);
    return sendJson(response, 201, {
      profile: sanitizeProfile(nextProfile),
      ...buildStatePayload(nextStore, profileId),
    });
  }

  if (request.method === "POST" && pathname === "/api/profiles/remove") {
    const payload = await readRequestBody(request);
    const store = await readStore();
    const profileId = getProfileId(requestUrl, payload);
    const targetProfileId = normalizeProfileId(payload.targetProfileId);

    if (!isAdminProfile(profileId)) {
      throw new Error("Only admin can remove profiles.");
    }

    if (!targetProfileId) {
      throw new Error("Choose a profile to remove.");
    }

    if (protectedProfileIds.has(targetProfileId)) {
      throw new Error("That profile cannot be removed.");
    }

    getStoredProfile(store, targetProfileId);

    const nextStore = {
      profiles: store.profiles.filter((profile) => profile.id !== targetProfileId),
      credits: store.credits.filter((credit) => credit.profileId !== targetProfileId),
    };

    await writeStore(nextStore);
    return sendJson(response, 200, {
      removedProfileId: targetProfileId,
      ...buildStatePayload(nextStore, profileId),
    });
  }

  if (request.method === "POST" && pathname === "/api/profile-code") {
    const payload = await readRequestBody(request);
    const store = await readStore();
    const profileId = getProfileId(requestUrl, payload);
    const actingProfile = getStoredProfile(store, profileId);
    const targetProfileId = normalizeProfileId(payload.targetProfileId) || profileId;
    const targetProfile = getStoredProfile(store, targetProfileId);
    const currentCode = normalizeAccessCode(payload.currentCode, "");
    const newCode = normalizeAccessCode(payload.newCode, "");

    if (!newCode) {
      throw new Error("New access code must be exactly 6 digits.");
    }

    if (!isAdminProfile(profileId) && targetProfileId !== profileId) {
      throw new Error("You can only change your own access code.");
    }

    if (!isAdminProfile(profileId) && currentCode !== actingProfile.accessCode) {
      throw new Error("Current access code is incorrect.");
    }

    const nextStore = {
      profiles: store.profiles.map((profile) =>
        profile.id === targetProfile.id
          ? { ...profile, accessCode: newCode }
          : profile
      ),
      credits: store.credits,
    };

    await writeStore(nextStore);
    return sendJson(response, 200, buildStatePayload(nextStore, profileId));
  }

  if (request.method === "GET" && pathname === "/api/health") {
    return sendJson(response, 200, {
      status: "ok",
    });
  }

  return false;
}

async function serveStatic(response, pathname) {
  const fileName = staticFiles[pathname];
  if (!fileName) {
    return false;
  }

  const filePath = path.join(rootDir, fileName);
  const content = await fs.readFile(filePath);
  const contentType = fileName.endsWith(".css")
    ? "text/css; charset=utf-8"
    : fileName.endsWith(".js")
      ? "application/javascript; charset=utf-8"
      : "text/html; charset=utf-8";

  response.writeHead(200, {
    "Content-Type": contentType,
  });
  response.end(content);
  return true;
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || `${host}:${port}`}`);
    const apiHandled = await handleApi(request, response, url);
    if (apiHandled !== false) {
      return;
    }

    const staticHandled = await serveStatic(response, url.pathname);
    if (staticHandled) {
      return;
    }

    sendText(response, 404, "Not found");
  } catch (error) {
    sendJson(response, 500, {
      error: error.message || "Server error.",
    });
  }
});

ensureStore()
  .then(() => {
    server.listen(port, host, () => {
      console.log(`Credit Tracker server running at http://${host}:${port}`);
    });
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
