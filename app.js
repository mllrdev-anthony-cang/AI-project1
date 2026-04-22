const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
});

const defaultProfiles = [
  { id: "admin", name: "Admin", accent: "#8b5cf6" },
];

const ui = {
  appShell: document.getElementById("appShell"),
  profileGate: document.getElementById("profileGate"),
  profileGateCopy: document.getElementById("profileGateCopy"),
  profileGrid: document.getElementById("profileGrid"),
  profileCardTemplate: document.getElementById("profileCardTemplate"),
  accessCodePanel: document.getElementById("accessCodePanel"),
  accessCodeAvatar: document.getElementById("accessCodeAvatar"),
  accessCodeCopy: document.getElementById("accessCodeCopy"),
  accessCodeForm: document.getElementById("accessCodeForm"),
  accessCodeInput: document.getElementById("accessCodeInput"),
  accessCodeBackButton: document.getElementById("accessCodeBackButton"),
  activeProfileCard: document.getElementById("activeProfileCard"),
  activeProfileAvatar: document.getElementById("activeProfileAvatar"),
  activeProfileName: document.getElementById("activeProfileName"),
  switchProfileButton: document.getElementById("switchProfileButton"),
  totalCredit: document.getElementById("totalCredit"),
  entryCount: document.getElementById("entryCount"),
  latestDate: document.getElementById("latestDate"),
  appStatus: document.getElementById("appStatus"),
  creditPanelHeader: document.getElementById("creditPanelHeader"),
  creditForm: document.getElementById("creditForm"),
  profileCodeForm: document.getElementById("profileCodeForm"),
  currentCodeInput: document.getElementById("currentCodeInput"),
  newCodeInput: document.getElementById("newCodeInput"),
  confirmCodeInput: document.getElementById("confirmCodeInput"),
  adminNotice: document.getElementById("adminNotice"),
  adminManagement: document.getElementById("adminManagement"),
  adminProfileList: document.getElementById("adminProfileList"),
  profileManagementForm: document.getElementById("profileManagementForm"),
  profileNameInput: document.getElementById("profileNameInput"),
  profileAccentInput: document.getElementById("profileAccentInput"),
  profileAccessCodeInput: document.getElementById("profileAccessCodeInput"),
  adminLedgerControls: document.getElementById("adminLedgerControls"),
  profileFilterSelect: document.getElementById("profileFilterSelect"),
  descriptionInput: document.getElementById("descriptionInput"),
  amountInput: document.getElementById("amountInput"),
  dateInput: document.getElementById("dateInput"),
  creditList: document.getElementById("creditList"),
  resetButton: document.getElementById("resetButton"),
  creditEntryTemplate: document.getElementById("creditEntryTemplate"),
};

const state = {
  profiles: defaultProfiles.slice(),
  credits: [],
  visibleCredits: [],
  loading: false,
  activeProfile: null,
  pendingProfile: null,
  adminFilter: "all",
};

function formatCurrency(amount) {
  return currencyFormatter.format(amount);
}

function formatDisplayDate(dateString) {
  if (!dateString) {
    return "No date";
  }

  const value = new Date(`${dateString}T00:00:00`);
  return value.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getProfileInitials(name) {
  return String(name || "CT")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

function normalizeAccessCode(code) {
  return String(code || "").replace(/\D/g, "").slice(0, 6);
}

function setStatus(message, tone = "neutral") {
  ui.appStatus.textContent = message;
  ui.appStatus.dataset.tone = tone;
}

function setDefaultDate() {
  if (!ui.dateInput.value) {
    ui.dateInput.value = new Date().toISOString().slice(0, 10);
  }
}

function getActiveProfileId() {
  return state.activeProfile?.id || "";
}

function isAdminProfile() {
  return getActiveProfileId() === "admin";
}

function getProfiles() {
  return state.profiles.slice();
}

function findProfile(profileId) {
  return getProfiles().find((profile) => profile.id === profileId) || null;
}

function getProfileName(profileId) {
  return findProfile(profileId)?.name || profileId || "Admin";
}

function buildApiPath(path) {
  const url = new URL(path, window.location.origin);
  if (getActiveProfileId()) {
    url.searchParams.set("profileId", getActiveProfileId());
  }
  return `${url.pathname}${url.search}`;
}

function getResetTargetProfileId() {
  if (!isAdminProfile()) {
    return getActiveProfileId();
  }

  return state.adminFilter === "all" ? "all" : state.adminFilter;
}

function getResetConfirmationMessage() {
  if (!isAdminProfile()) {
    return `Reset all credit entries for ${state.activeProfile?.name || "this profile"}?`;
  }

  if (state.adminFilter === "all") {
    return "Reset all credit entries for every profile?";
  }

  return `Reset all credit entries for ${getProfileName(state.adminFilter)}?`;
}

function syncProfiles(profiles = []) {
  state.profiles = Array.isArray(profiles) && profiles.length ? profiles : defaultProfiles.slice();

  if (state.activeProfile) {
    state.activeProfile = findProfile(state.activeProfile.id);
  }

  if (state.pendingProfile) {
    state.pendingProfile = findProfile(state.pendingProfile.id);
  }

  if (state.adminFilter !== "all" && !findProfile(state.adminFilter)) {
    state.adminFilter = "all";
  }
}

function applyCreditVisibility() {
  state.visibleCredits = isAdminProfile() && state.adminFilter !== "all"
    ? state.credits.filter((entry) => entry.profileId === state.adminFilter)
    : state.credits.slice();
}

function renderAdminFilterOptions() {
  ui.profileFilterSelect.innerHTML = '<option value="all">All Profiles</option>';

  getProfiles()
    .filter((profile) => profile.id !== "admin")
    .forEach((profile) => {
      const option = document.createElement("option");
      option.value = profile.id;
      option.textContent = profile.name;
      ui.profileFilterSelect.append(option);
    });

  ui.profileFilterSelect.value = state.adminFilter;
}

function renderProfiles() {
  ui.profileGrid.innerHTML = "";

  getProfiles().forEach((profile) => {
    const fragment = ui.profileCardTemplate.content.cloneNode(true);
    const button = fragment.querySelector(".profile-card");
    const avatar = fragment.querySelector(".profile-card__avatar");
    const name = fragment.querySelector(".profile-card__name");

    button.dataset.profileId = profile.id;
    button.setAttribute("aria-label", `Sign in as ${profile.name}`);
    button.style.setProperty("--profile-accent", profile.accent);
    avatar.textContent = getProfileInitials(profile.name);
    name.textContent = profile.name;

    ui.profileGrid.append(fragment);
  });
}

function getProfileEntryCount(profileId) {
  return state.credits.filter((entry) => entry.profileId === profileId).length;
}

function renderAdminManagement() {
  ui.adminProfileList.innerHTML = "";

  getProfiles().forEach((profile) => {
    const card = document.createElement("article");
    const isActive = state.activeProfile?.id === profile.id;
    const isFiltered = state.adminFilter === profile.id;
    const profileLabel = profile.id === "admin" ? "Administrator" : "Profile";
    const entryCount = profile.id === "admin" ? state.credits.length : getProfileEntryCount(profile.id);
    const removable = profile.id !== "admin";

    card.className = "admin-profile-card";
    card.style.setProperty("--profile-accent", profile.accent);

    const badgeMarkup = isActive
      ? '<span class="admin-profile-card__badge">Active</span>'
      : isFiltered
        ? '<span class="admin-profile-card__badge">Filtered</span>'
        : "";
    const removeMarkup = removable
      ? `<button class="ghost-button warning admin-profile-card__remove" type="button" data-remove-profile-id="${profile.id}">Remove</button>`
      : "";

    card.innerHTML = `
      <div class="admin-profile-card__header">
        <span class="admin-profile-card__avatar">${getProfileInitials(profile.name)}</span>
        <div>
          <h3>${profile.name}</h3>
          <p>${profileLabel}</p>
        </div>
        ${badgeMarkup}
      </div>
      <dl class="admin-profile-card__stats">
        <div>
          <dt>Credits</dt>
          <dd>${entryCount}</dd>
        </div>
        <div>
          <dt>Scope</dt>
          <dd>${profile.id === "admin" ? "All profiles" : "Own entries"}</dd>
        </div>
      </dl>
      <form class="admin-profile-code-form" data-profile-code-form="${profile.id}">
        <label class="field">
          <span>New 6-Digit Code</span>
          <input name="newCode" type="password" inputmode="numeric" pattern="\\d{6}" maxlength="6" placeholder="000000" required>
        </label>
        <button class="ghost-button" type="submit">Update Code</button>
      </form>
      ${removeMarkup}
    `;

    ui.adminProfileList.append(card);
  });
}

function renderAccessCodeStep() {
  const profile = state.pendingProfile;
  const hasPendingProfile = Boolean(profile);

  ui.profileGrid.hidden = hasPendingProfile;
  ui.profileGateCopy.hidden = hasPendingProfile;
  ui.accessCodePanel.hidden = !hasPendingProfile;

  if (!profile) {
    ui.accessCodeForm.reset();
    return;
  }

  ui.accessCodeAvatar.textContent = getProfileInitials(profile.name);
  ui.accessCodeAvatar.style.setProperty("--profile-accent", profile.accent);
  ui.accessCodeCopy.textContent = `Enter the 6-digit access code for ${profile.name}.`;
  ui.accessCodeInput.value = "";
  ui.accessCodeInput.focus();
}

function updateActiveProfileUi() {
  const profile = state.activeProfile;
  if (!profile) {
    return;
  }

  ui.activeProfileAvatar.textContent = getProfileInitials(profile.name);
  ui.activeProfileName.textContent = profile.name;
  ui.activeProfileCard.style.setProperty("--profile-accent", profile.accent);
}

function updateProfileModeUi() {
  const adminMode = isAdminProfile();
  ui.creditPanelHeader.hidden = adminMode;
  ui.creditForm.hidden = adminMode;
  ui.profileCodeForm.hidden = adminMode;
  ui.adminNotice.hidden = !adminMode;
  ui.adminManagement.hidden = !adminMode;
  ui.adminLedgerControls.hidden = !adminMode;
  ui.resetButton.hidden = !adminMode;

  if (adminMode) {
    renderAdminFilterOptions();
  }
}

function showProfileGate() {
  state.activeProfile = null;
  state.pendingProfile = null;
  state.credits = [];
  state.visibleCredits = [];
  state.adminFilter = "all";
  renderProfiles();
  renderAccessCodeStep();
  updateProfileModeUi();
  renderAdminManagement();
  renderCredits();
  renderMetrics();
  ui.appShell.hidden = true;
  ui.profileGate.hidden = false;
}

function openAccessCodeStep(profile) {
  state.pendingProfile = profile;
  renderAccessCodeStep();
}

function closeAccessCodeStep() {
  state.pendingProfile = null;
  renderAccessCodeStep();
}

function openAppForProfile(profile, payload) {
  state.activeProfile = profile;
  state.pendingProfile = null;
  state.adminFilter = "all";
  applyStatePayload(payload);
  updateActiveProfileUi();
  ui.profileGate.hidden = true;
  ui.appShell.hidden = false;
  setStatus(`Welcome back, ${profile.name}. Credit Tracker is ready.`, "success");
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
    },
    ...options,
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.error || "Request failed.");
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function applyStatePayload(payload) {
  syncProfiles(payload.profiles);
  state.credits = payload.credits || [];
  applyCreditVisibility();
  renderProfiles();
  renderAccessCodeStep();
  updateProfileModeUi();
  renderAdminManagement();
  renderCredits();
  renderMetrics();
}

function renderCredits() {
  ui.creditList.innerHTML = "";

  if (!state.visibleCredits.length) {
    ui.creditList.innerHTML = `<div class="empty-state">${
      isAdminProfile() && state.adminFilter !== "all"
        ? `No credit entries found for ${getProfileName(state.adminFilter)}.`
        : "No credit entries yet. Add your first item, amount, and date to begin tracking."
    }</div>`;
    return;
  }

  state.visibleCredits
    .slice()
    .sort((left, right) => {
      const dateCompare = right.date.localeCompare(left.date);
      if (dateCompare !== 0) {
        return dateCompare;
      }
      return right.createdAt.localeCompare(left.createdAt);
    })
    .forEach((entry) => {
      const fragment = ui.creditEntryTemplate.content.cloneNode(true);
      const ownerLabel = getProfileName(entry.profileId);
      const metaPrefix = isAdminProfile() ? `${ownerLabel} - ` : "";

      fragment.querySelector(".ledger-description").textContent = entry.description;
      fragment.querySelector(".ledger-meta").textContent = `${metaPrefix}${entry.id} - ${formatDisplayDate(entry.date)}`;
      fragment.querySelector(".ledger-amount").textContent = formatCurrency(entry.amount);

      ui.creditList.append(fragment);
    });
}

function renderMetrics() {
  const totalCredit = state.visibleCredits.reduce((sum, entry) => sum + entry.amount, 0);
  const latest = state.visibleCredits
    .slice()
    .sort((left, right) => right.date.localeCompare(left.date))[0];

  ui.totalCredit.textContent = formatCurrency(totalCredit);
  ui.entryCount.textContent = state.visibleCredits.length;
  ui.latestDate.textContent = latest ? formatDisplayDate(latest.date) : "No entries";
}

async function createCredit(event) {
  event.preventDefault();
  if (state.loading || isAdminProfile()) {
    return;
  }

  const description = ui.descriptionInput.value.trim();
  const amount = Number.parseFloat(ui.amountInput.value);
  const date = ui.dateInput.value;

  if (!description || !Number.isFinite(amount) || amount <= 0 || !date) {
    setStatus("Please complete description, amount, and date.", "danger");
    return;
  }

  state.loading = true;
  setStatus("Saving credit entry...", "neutral");

  try {
    const payload = await apiRequest("/api/credits", {
      method: "POST",
      body: JSON.stringify({
        description,
        amount,
        date,
        profileId: getActiveProfileId(),
      }),
    });

    applyStatePayload(payload);
    ui.creditForm.reset();
    setDefaultDate();
    setStatus(`Entry ${payload.credit.id} saved for ${state.activeProfile?.name || "your profile"}.`, "success");
  } catch (error) {
    setStatus(error.message || "Unable to save credit entry.", "danger");
  } finally {
    state.loading = false;
  }
}

async function resetTracker() {
  if (state.loading) {
    return;
  }

  const confirmed = window.confirm(getResetConfirmationMessage());
  if (!confirmed) {
    setStatus("Reset canceled.", "neutral");
    return;
  }

  state.loading = true;
  setStatus("Resetting tracker...", "neutral");

  try {
    const payload = await apiRequest("/api/reset", {
      method: "POST",
      body: JSON.stringify({
        profileId: getActiveProfileId(),
        targetProfileId: getResetTargetProfileId(),
      }),
    });

    applyStatePayload(payload);
    ui.creditForm.reset();
    setDefaultDate();
    setStatus(
      isAdminProfile()
        ? (state.adminFilter === "all"
            ? "Credit tracker reset for all profiles."
            : `Credit tracker reset for ${getProfileName(state.adminFilter)}.`)
        : `Credit tracker reset for ${state.activeProfile?.name || "this profile"}.`,
      "success"
    );
  } catch (error) {
    setStatus(error.message || "Reset failed.", "danger");
  } finally {
    state.loading = false;
  }
}

async function createProfile(event) {
  event.preventDefault();
  if (state.loading || !isAdminProfile()) {
    return;
  }

  const name = ui.profileNameInput.value.trim();
  const accent = ui.profileAccentInput.value;
  const accessCode = normalizeAccessCode(ui.profileAccessCodeInput.value);

  if (!name || accessCode.length !== 6) {
    setStatus("Profile name and a 6-digit access code are required.", "danger");
    return;
  }

  state.loading = true;
  setStatus("Adding profile...", "neutral");

  try {
    const payload = await apiRequest("/api/profiles", {
      method: "POST",
      body: JSON.stringify({
        profileId: getActiveProfileId(),
        name,
        accent,
        accessCode,
      }),
    });

    applyStatePayload(payload);
    ui.profileManagementForm.reset();
    ui.profileAccentInput.value = "#22c55e";
    setStatus(`Profile ${payload.profile.name} added.`, "success");
  } catch (error) {
    setStatus(error.message || "Unable to add profile.", "danger");
  } finally {
    state.loading = false;
  }
}

async function removeProfile(profileId) {
  if (state.loading || !isAdminProfile()) {
    return;
  }

  const profileName = getProfileName(profileId);
  const confirmed = window.confirm(`Remove profile ${profileName}? This will also delete its credit entries.`);
  if (!confirmed) {
    setStatus("Profile removal canceled.", "neutral");
    return;
  }

  state.loading = true;
  setStatus(`Removing ${profileName}...`, "neutral");

  try {
    const payload = await apiRequest("/api/profiles/remove", {
      method: "POST",
      body: JSON.stringify({
        profileId: getActiveProfileId(),
        targetProfileId: profileId,
      }),
    });

    applyStatePayload(payload);
    setStatus(`Profile ${profileName} removed.`, "success");
  } catch (error) {
    setStatus(error.message || "Unable to remove profile.", "danger");
  } finally {
    state.loading = false;
  }
}

async function updateOwnAccessCode(event) {
  event.preventDefault();
  if (state.loading || !state.activeProfile || isAdminProfile()) {
    return;
  }

  const currentCode = normalizeAccessCode(ui.currentCodeInput.value);
  const newCode = normalizeAccessCode(ui.newCodeInput.value);
  const confirmCode = normalizeAccessCode(ui.confirmCodeInput.value);

  if (currentCode.length !== 6 || newCode.length !== 6 || confirmCode.length !== 6) {
    setStatus("All access code fields must be exactly 6 digits.", "danger");
    return;
  }

  if (newCode !== confirmCode) {
    setStatus("New access code and confirmation must match.", "danger");
    return;
  }

  state.loading = true;
  setStatus("Updating access code...", "neutral");

  try {
    const payload = await apiRequest("/api/profile-code", {
      method: "POST",
      body: JSON.stringify({
        profileId: getActiveProfileId(),
        currentCode,
        newCode,
      }),
    });

    applyStatePayload(payload);
    ui.profileCodeForm.reset();
    setStatus("Access code updated.", "success");
  } catch (error) {
    setStatus(error.message || "Unable to update access code.", "danger");
  } finally {
    state.loading = false;
  }
}

async function updateManagedProfileCode(form) {
  if (state.loading || !isAdminProfile()) {
    return;
  }

  const targetProfileId = form.dataset.profileCodeForm;
  const input = form.querySelector('input[name="newCode"]');
  const newCode = normalizeAccessCode(input?.value);

  if (newCode.length !== 6) {
    setStatus("Access code must be exactly 6 digits.", "danger");
    return;
  }

  state.loading = true;
  setStatus(`Updating access code for ${getProfileName(targetProfileId)}...`, "neutral");

  try {
    const payload = await apiRequest("/api/profile-code", {
      method: "POST",
      body: JSON.stringify({
        profileId: getActiveProfileId(),
        targetProfileId,
        newCode,
      }),
    });

    applyStatePayload(payload);
    setStatus(`Access code updated for ${getProfileName(targetProfileId)}.`, "success");
  } catch (error) {
    setStatus(error.message || "Unable to update access code.", "danger");
  } finally {
    state.loading = false;
  }
}

async function submitAccessCode(event) {
  event.preventDefault();
  if (state.loading || !state.pendingProfile) {
    return;
  }

  const accessCode = normalizeAccessCode(ui.accessCodeInput.value);
  if (accessCode.length !== 6) {
    setStatus("Access code must be exactly 6 digits.", "danger");
    return;
  }

  state.loading = true;
  setStatus(`Unlocking ${state.pendingProfile.name}...`, "neutral");

  try {
    const payload = await apiRequest("/api/session", {
      method: "POST",
      body: JSON.stringify({
        profileId: state.pendingProfile.id,
        accessCode,
      }),
    });

    openAppForProfile(state.pendingProfile, payload);
    ui.accessCodeForm.reset();
  } catch (error) {
    setStatus(error.message || "Unable to unlock profile.", "danger");
    ui.accessCodeInput.select();
  } finally {
    state.loading = false;
  }
}

function handleProfileSelection(event) {
  const button = event.target.closest("[data-profile-id]");
  if (!button) {
    return;
  }

  const profile = findProfile(button.dataset.profileId);
  if (!profile) {
    return;
  }

  openAccessCodeStep(profile);
}

function handleAdminFilterChange() {
  state.adminFilter = ui.profileFilterSelect.value || "all";
  applyCreditVisibility();
  renderAdminManagement();
  renderCredits();
  renderMetrics();
}

function handleAdminManagementClick(event) {
  const button = event.target.closest("[data-remove-profile-id]");
  if (!button) {
    return;
  }

  removeProfile(button.dataset.removeProfileId);
}

function handleAdminManagementSubmit(event) {
  const form = event.target.closest("[data-profile-code-form]");
  if (!form) {
    return;
  }

  event.preventDefault();
  updateManagedProfileCode(form);
}

function loadInitialProfiles() {
  state.loading = true;
  setStatus("Loading profiles...", "neutral");

  apiRequest("/api/state?profileId=admin")
    .then((payload) => {
      syncProfiles(payload.profiles);
      renderProfiles();
      renderAccessCodeStep();
      updateProfileModeUi();
      renderAdminManagement();
      renderCredits();
      renderMetrics();
      setStatus("Choose a profile and enter its 6-digit access code.", "neutral");
    })
    .catch((error) => {
      renderProfiles();
      renderAccessCodeStep();
      updateProfileModeUi();
      renderAdminManagement();
      renderCredits();
      renderMetrics();
      setStatus(error.message || "Unable to load profiles.", "danger");
    })
    .finally(() => {
      state.loading = false;
    });
}

ui.profileGrid.addEventListener("click", handleProfileSelection);
ui.accessCodeForm.addEventListener("submit", submitAccessCode);
ui.accessCodeBackButton.addEventListener("click", closeAccessCodeStep);
ui.profileFilterSelect.addEventListener("change", handleAdminFilterChange);
ui.switchProfileButton.addEventListener("click", showProfileGate);
ui.creditForm.addEventListener("submit", createCredit);
ui.profileCodeForm.addEventListener("submit", updateOwnAccessCode);
ui.profileManagementForm.addEventListener("submit", createProfile);
ui.adminProfileList.addEventListener("click", handleAdminManagementClick);
ui.adminProfileList.addEventListener("submit", handleAdminManagementSubmit);
ui.resetButton.addEventListener("click", resetTracker);

setDefaultDate();
showProfileGate();
loadInitialProfiles();
