"use strict";

const serviceList = document.getElementById("services-list");
const serviceForm = document.getElementById("service-form");
const refreshButton = document.getElementById("refresh-button");
const themeToggle = document.getElementById("theme-toggle");
const searchInput = document.getElementById("search-input");
const clearSearchButton = document.getElementById("clear-search");
const searchBar = document.querySelector(".search-bar");
const totalServices = document.getElementById("total-services");
const healthyServices = document.getElementById("healthy-services");
const unhealthyServices = document.getElementById("unhealthy-services");
const serviceCount = document.getElementById("service-count");
const formMessage = document.getElementById("form-message");
const toast = document.getElementById("toast");
const systemStatus = document.getElementById("system-status-text");

const editModal = document.getElementById("edit-modal");
const editForm = document.getElementById("edit-form");
const editId = document.getElementById("edit-id");
const editName = document.getElementById("edit-name");
const editUrl = document.getElementById("edit-url");
const editMessage = document.getElementById("edit-message");
const saveEditButton = document.getElementById("save-edit");
const closeEditModalButton = document.getElementById("close-edit-modal");
const cancelEditButton = document.getElementById("cancel-edit");

let services = [];

function getTheme() {
    return document.documentElement.dataset.theme || "light";
}

function updateThemeButton() {
    const darkMode = getTheme() === "dark";
    themeToggle.setAttribute(
        "aria-label",
        darkMode ? "Switch to light mode" : "Switch to dark mode",
    );
    themeToggle.setAttribute(
        "title",
        darkMode ? "Switch to light mode" : "Switch to dark mode",
    );
    document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", darkMode ? "#0a0a0a" : "#f4f4f4");
}

function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("health-api-theme", theme);
    updateThemeButton();
}

themeToggle.addEventListener("click", () => {
    setTheme(getTheme() === "dark" ? "light" : "dark");
});
updateThemeButton();

async function fetchSystemStatus() {
    try {
        const response = await fetch("/ready", { cache: "no-store" });
        systemStatus.textContent = response.ok ? "System operational" : "System degraded";
    } catch {
        systemStatus.textContent = "System degraded";
    }
}

async function fetchServices() {
    try {
        const query = searchInput.value.trim();
        const params = new URLSearchParams({ limit: "100" });
        if (query) params.set("search", query);
        const response = await fetch(`/services?${params.toString()}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Failed to fetch services");
        services = await response.json();
        renderServices();
    } catch (error) {
        showToast("Unable to load services.");
        console.error(error);
    }
}

async function fetchStats() {
    try {
        const response = await fetch("/stats", { cache: "no-store" });
        if (!response.ok) throw new Error("Failed to fetch stats");
        const stats = await response.json();
        totalServices.textContent = stats.total;
        healthyServices.textContent = stats.healthy;
        unhealthyServices.textContent = stats.unhealthy;
    } catch (error) {
        console.error(error);
    }
}

function getFilteredServices() {
    return services;
}

function updateSearchUI() {
    searchBar.classList.toggle("has-value", searchInput.value.length > 0);
}

function statusView(service) {
    const status = service.last_status || "unknown";
    if (status === "healthy") return { className: "healthy", label: "Healthy" };
    if (status === "unhealthy") return { className: "unhealthy", label: "Unhealthy" };
    if (status === "blocked") return { className: "unhealthy", label: "Blocked" };
    if (status === "unreachable") return { className: "unhealthy", label: "Unreachable" };
    return { className: "", label: "Unknown" };
}

function renderServices() {
    serviceCount.textContent = services.length;
    const filteredServices = getFilteredServices();

    if (services.length === 0) {
        const searching = Boolean(searchInput.value.trim());
        serviceList.innerHTML = searching
            ? `
                <div class="empty-state">
                    <div class="empty-icon">⌕</div>
                    <h4>No matching services</h4>
                    <p>Try searching for a different name or URL.</p>
                </div>`
            : `
                <div class="empty-state">
                    <div class="empty-icon">—</div>
                    <h4>No services yet</h4>
                    <p>Add your first service to start monitoring it.</p>
                </div>`;
        return;
    }

    serviceList.innerHTML = filteredServices
        .map((service) => {
            const status = statusView(service);
            return `
                <article class="service-card" data-id="${escapeHtml(service.id)}">
                    <div class="service-info">
                        <h4 class="service-name">${escapeHtml(service.name)}</h4>
                        <p class="service-url">${escapeHtml(service.url)}</p>
                    </div>
                    <div class="health-status ${status.className}" id="status-${escapeHtml(service.id)}">
                        <span class="health-dot"></span>
                        <span>${status.label}</span>
                    </div>
                    <div class="service-actions">
                        <button class="icon-button" type="button" data-action="health" title="Run check" aria-label="Run health check for ${escapeHtml(service.name)}">↻</button>
                        <button class="icon-button" type="button" data-action="edit" title="Edit service" aria-label="Edit ${escapeHtml(service.name)}">✎</button>
                        <button class="icon-button delete" type="button" data-action="delete" title="Delete service" aria-label="Delete ${escapeHtml(service.name)}">×</button>
                    </div>
                </article>`;
        })
        .join("");
}

serviceList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const serviceCard = button.closest(".service-card");
    if (!serviceCard) return;
    const { id } = serviceCard.dataset;
    if (button.dataset.action === "health") void checkHealth(id);
    if (button.dataset.action === "edit") openEditModal(id);
    if (button.dataset.action === "delete") void deleteService(id);
});

async function checkHealth(id) {
    const statusElement = document.getElementById(`status-${id}`);
    if (statusElement) {
        statusElement.className = "health-status";
        statusElement.innerHTML = '<span class="health-dot"></span><span>Checking</span>';
    }

    try {
        const response = await fetch(`/services/${id}/check`, { method: "POST" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Health check failed");

        const service = services.find((item) => item.id === id);
        if (service) {
            service.last_status = data.status;
            service.last_status_code = data.statusCode;
            service.last_latency_ms = data.latencyMs;
            service.last_checked_at = data.checkedAt;
        }
        renderServices();
        await fetchStats();
    } catch (error) {
        showToast(error.message);
        await fetchServices();
    }
}

async function deleteService(id) {
    const service = services.find((item) => item.id === id);
    if (!service) return;
    if (!window.confirm(`Delete "${service.name}"? This cannot be undone.`)) return;

    try {
        const response = await fetch(`/services/${id}`, { method: "DELETE" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to delete service");
        showToast("Service deleted.");
        await Promise.all([fetchServices(), fetchStats()]);
    } catch (error) {
        showToast(error.message);
    }
}

serviceForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(serviceForm);
    const name = String(formData.get("name") || "").trim();
    const url = String(formData.get("url") || "").trim();
    formMessage.textContent = "";
    formMessage.className = "form-message";

    try {
        const response = await fetch("/services", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, url }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to add service");
        serviceForm.reset();
        showToast("Service added.");
        await Promise.all([fetchServices(), fetchStats()]);
    } catch (error) {
        formMessage.textContent = error.message;
        formMessage.className = "form-message error";
    }
});

function openEditModal(id) {
    const service = services.find((item) => item.id === id);
    if (!service) return;
    editId.value = service.id;
    editName.value = service.name;
    editUrl.value = service.url;
    editMessage.textContent = "";
    editModal.hidden = false;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => editName.focus());
}

function closeEditModal() {
    editModal.hidden = true;
    document.body.style.overflow = "";
    editForm.reset();
    editMessage.textContent = "";
    editMessage.className = "form-message";
}

closeEditModalButton.addEventListener("click", closeEditModal);
cancelEditButton.addEventListener("click", closeEditModal);
editModal.addEventListener("click", (event) => {
    if (event.target === editModal) closeEditModal();
});
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !editModal.hidden) closeEditModal();
});

editForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const id = editId.value;
    const name = editName.value.trim();
    const url = editUrl.value.trim();
    editMessage.textContent = "";
    saveEditButton.disabled = true;
    saveEditButton.textContent = "Saving…";

    try {
        const response = await fetch(`/services/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, url }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to update service");
        closeEditModal();
        showToast("Service updated.");
        await Promise.all([fetchServices(), fetchStats()]);
    } catch (error) {
        editMessage.textContent = error.message;
        editMessage.className = "form-message error";
    } finally {
        saveEditButton.disabled = false;
        saveEditButton.textContent = "Save changes";
    }
});

let searchTimer;
searchInput.addEventListener("input", () => {
    updateSearchUI();
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => void fetchServices(), 250);
});
clearSearchButton.addEventListener("click", () => {
    searchInput.value = "";
    updateSearchUI();
    void fetchServices();
    searchInput.focus();
});
refreshButton.addEventListener("click", async () => {
    refreshButton.disabled = true;
    const original = refreshButton.innerHTML;
    refreshButton.innerHTML = "Refreshing…";
    await Promise.all([fetchServices(), fetchStats(), fetchSystemStatus()]);
    refreshButton.innerHTML = original;
    refreshButton.disabled = false;
});

function showToast(message) {
    toast.textContent = message;
    toast.classList.add("visible");
    window.clearTimeout(showToast.timeout);
    showToast.timeout = window.setTimeout(() => toast.classList.remove("visible"), 3000);
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

void Promise.all([fetchServices(), fetchStats(), fetchSystemStatus()]);
