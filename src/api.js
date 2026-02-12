const API_BASE =
  process.env.REACT_APP_API_BASE || "http://localhost:4000";

const getToken = () => localStorage.getItem("mlm_token");

const apiFetch = async (path, options = {}) => {
  const token = getToken();
  const headers = { ...(options.headers || {}) };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return fetch(`${API_BASE}${path}`, { ...options, headers });
};

const buildQuery = (params = {}) => {
  const cleaned = {};
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    cleaned[key] = value;
  });
  return new URLSearchParams(cleaned).toString();
};

const handleResponse = async (response) => {
  if (!response.ok) {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await response.json();
      throw new Error(data.error || "API request failed");
    }
    const message = await response.text();
    throw new Error(message || "API request failed");
  }
  return response.json();
};

export const login = async (payload) =>
  handleResponse(
    await apiFetch("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  );

export const fetchMe = async () =>
  handleResponse(await apiFetch("/auth/me"));

export const changePassword = async (payload) =>
  handleResponse(
    await apiFetch("/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  );

export const fetchUsers = async (params = {}) => {
  const query = buildQuery(params);
  const path = query ? `/users?${query}` : "/users";
  return handleResponse(await apiFetch(path));
};

export const createUser = async (payload) =>
  handleResponse(
    await apiFetch("/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  );

export const updateUser = async (id, payload) =>
  handleResponse(
    await apiFetch(`/users/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  );

export const fetchPeople = async () =>
  handleResponse(await apiFetch("/people"));

export const fetchSales = async () =>
  handleResponse(await apiFetch("/sales"));

export const fetchInvestments = async () =>
  handleResponse(await apiFetch("/investments"));

export const fetchPayments = async () =>
  handleResponse(await apiFetch("/payments"));

export const fetchCommissionPayments = async () =>
  handleResponse(await apiFetch("/commission-payments"));

export const fetchCommissionConfig = async () =>
  handleResponse(await apiFetch("/config"));

export const fetchCommissionConfigHistory = async () =>
  handleResponse(await apiFetch("/config/history"));

export const fetchProjects = async () =>
  handleResponse(await apiFetch("/projects"));

export const fetchProjectProperties = async (projectId, params = {}) => {
  const query = buildQuery(params);
  const path = query
    ? `/projects/${projectId}/properties?${query}`
    : `/projects/${projectId}/properties`;
  return handleResponse(await apiFetch(path));
};

export const fetchBlockProperties = async (blockId, params = {}) => {
  const query = buildQuery(params);
  const path = query
    ? `/blocks/${blockId}/properties?${query}`
    : `/blocks/${blockId}/properties`;
  return handleResponse(await apiFetch(path));
};

export const fetchPeopleLookup = async () =>
  handleResponse(await apiFetch("/people/lookup"));

export const fetchDashboardSummary = async () =>
  handleResponse(await apiFetch("/dashboard/summary"));

export const fetchPeopleSummary = async (params = {}) => {
  const query = buildQuery(params);
  const path = query ? `/people-summary?${query}` : "/people-summary";
  return handleResponse(await apiFetch(path));
};

export const fetchSalesSummary = async (params = {}) => {
  const query = buildQuery(params);
  const path = query ? `/sales-summary?${query}` : "/sales-summary";
  return handleResponse(await apiFetch(path));
};

export const fetchCustomers = async (params = {}) => {
  const query = buildQuery(params);
  const path = query ? `/customers?${query}` : "/customers";
  return handleResponse(await apiFetch(path));
};

export const fetchCustomerDetail = async (id) =>
  handleResponse(await apiFetch(`/customers/${id}`));

export const fetchInvestmentPayments = async (params = {}) => {
  const query = buildQuery(params);
  const path = query ? `/investment-payments?${query}` : "/investment-payments";
  return handleResponse(await apiFetch(path));
};

export const fetchCommissionSummary = async (params = {}) => {
  const query = buildQuery(params);
  const path = query
    ? `/commissions-summary?${query}`
    : "/commissions-summary";
  return handleResponse(await apiFetch(path));
};

export const fetchCommissionBalance = async (personId) => {
  const query = buildQuery({ personId });
  const path = query ? `/commissions/balance?${query}` : "/commissions/balance";
  return handleResponse(await apiFetch(path));
};

export const fetchPincodes = async (state, q) => {
  const query = buildQuery({ state, q });
  const path = query ? `/pincodes?${query}` : "/pincodes";
  return handleResponse(await apiFetch(path));
};

export const fetchEmployees = async () =>
  handleResponse(await apiFetch("/employees"));

export const createEmployee = async (payload) =>
  handleResponse(
    await apiFetch("/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  );

export const updateEmployee = async (id, payload) =>
  handleResponse(
    await apiFetch(`/employees/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  );

export const fetchSalaryPayments = async () =>
  handleResponse(await apiFetch("/salary-payments"));

export const createSalaryPayment = async (payload) =>
  handleResponse(
    await apiFetch("/salary-payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  );

export const updateCommissionConfig = async (payload) =>
  handleResponse(
    await apiFetch("/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  );

export const fetchActivityLogs = async (params = {}) => {
  const query = buildQuery(params);
  const path = query ? `/activity-logs?${query}` : "/activity-logs";
  return handleResponse(await apiFetch(path));
};

export const logActivity = async (payload) =>
  handleResponse(
    await apiFetch("/activity-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  );

export const undoActivity = async (id) =>
  handleResponse(
    await apiFetch(`/activity-logs/${id}/undo`, {
      method: "POST",
    })
  );

export const createPerson = async (payload) =>
  handleResponse(
    await apiFetch("/people", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  );

export const updatePerson = async (id, payload) =>
  handleResponse(
    await apiFetch(`/people/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  );

export const deletePerson = async (id) =>
  handleResponse(
    await apiFetch(`/people/${id}`, {
      method: "DELETE",
    })
  );

export const createInvestment = async (payload) =>
  handleResponse(
    await apiFetch("/investments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  );

export const updateInvestment = async (id, payload) =>
  handleResponse(
    await apiFetch(`/investments/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  );

export const createSale = async (payload) =>
  handleResponse(
    await apiFetch("/sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  );

export const updateSale = async (id, payload) =>
  handleResponse(
    await apiFetch(`/sales/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  );

export const fetchSaleDetail = async (id) =>
  handleResponse(await apiFetch(`/sales/${id}`));

export const createPayment = async (payload) =>
  handleResponse(
    await apiFetch("/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  );

export const createInvestmentPayment = async (payload) =>
  handleResponse(
    await apiFetch("/investment-payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  );

export const updateSaleBuyback = async (id, payload) =>
  handleResponse(
    await apiFetch(`/sales/${id}/buyback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  );

export const createCommissionPayment = async (payload) =>
  handleResponse(
    await apiFetch("/commission-payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  );

export const createProject = async (payload) =>
  handleResponse(
    await apiFetch("/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  );
