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
    const nextTheme = getTheme() === "dark" ? "light" : "dark";

    setTheme(nextTheme);
});

updateThemeButton();

async function fetchServices() {
    try {
        const response = await fetch("/services");

        if (!response.ok) {
            throw new Error("Failed to fetch services");
        }

        services = await response.json();

        renderServices();
        updateStats();
    } catch (error) {
        showToast("Unable to load services.");
        console.error(error);
    }
}

function getFilteredServices() {
    const query = searchInput.value.trim().toLowerCase();

    if (!query) {
        return services;
    }

    return services.filter((service) => {
        const name = String(service.name || "").toLowerCase();
        const url = String(service.url || "").toLowerCase();

        return name.includes(query) || url.includes(query);
    });
}

function updateSearchUI() {
    const hasValue = searchInput.value.length > 0;

    searchBar.classList.toggle("has-value", hasValue);
}

function renderServices() {
    serviceCount.textContent = services.length;

    if (services.length === 0) {
        serviceList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">—</div>
                <h4>No services yet</h4>
                <p>Add your first service to start monitoring it.</p>
            </div>
        `;

        updateStats();
        return;
    }

    const filteredServices = getFilteredServices();

    if (filteredServices.length === 0) {
        serviceList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">⌕</div>
                <h4>No matching services</h4>
                <p>
                    Try searching for a different name or URL.
                </p>
            </div>
        `;

        updateStats();
        return;
    }

    serviceList.innerHTML = filteredServices
        .map(
            (service) => `
                <article
                    class="service-card"
                    data-id="${escapeHtml(service.id)}"
                >
                    <div class="service-info">
                        <h4 class="service-name">
                            ${escapeHtml(service.name)}
                        </h4>

                        <p class="service-url">
                            ${escapeHtml(service.url)}
                        </p>
                    </div>

                    <div
                        class="health-status"
                        id="status-${escapeHtml(service.id)}"
                    >
                        <span class="health-dot"></span>
                        <span>Unknown</span>
                    </div>

                    <div class="service-actions">
                        <button
                            class="icon-button"
                            type="button"
                            data-action="health"
                            title="Check health"
                            aria-label="Check health of ${escapeHtml(service.name)}"
                        >
                            ↻
                        </button>

                        <button
                            class="icon-button"
                            type="button"
                            data-action="edit"
                            title="Edit service"
                            aria-label="Edit ${escapeHtml(service.name)}"
                        >
                            ✎
                        </button>

                        <button
                            class="icon-button delete"
                            type="button"
                            data-action="delete"
                            title="Delete service"
                            aria-label="Delete ${escapeHtml(service.name)}"
                        >
                            ×
                        </button>
                    </div>
                </article>
            `,
        )
        .join("");

    filteredServices.forEach((service) => {
        checkHealth(service.id);
    });
}

serviceList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");

    if (!button) {
        return;
    }

    const serviceCard = button.closest(".service-card");

    if (!serviceCard) {
        return;
    }

    const { id } = serviceCard.dataset;
    const action = button.dataset.action;

    if (action === "health") {
        checkHealth(id);
    }

    if (action === "edit") {
        openEditModal(id);
    }

    if (action === "delete") {
        deleteService(id);
    }
});

async function checkHealth(id) {
    const statusElement = document.getElementById(`status-${id}`);

    if (!statusElement) {
        return;
    }

    statusElement.className = "health-status";

    statusElement.innerHTML = `
        <span class="health-dot"></span>
        <span>Checking</span>
    `;

    updateStats();

    try {
        const response = await fetch(`/services/${id}/health`);

        if (!response.ok) {
            throw new Error("Health check failed");
        }

        const data = await response.json();
        const healthy = data.status === "healthy";

        statusElement.className = `health-status ${
            healthy ? "healthy" : "unhealthy"
        }`;

        statusElement.innerHTML = `
            <span class="health-dot"></span>
            <span>${healthy ? "Healthy" : "Unhealthy"}</span>
        `;
    } catch {
        statusElement.className = "health-status unhealthy";

        statusElement.innerHTML = `
            <span class="health-dot"></span>
            <span>Unreachable</span>
        `;
    }

    updateStats();
}

async function deleteService(id) {
    const service = services.find((item) => item.id === id);

    if (!service) {
        return;
    }

    const confirmed = window.confirm(
        `Delete "${service.name}"? This cannot be undone.`,
    );

    if (!confirmed) {
        return;
    }

    try {
        const response = await fetch(`/services/${id}`, {
            method: "DELETE",
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Failed to delete service");
        }

        showToast("Service deleted.");
        await fetchServices();
    } catch (error) {
        showToast(error.message);
    }
}

/* =========================
   Add service
========================= */

serviceForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(serviceForm);

    const name = formData.get("name").trim();
    const url = formData.get("url").trim();

    formMessage.textContent = "";
    formMessage.className = "form-message";

    try {
        const response = await fetch("/services", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                name,
                url,
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Failed to add service");
        }

        serviceForm.reset();

        showToast("Service added.");
        await fetchServices();
    } catch (error) {
        formMessage.textContent = error.message;
        formMessage.className = "form-message error";
    }
});

/* =========================
   Edit service
========================= */

function openEditModal(id) {
    const service = services.find((item) => item.id === id);

    if (!service) {
        return;
    }

    editId.value = service.id;
    editName.value = service.name;
    editUrl.value = service.url;

    editMessage.textContent = "";
    editMessage.className = "form-message";

    editModal.hidden = false;
    document.body.style.overflow = "hidden";

    window.requestAnimationFrame(() => {
        editName.focus();
    });
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
    if (event.target === editModal) {
        closeEditModal();
    }
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !editModal.hidden) {
        closeEditModal();
    }
});

editForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const id = editId.value;
    const name = editName.value.trim();
    const url = editUrl.value.trim();

    editMessage.textContent = "";
    editMessage.className = "form-message";

    if (!name || !url) {
        editMessage.textContent = "name and url are required";
        editMessage.className = "form-message error";
        return;
    }

    saveEditButton.disabled = true;
    saveEditButton.textContent = "Saving…";

    try {
        const response = await fetch(`/services/${id}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                name,
                url,
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Failed to update service");
        }

        closeEditModal();

        showToast("Service updated.");
        await fetchServices();
    } catch (error) {
        editMessage.textContent = error.message;
        editMessage.className = "form-message error";
    } finally {
        saveEditButton.disabled = false;
        saveEditButton.textContent = "Save changes";
    }
});

/* =========================
   Search
========================= */

searchInput.addEventListener("input", () => {
    updateSearchUI();
    renderServices();
});

clearSearchButton.addEventListener("click", () => {
    searchInput.value = "";
    updateSearchUI();
    renderServices();
    searchInput.focus();
});

/* =========================
   Refresh
========================= */

refreshButton.addEventListener("click", async () => {
    refreshButton.disabled = true;

    const originalContent = refreshButton.innerHTML;

    refreshButton.innerHTML = "Refreshing…";

    await fetchServices();

    refreshButton.innerHTML = originalContent;
    refreshButton.disabled = false;
});

/* =========================
   Statistics
========================= */

function updateStats() {
    const statuses = services.map((service) => {
        const element = document.getElementById(`status-${service.id}`);

        if (!element) {
            return null;
        }

        if (element.classList.contains("healthy")) {
            return true;
        }

        if (element.classList.contains("unhealthy")) {
            return false;
        }

        return null;
    });

    const healthy = statuses.filter(Boolean).length;
    const unhealthy = statuses.filter((status) => status === false).length;

    totalServices.textContent = services.length;
    healthyServices.textContent = healthy;
    unhealthyServices.textContent = unhealthy;
}

/* =========================
   Toast
========================= */

function showToast(message) {
    toast.textContent = message;
    toast.classList.add("visible");

    window.clearTimeout(showToast.timeout);

    showToast.timeout = window.setTimeout(() => {
        toast.classList.remove("visible");
    }, 3000);
}

/* =========================
   Utilities
========================= */

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

fetchServices();