import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import {
  buildPeopleIndex,
  buildSalesIndex,
  calculateCommissionSummary,
  formatCurrency,
  formatDate,
  getDownlineDepth,
  getStageRecruitCount,
  getStageSummary,
  sumPayments,
} from "./utils/commission";
import {
  fetchCommissionPayments,
  fetchInvestments,
  fetchPayments,
  fetchPeople,
  fetchSales,
  fetchCommissionConfig,
  fetchCommissionConfigHistory,
  fetchProjects,
  fetchProjectProperties,
  fetchBlockProperties,
  fetchPeopleLookup,
  fetchDashboardSummary,
  fetchPeopleSummary,
  fetchSalesSummary,
  fetchCommissionSummary,
  fetchCommissionBalance,
  fetchPincodes,
  fetchEmployees,
  fetchSalaryPayments,
  fetchUsers,
  updateCommissionConfig,
  fetchActivityLogs,
  logActivity,
  undoActivity,
  createCommissionPayment,
  createInvestment,
  createPayment,
  createPerson,
  createSale,
  updateSale,
  fetchSaleDetail,
  updatePerson,
  updateInvestment,
  createProject,
  login,
  fetchMe,
  createUser,
  updateUser,
  changePassword,
  createEmployee,
  updateEmployee,
  createSalaryPayment,
} from "./api";

const stageTitles = {
  1: "Sales Officer",
  2: "Senior Sales Officer",
  3: "Sales Executive",
  4: "Sales Manager",
  5: "Senior Sales Manager",
  6: "Area Sales Manager",
  7: "Regional Sales Manager",
  8: "Zonal Sales Manager",
  9: "National Sales Director",
};

const indiaStates = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
];

const indiaUnionTerritories = [
  "Andaman and Nicobar Islands",
  "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Jammu and Kashmir",
  "Ladakh",
  "Lakshadweep",
  "Puducherry",
];

const indiaStatesSorted = [
  ...indiaStates,
  ...indiaUnionTerritories,
].sort((a, b) => a.localeCompare(b));

const SearchableSelect = ({
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  onSearch,
  loadingLabel,
  name,
  autoComplete = "off",
  onInputChange,
  onSelect,
  inputMode,
  maxLength,
}) => {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const wrapperRef = useRef(null);
  const dropdownRef = useRef(null);
  const lastQueryRef = useRef("");
  const lastScrollRef = useRef(0);

  useEffect(() => {
    if (focused) return;
    const match = options.find((opt) => opt.value === value);
    if (!match) {
      return;
    }
    setText(match.label);
  }, [value, options, focused, text]);

  useEffect(() => {
    if (!onSearch) return;
    if (!focused || !open) return;
    const handle = setTimeout(() => {
      onSearch(text);
    }, 300);
    return () => clearTimeout(handle);
  }, [text, onSearch, focused, open]);

  useEffect(() => {
    lastQueryRef.current = text;
    lastScrollRef.current = 0;
  }, [text]);

  const filtered = onSearch
    ? options
    : options.filter((opt) =>
        opt.label.toLowerCase().includes(text.toLowerCase())
      );

  const handleSelect = (opt) => {
    onChange(opt.value);
    setText(opt.label);
    setOpen(false);
    setFocused(false);
    if (onSelect) {
      onSelect(opt.value, opt);
    }
  };

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target)) {
        setOpen(false);
        setFocused(false);
        const exact = options.find(
          (opt) => opt.label.toLowerCase() === text.toLowerCase()
        );
        if (exact && exact.value !== value) {
          onChange(exact.value);
          setText(exact.label);
          return;
        }
        if (!exact && value) {
          setText(String(value));
          return;
        }
        if (!exact) {
          onChange("");
          setText("");
        }
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, options, text, value, onChange]);

  useLayoutEffect(() => {
    if (!open) return;
    const dropdown = dropdownRef.current;
    if (!dropdown) return;
    dropdown.scrollTop = lastScrollRef.current;
  }, [open, filtered]);

  return (
    <div className="searchable-select" ref={wrapperRef}>
      <input
        className="table-search"
        name={name}
        autoComplete={autoComplete}
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        inputMode={inputMode}
        maxLength={maxLength}
        placeholder={placeholder}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setOpen(true);
          if (onInputChange) {
            onInputChange(event.target.value);
          }
        }}
        onFocus={() => {
          setFocused(true);
          setOpen(true);
        }}
        onClick={() => setOpen(true)}
        disabled={disabled}
      />
      {open && (
        <div
          className="select-dropdown"
          ref={dropdownRef}
          onScroll={(event) => {
            lastScrollRef.current = event.currentTarget.scrollTop;
          }}
        >
          {filtered.length ? (
            filtered.map((opt) => (
              <button
                key={opt.value || opt.label}
                type="button"
                className="select-option"
                onClick={() => handleSelect(opt)}
              >
                {opt.label}
              </button>
            ))
          ) : (
            <div className="select-empty">
              {loadingLabel || (text ? "No matches" : "Type to search")}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

function App() {
  const [activeView, setActiveView] = useState("dashboard");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [people, setPeople] = useState([]);
  const [sales, setSales] = useState([]);
  const [projects, setProjects] = useState([]);
  const [projectBlocks, setProjectBlocks] = useState([]);
  const [projectProperties, setProjectProperties] = useState([]);
  const [projectDetailProperties, setProjectDetailProperties] = useState([]);
  const [projectDetailLoading, setProjectDetailLoading] = useState(false);
  const [projectDetailError, setProjectDetailError] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [commissionPayments, setCommissionPayments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [salaryPayments, setSalaryPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [commissionConfig, setCommissionConfig] = useState({
    levelRates: [200, 150, 100, 50, 50, 50, 50, 25, 25],
    personalRates: [200, 300, 400, 500, 600, 700, 800, 900, 1000],
  });
  const [commissionConfigHistory, setCommissionConfigHistory] = useState([]);
  const [configSnapshot, setConfigSnapshot] = useState(null);
  const [configShake, setConfigShake] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [configEditing, setConfigEditing] = useState(false);
  const [configAppliedMsg, setConfigAppliedMsg] = useState("");
  const [users, setUsers] = useState([]);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [editingUserId, setEditingUserId] = useState("");
  const [userForm, setUserForm] = useState({
    username: "",
    password: "",
    role: "Staff",
    permissions: [],
  });
  const [userFormError, setUserFormError] = useState("");
  const [editUserForm, setEditUserForm] = useState({
    role: "",
    permissions: [],
    password: "",
    active: true,
  });
  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [showSalaryModal, setShowSalaryModal] = useState(false);
  const [editingEmployeeId, setEditingEmployeeId] = useState("");
  const [employeeForm, setEmployeeForm] = useState({
    name: "",
    role: "",
    phone: "",
    joinDate: "",
    monthlySalary: "",
  });
  const [employeeFormError, setEmployeeFormError] = useState("");
  const [salaryForm, setSalaryForm] = useState({
    employeeId: "",
    month: "",
    amount: "",
    paidDate: "",
  });
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [employeePage, setEmployeePage] = useState(1);
  const [accountForm, setAccountForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [accountError, setAccountError] = useState("");
  const [accountSuccess, setAccountSuccess] = useState("");
  const [treeSearch, setTreeSearch] = useState("");
  const [treeStageFilter, setTreeStageFilter] = useState("all");
  const [treeScale, setTreeScale] = useState(1);
  const [treeOffset, setTreeOffset] = useState({ x: 0, y: 0 });
  const [treeDragging, setTreeDragging] = useState(false);
  const [treeDragStart, setTreeDragStart] = useState({ x: 0, y: 0 });

  const [profileTreeSearch, setProfileTreeSearch] = useState("");
  const [profileTreeStageFilter, setProfileTreeStageFilter] = useState("all");
  const [profileTreeScale, setProfileTreeScale] = useState(1);
  const [profileTreeOffset, setProfileTreeOffset] = useState({ x: 0, y: 0 });
  const [profileTreeDragging, setProfileTreeDragging] = useState(false);
  const [profileTreeDragStart, setProfileTreeDragStart] = useState({ x: 0,
    y: 0,
  });

  const addNotification = (message) => {
    const id = `${Date.now()}-${Math.random()}`;
    setNotifications((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setNotifications((prev) => prev.filter((item) => item.id !== id));
    }, 5000);
  };

  const configShakeTimer = useRef(null);
  const triggerConfigShake = useCallback(() => {
    setConfigShake(true);
    if (configShakeTimer.current) {
      clearTimeout(configShakeTimer.current);
    }
    configShakeTimer.current = setTimeout(() => {
      setConfigShake(false);
    }, 600);
  }, []);

  const requestViewChange = useCallback(
    (nextView) => {
      if (configEditing && nextView !== "settings") {
        triggerConfigShake();
        return;
      }
      setActiveView(nextView);
    },
    [configEditing, triggerConfigShake]
  );

  const hasPermission = useCallback(
    (perm) => {
      if (!authUser) return false;
      const perms = authUser.permissions || [];
      if (perms.includes("*")) return true;
      return perms.includes(perm);
    },
    [authUser]
  );

  const canSeeCommission = hasPermission("commissions:read");
  const renderCommission = (value) =>
    canSeeCommission ? formatCurrency(value) : "Restricted";

  const navItems = useMemo(() => {
    const items = [
      { id: "dashboard", label: "Dashboard", permission: "dashboard:read" },
      { id: "people", label: "People", permission: "people:read" },
      { id: "employees", label: "Employees", permission: "employees:read" },
      { id: "projects", label: "Projects", permission: "projects:read" },
      { id: "orgTree", label: "Organization Tree", permission: "orgtree:read" },
      { id: "sales", label: "Property Sales", permission: "sales:read" },
      { id: "commissions", label: "Commissions", permission: "commissions:read" },
      { id: "buybacks", label: "Buybacks", permission: "buybacks:read" },
      { id: "reports", label: "Reports", permission: "reports:read" },
      { id: "activity", label: "Activity History", permission: "activity:read" },
      { id: "profile", label: "Individual Profile", permission: "profile:read" },
      { id: "users", label: "User Access", permission: "users:manage" },
      { id: "settings", label: "Settings", permission: "settings:read" },
      { id: "account", label: "My Account" },
    ];
    return items.filter(
      (item) => !item.permission || hasPermission(item.permission)
    );
  }, [authUser]);

  const permissionOptions = [
    { id: "dashboard:read", label: "View Dashboard" },
    { id: "people:read", label: "View People" },
    { id: "people:write", label: "Manage People" },
    { id: "projects:read", label: "View Projects" },
    { id: "projects:write", label: "Manage Projects" },
    { id: "orgtree:read", label: "View Organization Tree" },
    { id: "profile:read", label: "View Individual Profile" },
    { id: "sales:read", label: "View Property Sales" },
    { id: "sales:write", label: "Manage Property Sales" },
    { id: "commissions:read", label: "View Commissions" },
    { id: "commissions:write", label: "Record Commissions" },
    { id: "buybacks:read", label: "View Buybacks" },
    { id: "buybacks:write", label: "Manage Buybacks" },
    { id: "reports:read", label: "View Reports" },
    { id: "activity:read", label: "View Activity History" },
    { id: "activity:write", label: "Undo Activity" },
    { id: "settings:read", label: "View Settings" },
    { id: "settings:write", label: "Edit Settings" },
    { id: "users:manage", label: "Manage Users" },
    { id: "employees:read", label: "View Employees" },
    { id: "employees:write", label: "Manage Employees" },
  ];

  useEffect(() => {
    if (!navItems.length) return;
    const allowedIds = navItems.map((item) => item.id);
    if (!allowedIds.includes(activeView)) {
      const preferred =
        allowedIds.includes("dashboard")
          ? "dashboard"
          : allowedIds[0];
      setActiveView(preferred);
    }
  }, [navItems, activeView]);

  useEffect(() => {
    if (!authUser || !navItems.length) return;
    const allowedIds = navItems.map((item) => item.id);
    const preferred = allowedIds.includes("dashboard")
      ? "dashboard"
      : allowedIds[0];
    setActiveView(preferred);
  }, [authUser, navItems]);


  const openPropertyDetail = (propertyId) => {
    if (!propertyId) return;
    setSelectedPropertyId(propertyId);
    setShowProjectDetailModal(false);
    setShowPropertyDetailModal(true);
  };

  const mergeProperties = useCallback((incoming) => {
    if (!incoming?.length) return;
    setProjectProperties((prev) => {
      const map = new Map(prev.map((prop) => [prop.id, prop]));
      incoming.forEach((prop) => {
        map.set(prop.id, prop);
      });
      return Array.from(map.values());
    });
  }, []);

  const loadProjectDetailProperties = useCallback(
    async (projectId) => {
      if (!projectId) return;
      setProjectDetailLoading(true);
      setProjectDetailError("");
      try {
        const data = await fetchProjectProperties(projectId, { status: "all" });
        const props = data.properties || [];
        setProjectDetailProperties(props);
        mergeProperties(props);
      } catch (err) {
        console.error(err);
        setProjectDetailProperties([]);
        setProjectDetailError("Unable to load project properties.");
      } finally {
        setProjectDetailLoading(false);
      }
    },
    [mergeProperties]
  );

  const openProjectDetail = (projectId) => {
    if (!projectId) return;
    setSelectedProjectId(projectId);
    setShowPropertyDetailModal(false);
    setShowProjectDetailModal(true);
    setProjectDetailProperties([]);
    setProjectDetailLoading(true);
    setProjectDetailError("");
    ensureProjectProperties(projectId, "all", true);
    loadProjectDetailProperties(projectId);
  };



  const openPersonProfile = (personId) => {
    if (!personId) return;
    const go = async () => {
      if (!hasPermission("profile:read")) {
        addNotification("You don't have access to Individual Profile.");
        return;
      }
      if (!fullDataLoaded) {
        await loadData();
      }
      setSelectedPersonId(personId);
      requestViewChange("profile");
      setShowPropertyDetailModal(false);
      setShowProjectDetailModal(false);
    };
    go();
  };

  const ensureProjectProperties = useCallback(
    async (projectId, status = "all", force = false) => {
      if (!projectId) return;
      const hasProps = projectProperties.some(
        (prop) => prop.project_id === projectId
      );
      const needsEnrichment = projectProperties.some(
        (prop) =>
          prop.project_id === projectId &&
          ((prop.last_investment_id &&
            !prop.last_investment_person_name &&
            !prop.last_investment_person_id) ||
            (prop.last_sale_id &&
              !prop.last_sale_seller_name &&
              !prop.last_sale_seller_id))
      );
      if (
        !force &&
        loadedProjectIds.includes(projectId) &&
        status === "all" &&
        hasProps &&
        !needsEnrichment
      ) {
        return;
      }
      try {
        const data = await fetchProjectProperties(projectId, { status });
        mergeProperties(data.properties || []);
        if (status === "all") {
          setLoadedProjectIds((prev) =>
            prev.includes(projectId) ? prev : [...prev, projectId]
          );
        }
      } catch (err) {
        console.error(err);
      }
    },
    [projectProperties, loadedProjectIds, mergeProperties]
  );

  const ensureBlockProperties = useCallback(
    async (blockId, status = "available") => {
      if (!blockId) return;
      const hasProps = projectProperties.some(
        (prop) => prop.block_id === blockId
      );
      if (loadedBlockIds.includes(`${blockId}:${status}`) && hasProps) return;
      try {
        const data = await fetchBlockProperties(blockId, { status });
        mergeProperties(data.properties || []);
        setLoadedBlockIds((prev) =>
          prev.includes(`${blockId}:${status}`)
            ? prev
            : [...prev, `${blockId}:${status}`]
        );
      } catch (err) {
        console.error(err);
      }
    },
    [projectProperties, loadedBlockIds, mergeProperties]
  );

  const getMonthKey = (date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

  const getMonthStart = (date) => new Date(date.getFullYear(), date.getMonth(), 1);

  const getMonthEnd = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0);

  const getNextMonthReleaseDate = (monthKey) => {
    const [year, month] = monthKey.split("-").map(Number);
    return new Date(year, month, 7, 9, 0, 0);
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setAuthError("");
    try {
      const response = await login(loginForm);
      localStorage.setItem("mlm_token", response.token);
      setAuthUser(response.user);
      setLoginForm({ username: "", password: "" });
    } catch (err) {
      setAuthError("Invalid username or password.");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("mlm_token");
    setAuthUser(null);
    setPeople([]);
    setSales([]);
    setProjects([]);
    setProjectBlocks([]);
    setProjectProperties([]);
    setLoadedProjectIds([]);
    setLoadedBlockIds([]);
    setCommissionPayments([]);
    setEmployees([]);
    setSalaryPayments([]);
    setActivityLogs([]);
    setActivityTotal(0);
    setActivityActionOptions([]);
    setActivityEntityOptions([]);
    setUsers([]);
    setUsersTotal(0);
    setFullDataLoaded(false);
    setActiveView("dashboard");
  };

  const handleCreateUser = async (event) => {
    event.preventDefault();
    setUserFormError("");
    if (!userForm.username || !userForm.password || !userForm.role) {
      setUserFormError("All fields are required.");
      return;
    }
    if (!userForm.permissions.length) {
      setUserFormError("Select at least one permission.");
      return;
    }
    try {
      await createUser({
        username: userForm.username.trim(),
        password: userForm.password,
        role: userForm.role,
        permissions: userForm.permissions,
      });
      const refreshed = await fetchUsers({
        limit: 10,
        offset: (usersPage - 1) * 10,
      });
      setUsers(refreshed.rows || []);
      setUsersTotal(refreshed.total || 0);
      setShowUserModal(false);
      setUserForm({
        username: "",
        password: "",
        role: "Staff",
        permissions: [],
      });
      addNotification("User created successfully.");
    } catch (err) {
      console.error(err);
      setUserFormError("Failed to create user.");
    }
  };

  const openEditUser = (user) => {
    setEditingUserId(user.id);
    setEditUserForm({
      role: user.role,
      permissions: user.permissions || [],
      password: "",
      active: user.active !== 0,
    });
    setUserFormError("");
    setShowEditUserModal(true);
  };

  const handleUpdateUser = async (event) => {
    event.preventDefault();
    setUserFormError("");
    if (!editingUserId) return;
    if (!editUserForm.role) {
      setUserFormError("Role is required.");
      return;
    }
    if (!editUserForm.permissions.length) {
      setUserFormError("Select at least one permission.");
      return;
    }
    try {
      await updateUser(editingUserId, {
        role: editUserForm.role,
        permissions: editUserForm.permissions,
        password: editUserForm.password || undefined,
        active: !!editUserForm.active,
      });
      const refreshed = await fetchUsers({
        limit: 10,
        offset: (usersPage - 1) * 10,
      });
      setUsers(refreshed.rows || []);
      setUsersTotal(refreshed.total || 0);
      setShowEditUserModal(false);
      setEditingUserId("");
      setEditUserForm({ role: "", permissions: [], password: "", active: true });
      addNotification("User updated successfully.");
    } catch (err) {
      console.error(err);
      setUserFormError("Failed to update user.");
    }
  };

  const handleChangePassword = async (event) => {
    event.preventDefault();
    setAccountError("");
    setAccountSuccess("");
    if (
      !accountForm.currentPassword ||
      !accountForm.newPassword ||
      !accountForm.confirmPassword
    ) {
      setAccountError("All fields are required.");
      return;
    }
    if (accountForm.newPassword !== accountForm.confirmPassword) {
      setAccountError("New passwords do not match.");
      return;
    }
    try {
      await changePassword({
        currentPassword: accountForm.currentPassword,
        newPassword: accountForm.newPassword,
      });
      setAccountForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setAccountSuccess("Password updated successfully.");
      addNotification("Password updated.");
    } catch (err) {
      console.error(err);
      setAccountError("Failed to update password.");
    }
  };

  const handleExportCsv = (filename, rows) => {
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const escape = (value) =>
      `"${String(value ?? "")
        .replace(/"/g, '""')
        .replace(/\n/g, " ")}"`;
    const csv = [
      headers.join(","),
      ...rows.map((row) => headers.map((key) => escape(row[key])).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    logActivity({
      action_type: "EXPORT_CSV",
      entity_type: "export",
      entity_id: filename,
      payload: { rows: rows.length },
    }).catch(() => {});
    addNotification(`Exported ${filename}`);
  };

  const handleExportPrint = (title, rows) => {
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;
    const headers = rows.length ? Object.keys(rows[0]) : [];
    win.document.write("<html><head><title>" + title + "</title>");
    win.document.write(
      "<style>body{font-family:Arial;padding:24px;}table{width:100%;border-collapse:collapse;}th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left;font-size:12px;}h1{font-size:20px;}</style>"
    );
    win.document.write("</head><body>");
    win.document.write("<h1>" + title + "</h1>");
    win.document.write("<table><thead><tr>");
    headers.forEach((header) => win.document.write("<th>" + header + "</th>"));
    win.document.write("</tr></thead><tbody>");
    rows.forEach((row) => {
      win.document.write("<tr>");
      headers.forEach((header) =>
        win.document.write("<td>" + row[header] + "</td>")
      );
      win.document.write("</tr>");
    });
    win.document.write("</tbody></table></body></html>");
    win.document.close();
    win.print();
    logActivity({
      action_type: "EXPORT_PDF",
      entity_type: "export",
      entity_id: title,
      payload: { rows: rows.length },
    }).catch(() => {});
    addNotification(`Exported ${title}`);
  };

  const LineChart = ({ data, max, stroke, fill }) => {
    const width = 420;
    const height = 180;
    if (!data.length || !max) {
      return <div className="chart-empty">No data</div>;
    }
    const points = data.map((entry, index) => {
      const x= (index / Math.max(data.length - 1, 1)) * (width - 20) + 10;
      const y = height - (entry.total / max) * (height - 20) - 10;
      return `${x},${y}`;
    });
    const pathD = `M ${points.join(" L ")}`;
    const areaD = `${pathD} L ${width - 10},${height - 10} L 10,${
      height - 10
    } Z`;
    return (
      <svg className="line-chart" viewBox={`0 0 ${width} ${height}`}>
        <path d={areaD} fill={fill} opacity="0.2" />
        <path d={pathD} stroke={stroke} strokeWidth="3" fill="none" />
      </svg>
    );
  };

  const DonutChart = ({ value, total, colors }) => {
    const size = 180;
    const stroke = 18;
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const safeTotal = total || 1;
    const primary = Math.max(0, Math.min(value, safeTotal));
    const primaryOffset = circumference - (primary / safeTotal) * circumference;
    return (
      <svg className="donut-chart" width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colors.base}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colors.primary}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={primaryOffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
    );
  };

  const handleExportAllReports = () => {
    handleExportCsv(
      "report_people.csv",
      people.map((person) => ({
        name: person.name,
        sponsor: person.sponsorId
          ? peopleIndex[person.sponsorId]?.name
          : "Owner",
        stage: getStageSummary(person, peopleIndex, sales).stage,
        recruits: getStageRecruitCount(person.id, peopleIndex),
        phone: person.phone,
      }))
    );
    handleExportCsv(
      "report_sales.csv",
      sales
        .filter((sale) => sale.status !== "cancelled")
        .map((sale) => ({
          seller: peopleIndex[sale.sellerId]?.name,
          project: getSaleProjectName(sale),
          block: getSaleBlockName(sale),
          location: sale.location,
          area_sq_yd: sale.areaSqYd,
          total_amount: sale.totalAmount,
          sale_date: sale.saleDate,
        }))
    );
    if (canSeeCommission) {
      handleExportCsv(
        "report_commissions.csv",
        commissionSummary.peopleRows.map((row) => ({
          member: row.person.name,
          personal_rate: row.personalRate,
          commission_earned: row.totalCommission,
          commission_paid: row.totalPaid,
          balance: row.totalCommission - row.totalPaid,
        }))
      );
    }
    handleExportCsv(
      "report_buybacks.csv",
          people.flatMap((person) =>
                    person.investments.map((inv) => ({
                      member: person.name,
                      stage: inv.stage,
                      investment: inv.amount,
                      area_sq_yd: inv.areaSqYd,
                      buyback_date: inv.buybackDate,
                      buyback_amount:
                        inv.amount * ((inv.returnPercent || 200) / 100),
                      return_percent: inv.returnPercent || 200,
                      status: inv.status,
                    }))
          )
    );
    handleExportCsv(
      "report_team_growth.csv",
      people.map((person) => ({
        name: person.name,
        stage: getStageSummary(person, peopleIndex, sales).stage,
        recruits: getStageRecruitCount(person.id, peopleIndex),
        downline_depth: getDownlineDepth(person.id, peopleIndex),
      }))
    );
  };

  const [showPersonModal, setShowPersonModal] = useState(false);
  const [showSaleModal, setShowSaleModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showCommissionModal, setShowCommissionModal] = useState(false);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showProjectDetailModal, setShowProjectDetailModal] = useState(false);
  const [showPropertyDetailModal, setShowPropertyDetailModal] = useState(false);
  const [editingSaleId, setEditingSaleId] = useState(null);
  const [editingPersonId, setEditingPersonId] = useState(null);
  const [showEditPersonModal, setShowEditPersonModal] = useState(false);
  const [dashboardSummary, setDashboardSummary] = useState(null);
  const [peopleLookup, setPeopleLookup] = useState([]);
  const [peopleTableRows, setPeopleTableRows] = useState([]);
  const [peopleTotal, setPeopleTotal] = useState(0);
  const [salesTableRows, setSalesTableRows] = useState([]);
  const [salesTotal, setSalesTotal] = useState(0);
  const [commissionTableRows, setCommissionTableRows] = useState([]);
  const [commissionTotal, setCommissionTotal] = useState(0);
  const [fullDataLoaded, setFullDataLoaded] = useState(false);
  const [loadingFullData, setLoadingFullData] = useState(false);
  const [loadedProjectIds, setLoadedProjectIds] = useState([]);
  const [loadedBlockIds, setLoadedBlockIds] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [activitySearch, setActivitySearch] = useState("");
  const [activityActionFilter, setActivityActionFilter] = useState("all");
  const [activityEntityFilter, setActivityEntityFilter] = useState("all");
  const [activityStatusFilter, setActivityStatusFilter] = useState("all");
  const [activityDateFrom, setActivityDateFrom] = useState("");
  const [activityDateTo, setActivityDateTo] = useState("");
  const [activityActionOptions, setActivityActionOptions] = useState([]);
  const [activityEntityOptions, setActivityEntityOptions] = useState([]);
  const [activityTotal, setActivityTotal] = useState(0);
  const [showBuybackModal, setShowBuybackModal] = useState(false);
  const [buybackForm, setBuybackForm] = useState({
    investmentId: "",
    paidAmount: "",
    paidDate: "",
  });
  const [notifications, setNotifications] = useState([]);
  const [pendingUndo, setPendingUndo] = useState(null);
  const [reportsView, setReportsView] = useState("analytics");
  const [peopleSearch, setPeopleSearch] = useState("");
  const [salesSearch, setSalesSearch] = useState("");
  const [projectSearch, setProjectSearch] = useState("");
  const [profileSearch, setProfileSearch] = useState("");
  const [commissionSearch, setCommissionSearch] = useState("");
  const [commissionStageFilter, setCommissionStageFilter] = useState("all");
  const [commissionBalanceFilter, setCommissionBalanceFilter] = useState("all");
  const [commissionMinEarned, setCommissionMinEarned] = useState("");
  const [buybackSearch, setBuybackSearch] = useState("");
  const [buybackStatusFilter, setBuybackStatusFilter] = useState("all");
  const [buybackStageFilter, setBuybackStageFilter] = useState("all");
  const [buybackSort, setBuybackSort] = useState("buyback_desc");
  const [buybackDateMode, setBuybackDateMode] = useState("buyback");
  const [buybackDateFrom, setBuybackDateFrom] = useState("");
  const [buybackDateTo, setBuybackDateTo] = useState("");
  const [buybackPaidFrom, setBuybackPaidFrom] = useState("");
  const [buybackPaidTo, setBuybackPaidTo] = useState("");
  const [peoplePage, setPeoplePage] = useState(1);
  const [salesPage, setSalesPage] = useState(1);
  const [buybackPage, setBuybackPage] = useState(1);
  const [projectPage, setProjectPage] = useState(1);
  const [commissionPage, setCommissionPage] = useState(1);
  const [activityPage, setActivityPage] = useState(1);
  const [usersPage, setUsersPage] = useState(1);
  const [usersTotal, setUsersTotal] = useState(0);
  const [peopleSort, setPeopleSort] = useState("recent");
  const [salesSort, setSalesSort] = useState("recent");
  const [salesView, setSalesView] = useState("active");

  useEffect(() => {
    if (!canSeeCommission && peopleSort === "commission") {
      setPeopleSort("recent");
    }
  }, [canSeeCommission, peopleSort]);
  const [reportFilters, setReportFilters] = useState({
    startDate: "",
    endDate: "",
    personId: "all",
  });
  const [mobileHeaderHidden, setMobileHeaderHidden] = useState(false);

  const [personForm, setPersonForm] = useState({
    name: "",
    phone: "+91",
    sponsorId: "",
    joinDate: "",
    investmentAmount: "",
    investmentArea: "",
    investmentDate: "",
    buybackMonths: "",
    returnPercent: "",
    projectId: "",
    blockId: "",
    propertyId: "",
  });
  const [personNameError, setPersonNameError] = useState("");

  const [editPersonForm, setEditPersonForm] = useState({
    name: "",
    phone: "+91",
    joinDate: "",
    investmentArea: "",
    investmentId: "",
    returnPercent: "",
  });
  const [editPersonNameError, setEditPersonNameError] = useState("");

  const [saleForm, setSaleForm] = useState({
    sellerId: "",
    projectId: "",
    blockId: "",
    propertyId: "",
    areaSqYd: "",
    totalAmount: "",
    saleDate: "",
    payments: [{ amount: "", date: "" }],
    existingPayments: [],
  });
  
  const [projectForm, setProjectForm] = useState({
    name: "",
    city: "",
    state: "",
    pincode: "",
    address: "",
    totalArea: "",
    blocksCount: "",
    blocks: [],
  });
  const [pincodeOptions, setPincodeOptions] = useState([]);
  const [pincodeLoading, setPincodeLoading] = useState(false);
  const [pincodeError, setPincodeError] = useState("");
  const [pincodeSelected, setPincodeSelected] = useState(false);
  const [pincodeQuery, setPincodeQuery] = useState("");
  const latestPincodeQuery = useRef("");
  const visiblePincodeOptions = useMemo(() => {
    const term = (pincodeQuery || "").trim();
    if (!term) return pincodeOptions;
    const isNumeric = /^\d+$/.test(term);
    if (isNumeric) {
      return pincodeOptions.filter((item) =>
        String(item.pincode || "").startsWith(term)
      );
    }
    const lowered = term.toLowerCase();
    return pincodeOptions.filter((item) => {
      const label = `${item.pincode} ${item.district || ""} ${item.name || ""}`.toLowerCase();
      return label.includes(lowered);
    });
  }, [pincodeOptions, pincodeQuery]);

  const handlePincodeSearch = useCallback(async (query) => {
    const state = projectForm.state;
    const term = (query || "").trim();
    if (!state) {
      setPincodeOptions([]);
      return;
    }
    const isNumeric = /^\d{3,6}$/.test(term);
    if (!term || (!isNumeric && term.length < 3)) {
      setPincodeOptions([]);
      setPincodeLoading(false);
      return;
    }
    latestPincodeQuery.current = term;
    setPincodeOptions([]);
    setPincodeLoading(true);
    setPincodeError("");
    try {
      const data = await fetchPincodes(state, term);
      if (latestPincodeQuery.current !== term) return;
      setPincodeOptions(data.results || []);
    } catch (err) {
      console.error(err);
      if (latestPincodeQuery.current !== term) return;
      setPincodeOptions([]);
      setPincodeError("Failed to load pincodes.");
    } finally {
      if (latestPincodeQuery.current === term) {
        setPincodeLoading(false);
      }
    }
  }, [projectForm.state]);
  const [paymentForm, setPaymentForm] = useState({
    saleId: "",
    amount: "",
    date: "",
  });
  const [paymentSaleDetail, setPaymentSaleDetail] = useState(null);

  const [commissionForm, setCommissionForm] = useState({
    personId: "",
    amount: "",
    date: "",
    note: "",
  });
  const [commissionBalance, setCommissionBalance] = useState(null);


  const loadData = useCallback(async () => {
    if (!authUser) return;
    setLoadingFullData(true);
    setLoading(true);
    try {
      const needPeople =
        hasPermission("people:read") ||
        hasPermission("sales:read") ||
        hasPermission("commissions:read") ||
        hasPermission("buybacks:read") ||
        hasPermission("reports:read") ||
        hasPermission("activity:read");
      const tasks = {};
      if (needPeople) tasks.people = fetchPeople();
      if (hasPermission("sales:read")) {
        tasks.sales = fetchSales();
        tasks.payments = fetchPayments();
      }
      if (hasPermission("buybacks:read") || hasPermission("people:read")) {
        tasks.investments = fetchInvestments();
      }
      if (hasPermission("commissions:read")) {
        tasks.commissions = fetchCommissionPayments();
      }
      if (hasPermission("projects:read")) {
        tasks.projects = fetchProjects();
      }
      if (hasPermission("settings:read")) {
        tasks.config = fetchCommissionConfig();
      }
      if (
        hasPermission("commissions:read") ||
        hasPermission("settings:read")
      ) {
        tasks.configHistory = fetchCommissionConfigHistory();
      }
      if (hasPermission("employees:read")) {
        tasks.employees = fetchEmployees();
        tasks.salaryPayments = fetchSalaryPayments();
      }

      const entries = Object.entries(tasks);
      const results = await Promise.allSettled(entries.map(([, task]) => task));
      const data = {};
      entries.forEach(([key], index) => {
        if (results[index].status === "fulfilled") {
          data[key] = results[index].value;
        } else {
          data[key] = null;
        }
      });

      const investmentData = data.investments || [];
      const investmentsByPerson = investmentData.reduce((acc, inv) => {
        acc[inv.person_id] = acc[inv.person_id] || [];
        acc[inv.person_id].push({
          stage: inv.stage,
          amount: inv.amount,
          areaSqYd: inv.area_sq_yd ?? 0,
          date: inv.date,
          buybackDate: inv.buyback_date,
          buybackMonths: inv.buyback_months ?? 36,
          returnPercent: inv.return_percent ?? 200,
          projectId: inv.project_id || "",
          blockId: inv.block_id || "",
          propertyId: inv.property_id || "",
          status: inv.status,
          paidAmount: inv.paid_amount,
          paidDate: inv.paid_date,
          id: inv.id,
        });
        return acc;
      }, {});

      const peopleData = data.people || [];
      const peopleWithInvestments = peopleData.map((person) => ({
        ...person,
        sponsorId: person.sponsor_id,
        sponsorStage:
          person.sponsor_stage ?? (person.sponsor_id ? 1 : null),
        joinDate: person.join_date,
        investments: investmentsByPerson[person.id] || [],
      }));

      const paymentData = data.payments || [];
      const paymentsBySale = paymentData.reduce((acc, payment) => {
        acc[payment.sale_id] = acc[payment.sale_id] || [];
        acc[payment.sale_id].push({
          amount: payment.amount,
          date: payment.date,
        });
        return acc;
      }, {});

      const salesData = data.sales || [];
      const salesWithPayments = salesData.map((sale) => ({
        ...sale,
        sellerId: sale.seller_id,
        propertyName: sale.property_name,
        areaSqYd: sale.area_sq_yd,
        totalAmount: sale.total_amount,
        saleDate: sale.sale_date,
        status: sale.status || "active",
        cancelledAt: sale.cancelled_at,
        projectId: sale.project_id || "",
        blockId: sale.block_id || "",
        propertyId: sale.property_id || "",
        payments: paymentsBySale[sale.id] || [],
      }));

      setPeople(peopleWithInvestments);
      setSales(salesWithPayments);
      if (data.projects) {
        setProjects(data.projects.projects || []);
        setProjectBlocks(data.projects.blocks || []);
        setProjectProperties(data.projects.properties || []);
        setLoadedProjectIds([]);
        setLoadedBlockIds([]);
      } else {
        setProjects([]);
        setProjectBlocks([]);
        setProjectProperties([]);
        setLoadedProjectIds([]);
        setLoadedBlockIds([]);
      }
      setCommissionPayments(data.commissions || []);
      if (data.config) {
        setCommissionConfig({
          levelRates:
            data.config.levelRates ||
            [200, 150, 100, 50, 50, 50, 50, 25, 25],
          personalRates:
            data.config.personalRates ||
            [200, 300, 400, 500, 600, 700, 800, 900, 1000],
        });
      }
      if (data.configHistory) {
        setCommissionConfigHistory(data.configHistory || []);
      } else {
        setCommissionConfigHistory([]);
      }
      if (data.employees) {
        setEmployees(data.employees || []);
      } else {
        setEmployees([]);
      }
      if (data.salaryPayments) {
        setSalaryPayments(data.salaryPayments || []);
      } else {
        setSalaryPayments([]);
      }
      setFullDataLoaded(true);
      setError("");
    } catch (err) {
      const message = String(err?.message || "");
      if (message.includes("Unauthorized")) {
        handleLogout();
        setAuthError("Session expired. Please log in again.");
        return;
      }
      setError("Failed to load data from backend.");
      console.error(err);
    } finally {
      setLoading(false);
      setLoadingFullData(false);
    }
  }, [authUser, hasPermission, handleLogout]);

  const loadInitialData = useCallback(async () => {
    if (!authUser) return;
    setFullDataLoaded(false);
    setLoadedProjectIds([]);
    setLoadedBlockIds([]);
    setLoading(true);
    try {
      const tasks = {};
      if (hasPermission("dashboard:read")) {
        tasks.dashboard = fetchDashboardSummary();
      }
      if (hasPermission("projects:read")) {
        tasks.projects = fetchProjects();
      }
      if (hasPermission("settings:read")) {
        tasks.config = fetchCommissionConfig();
      }
      if (hasPermission("employees:read")) {
        tasks.employees = fetchEmployees();
        tasks.salaryPayments = fetchSalaryPayments();
      }
      if (hasPermission("people:read")) {
        tasks.peopleLookup = fetchPeopleLookup();
      }

      const entries = Object.entries(tasks);
      const results = await Promise.allSettled(entries.map(([, task]) => task));
      const data = {};
      entries.forEach(([key], index) => {
        if (results[index].status === "fulfilled") {
          data[key] = results[index].value;
        } else {
          data[key] = null;
        }
      });

      if (data.dashboard) {
        setDashboardSummary(data.dashboard);
      }
      if (data.projects) {
        setProjects(data.projects.projects || []);
        setProjectBlocks(data.projects.blocks || []);
        setProjectProperties([]);
      }
      if (data.config) {
        setCommissionConfig({
          levelRates:
            data.config.levelRates ||
            [200, 150, 100, 50, 50, 50, 50, 25, 25],
          personalRates:
            data.config.personalRates ||
            [200, 300, 400, 500, 600, 700, 800, 900, 1000],
        });
      }
      if (data.employees) {
        setEmployees(data.employees || []);
      } else {
        setEmployees([]);
      }
      if (data.salaryPayments) {
        setSalaryPayments(data.salaryPayments || []);
      } else {
        setSalaryPayments([]);
      }
      if (data.peopleLookup) {
        setPeopleLookup(data.peopleLookup || []);
      } else {
        setPeopleLookup([]);
      }
      setError("");
    } catch (err) {
      console.error(err);
      setError("Failed to load data from backend.");
    } finally {
      setLoading(false);
    }
  }, [authUser, hasPermission]);

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem("mlm_token");
      if (!token) {
        setAuthLoading(false);
        return;
      }
      try {
        const me = await fetchMe();
        setAuthUser(me);
      } catch (err) {
        localStorage.removeItem("mlm_token");
      } finally {
        setAuthLoading(false);
      }
    };
    initAuth();
  }, []);

  useEffect(() => {
    if (authUser) {
      loadInitialData();
    }
  }, [authUser, loadInitialData]);

  const refreshActivityLogs = useCallback(async () => {
    if (!authUser || !hasPermission("activity:read")) return;
    try {
      const limit = 50;
      const offset = (activityPage - 1) * limit;
      const params = { limit, offset };
      if (activitySearch) params.search = activitySearch;
      if (activityActionFilter) params.action = activityActionFilter;
      if (activityEntityFilter) params.entity = activityEntityFilter;
      if (activityStatusFilter) params.status = activityStatusFilter;
      if (activityDateFrom) params.from = activityDateFrom;
      if (activityDateTo) params.to = activityDateTo;
      const data = await fetchActivityLogs(params);
      setActivityLogs(data.rows || []);
      setActivityTotal(data.total || 0);
      setActivityActionOptions(data.actionOptions || []);
      setActivityEntityOptions(data.entityOptions || []);
    } catch (err) {
      console.error(err);
    }
  }, [
    authUser,
    activityPage,
    activitySearch,
    activityActionFilter,
    activityEntityFilter,
    activityStatusFilter,
    activityDateFrom,
    activityDateTo,
    hasPermission,
  ]);

  useEffect(() => {
    if (
      !authUser ||
      activeView !== "activity" ||
      !hasPermission("activity:read")
    ) {
      return;
    }
    refreshActivityLogs();
  }, [
    authUser,
    activeView,
    activityPage,
    activitySearch,
    activityActionFilter,
    activityEntityFilter,
    activityStatusFilter,
    activityDateFrom,
    activityDateTo,
    refreshActivityLogs,
    hasPermission,
  ]);

  useEffect(() => {
    if (
      !authUser ||
      activeView !== "users" ||
      !hasPermission("users:manage")
    ) {
      return;
    }
    const loadUsersPage = async () => {
      try {
        const limit = 10;
        const offset = (usersPage - 1) * limit;
        const data = await fetchUsers({ limit, offset });
        setUsers(data.rows || []);
        setUsersTotal(data.total || 0);
      } catch (err) {
        console.error(err);
      }
    };
    loadUsersPage();
  }, [authUser, activeView, usersPage, hasPermission]);

  useEffect(() => {
    if (
      !authUser ||
      activeView !== "people" ||
      !hasPermission("people:read")
    ) {
      return;
    }
    const loadPeoplePage = async () => {
      try {
        const limit = 10;
        const offset = (peoplePage - 1) * limit;
        const data = await fetchPeopleSummary({
          limit,
          offset,
          search: peopleSearch || undefined,
          sort: peopleSort,
        });
        setPeopleTableRows(data.rows || []);
        setPeopleTotal(data.total || 0);
      } catch (err) {
        console.error(err);
      }
    };
    loadPeoplePage();
  }, [authUser, activeView, peoplePage, peopleSearch, peopleSort, hasPermission]);

  useEffect(() => {
    if (
      !authUser ||
      activeView !== "sales" ||
      !hasPermission("sales:read")
    ) {
      return;
    }
    const loadSalesPage = async () => {
      try {
        const limit = 10;
        const offset = (salesPage - 1) * limit;
        const data = await fetchSalesSummary({
          limit,
          offset,
          search: salesSearch || undefined,
          sort: salesSort,
          view: salesView,
        });
        const rows = (data.rows || []).map((row) => ({
          id: row.id,
          saleDate: row.sale_date,
          sellerId: row.seller_id,
          sellerName: row.seller_name || "",
          projectId: row.project_id || "",
          projectName: row.project_name || "",
          blockId: row.block_id || "",
          blockName: row.block_name || "",
          propertyId: row.property_id || "",
          propertyName: row.property_name || "",
          location: row.location || "",
          areaSqYd: row.area_sq_yd,
          totalAmount: row.total_amount,
          paidAmount: row.paid_amount || 0,
          status: row.status || "active",
          cancelledAt: row.cancelled_at,
        }));
        setSalesTableRows(rows);
        setSalesTotal(data.total || 0);
      } catch (err) {
        console.error(err);
      }
    };
    loadSalesPage();
  }, [
    authUser,
    activeView,
    salesPage,
    salesSearch,
    salesSort,
    salesView,
    hasPermission,
  ]);

  useEffect(() => {
    if (
      !authUser ||
      activeView !== "commissions" ||
      !hasPermission("commissions:read")
    ) {
      return;
    }
    const loadCommissionPage = async () => {
      try {
        const limit = 10;
        const offset = (commissionPage - 1) * limit;
        const data = await fetchCommissionSummary({
          limit,
          offset,
          search: commissionSearch || undefined,
          stage: commissionStageFilter,
          balance: commissionBalanceFilter,
          minEarned: commissionMinEarned || undefined,
        });
        setCommissionTableRows(data.rows || []);
        setCommissionTotal(data.total || 0);
      } catch (err) {
        console.error(err);
      }
    };
    loadCommissionPage();
  }, [
    authUser,
    activeView,
    commissionPage,
    commissionSearch,
    commissionStageFilter,
    commissionBalanceFilter,
    commissionMinEarned,
    hasPermission,
  ]);

  useEffect(() => {
    let lastScrollTop = 0;
    let ticking = false;
    const handleScroll = () => {
      const container = document.querySelector(".main-content");
      if (!container) return;
      const current = container.scrollTop;
      if (!ticking) {
        window.requestAnimationFrame(() => {
          if (current <= 20) {
            setMobileHeaderHidden(false);
          } else if (current > lastScrollTop + 6) {
            setMobileHeaderHidden(true);
          } else if (current < lastScrollTop - 6) {
            setMobileHeaderHidden(false);
          }
          lastScrollTop = current;
          ticking = false;
        });
        ticking = true;
      }
    };
    const container = document.querySelector(".main-content");
    if (container) {
      container.addEventListener("scroll", handleScroll);
    }
    return () => {
      if (container) {
        container.removeEventListener("scroll", handleScroll);
      }
    };
  }, []);

  useEffect(() => {
    if (!personForm.blockId) return;
    ensureBlockProperties(personForm.blockId, "available");
  }, [personForm.blockId, ensureBlockProperties]);

  useEffect(() => {
    if (!saleForm.blockId) return;
    const status = editingSaleId ? "all" : "available";
    ensureBlockProperties(saleForm.blockId, status);
  }, [saleForm.blockId, editingSaleId, ensureBlockProperties]);

  useEffect(() => {
    if (!showProjectDetailModal || !selectedProjectId) return;
    loadProjectDetailProperties(selectedProjectId);
  }, [showProjectDetailModal, selectedProjectId, loadProjectDetailProperties]);

  useEffect(() => {
    if (!authUser || fullDataLoaded || loadingFullData) return;
    const heavyViews = new Set(["orgTree", "reports", "profile", "buybacks"]);
    if (heavyViews.has(activeView)) {
      loadData();
    }
  }, [authUser, activeView, fullDataLoaded, loadingFullData, loadData]);

  const peopleIndex = useMemo(() => buildPeopleIndex(people), [people]);
  const salesIndex = useMemo(() => buildSalesIndex(sales), [sales]);
  const projectsById = useMemo(() => {
    const map = {};
    projects.forEach((project) => {
      map[project.id] = project;
    });
    return map;
  }, [projects]);
  const blocksById = useMemo(() => {
    const map = {};
    projectBlocks.forEach((block) => {
      map[block.id] = block;
    });
    return map;
  }, [projectBlocks]);
  const propertiesById = useMemo(() => {
    const map = {};
    projectProperties.forEach((prop) => {
      map[prop.id] = prop;
    });
    return map;
  }, [projectProperties]);
  const employeesById = useMemo(() => {
    const map = {};
    employees.forEach((emp) => {
      map[emp.id] = emp;
    });
    return map;
  }, [employees]);

  const blocksForProject = useCallback(
    (projectId) => projectBlocks.filter((block) => block.project_id === projectId),
    [projectBlocks]
  );

  const propertiesForProject = useCallback(
    (projectId) =>
      projectProperties.filter((prop) => prop.project_id === projectId),
    [projectProperties]
  );

  const propertiesForBlock = useCallback(
    (blockId, includeId = null) =>
      projectProperties.filter((prop) => {
        if (prop.block_id !== blockId) return false;
        if (!prop.status || prop.status === "available") return true;
        return includeId && prop.id === includeId;
      }),
    [projectProperties]
  );
  const salesById = useMemo(() => {
    const map = {};
    sales.forEach((sale) => {
      map[sale.id] = sale;
    });
    return map;
  }, [sales]);
  const investmentsFlat = useMemo(
    () =>
      people.flatMap((person) =>
        (person.investments || []).map((inv) => ({
          ...inv,
          personId: person.id,
          personName: person.name,
        }))
      ),
    [people]
  );
  const investmentsById = useMemo(() => {
    const map = {};
    investmentsFlat.forEach((inv) => {
      if (inv.id) {
        map[inv.id] = inv;
      }
    });
    return map;
  }, [investmentsFlat]);

  const salaryPaymentsByKey = useMemo(() => {
    const map = {};
    salaryPayments.forEach((payment) => {
      map[`${payment.employee_id}-${payment.month}`] = payment;
    });
    return map;
  }, [salaryPayments]);
  const projectPropertyStats = useMemo(() => {
    const stats = {};
    projects.forEach((project) => {
      if (project.total_properties !== undefined && project.total_properties !== null) {
        stats[project.id] = {
          total: project.total_properties || 0,
          available: project.available_properties || 0,
          sold: project.sold_properties || 0,
          bySale: project.by_sale || 0,
          byInvestment: project.by_investment || 0,
        };
        return;
      }
      const props = propertiesForProject(project.id);
      const available = props.filter(
        (prop) => !prop.status || prop.status === "available"
      ).length;
      const sold = props.length - available;
      const bySale = props.filter((prop) => prop.last_sale_id).length;
      const byInvestment = props.filter((prop) => prop.last_investment_id).length;
      stats[project.id] = {
        total: props.length,
        available,
        sold,
        bySale,
        byInvestment,
      };
    });
    return stats;
  }, [projects, projectProperties, propertiesForProject]);
  const commissionSummary = useMemo(
    () =>
      calculateCommissionSummary(
        people,
        sales,
        commissionConfig,
        commissionPayments,
        commissionConfigHistory
      ),
    [people, sales, commissionPayments, commissionConfig, commissionConfigHistory]
  );

  const topEarnersList = useMemo(() => {
    if (dashboardSummary?.topEarners?.length) {
      return dashboardSummary.topEarners.map((entry) => ({
        id: entry.person_id,
        name: entry.name,
        totalCommission: entry.total_commission,
        maxLevel: entry.max_level,
      }));
    }
    return commissionSummary.topEarners.map((entry) => ({
      id: entry.person.id,
      name: entry.person.name,
      totalCommission: entry.totalCommission,
      maxLevel: entry.maxLevel,
    }));
  }, [dashboardSummary, commissionSummary]);

  useEffect(() => {
    if (!people.length) {
      if (selectedPersonId) {
        setSelectedPersonId("");
      }
      return;
    }
    if (!selectedPersonId || !people.find((person) => person.id === selectedPersonId)) {
      setSelectedPersonId(people[0].id);
    }
  }, [people, selectedPersonId]);

  useEffect(() => {
    if (!projects.length) {
      if (selectedProjectId) {
        setSelectedProjectId("");
      }
      return;
    }
    if (
      !selectedProjectId ||
      !projects.find((project) => project.id === selectedProjectId)
    ) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  const handleProjectStateChange = (value) => {
    setProjectForm((prev) => ({ ...prev, state: value, pincode: "" }));
    setPincodeOptions([]);
    setPincodeError("");
    setPincodeSelected(false);
    setPincodeQuery("");
    latestPincodeQuery.current = "";
  };

  const dashboardStats = useMemo(() => {
    if (dashboardSummary) {
      return {
        totalSales: dashboardSummary.totalSales || 0,
        totalArea: dashboardSummary.totalArea || 0,
        totalCommission: dashboardSummary.totalCommission || 0,
        pendingBuybacks: Array.from(
          { length: dashboardSummary.pendingBuybacks || 0 },
          () => null
        ),
      };
    }
    const activeSales = sales.filter((sale) => sale.status !== "cancelled");
    const totalSales = activeSales.reduce(
      (acc, sale) => acc + sale.totalAmount,
      0
    );
    const totalArea = activeSales.reduce(
      (acc, sale) => acc + sale.areaSqYd,
      0
    );
    const totalCommission = commissionSummary.totalCommission;
    const pendingBuybacks = people.flatMap((person) =>
      person.investments
        .filter((inv) => inv.status === "pending")
        .map((inv) => ({ person, inv }))
    );
    return { totalSales, totalArea, totalCommission, pendingBuybacks };
  }, [people, sales, commissionSummary, dashboardSummary]);

  const filteredProjects = useMemo(() => {
    if (!projectSearch) return projects;
    const term = projectSearch.toLowerCase();
    return projects.filter(
      (project) =>
        project.name.toLowerCase().includes(term) ||
        project.city.toLowerCase().includes(term) ||
        project.state.toLowerCase().includes(term)
    );
  }, [projects, projectSearch]);

  useEffect(() => {
    setProjectPage(1);
  }, [projectSearch]);

  const pagedProjects = useMemo(() => {
    const start = (projectPage - 1) * 10;
    return filteredProjects.slice(start, start + 10);
  }, [filteredProjects, projectPage]);

  const totalProjectPages = Math.max(
    1,
    Math.ceil(filteredProjects.length / 10)
  );

  const selectedProject = projectsById[selectedProjectId];
  const selectedProjectBlocks = selectedProjectId
    ? blocksForProject(selectedProjectId)
    : [];
  const selectedProjectProperties = selectedProjectId
    ? propertiesForProject(selectedProjectId)
    : [];
  const modalProjectProperties =
    showProjectDetailModal && projectDetailProperties.length
      ? projectDetailProperties
      : selectedProjectProperties;

  const recentSales = useMemo(() => {
    if (dashboardSummary?.recentSales?.length) {
      return dashboardSummary.recentSales.map((sale) => ({
        id: sale.id,
        sellerName: sale.seller_name || "",
        projectName: sale.project_name || "",
        blockName: sale.block_name || "",
        propertyName: sale.property_name || "",
        areaSqYd: sale.area_sq_yd,
        totalAmount: sale.total_amount,
        paidAmount: sale.paid_amount || 0,
      }));
    }
    return sales.filter((sale) => sale.status !== "cancelled").slice(0, 5);
  }, [sales, dashboardSummary]);

  const employeeRows = useMemo(() => {
    const now = new Date();
    const monthKey = getMonthKey(now);
    const monthStart = getMonthStart(now);
    const monthEnd = getMonthEnd(now);
    const cycleEndDay = Math.min(monthEnd.getDate(), 30);
    const cycleEnd = new Date(
      monthStart.getFullYear(),
      monthStart.getMonth(),
      cycleEndDay
    );
    const daysInMonth = cycleEndDay;
    return employees.map((emp) => {
      const joinDate = new Date(emp.join_date);
      let remainingDays = 0;
      if (joinDate <= cycleEnd) {
        const effectiveStart = joinDate > monthStart ? joinDate : monthStart;
        if (effectiveStart <= cycleEnd) {
          const diff =
            Math.floor(
              (cycleEnd - effectiveStart) / (1000 * 60 * 60 * 24)
            ) + 1;
          remainingDays = diff;
        }
      }
      const prorated =
        remainingDays > 0
          ? Math.round((emp.monthly_salary * remainingDays) / daysInMonth)
          : 0;
      const paymentKey = `${emp.id}-${monthKey}`;
      const payment = salaryPaymentsByKey[paymentKey];
      return {
        ...emp,
        monthKey,
        remainingDays,
        daysInMonth,
        proratedSalary: prorated,
        payment,
        releaseDate: getNextMonthReleaseDate(monthKey),
      };
    });
  }, [employees, salaryPaymentsByKey]);

  const filteredEmployees = useMemo(() => {
    if (!employeeSearch) return employeeRows;
    const term = employeeSearch.toLowerCase();
    return employeeRows.filter(
      (emp) =>
        emp.name.toLowerCase().includes(term) ||
        emp.role.toLowerCase().includes(term) ||
        (emp.phone || "").toLowerCase().includes(term)
    );
  }, [employeeRows, employeeSearch]);

  const pagedEmployees = useMemo(() => {
    const start = (employeePage - 1) * 10;
    return filteredEmployees.slice(start, start + 10);
  }, [filteredEmployees, employeePage]);

  const totalEmployeePages = Math.max(1, Math.ceil(filteredEmployees.length / 10));

  const filteredPeople = useMemo(() => {
    const { startDate, endDate, personId } = reportFilters;
    return people.filter((person) => {
      if (personId && personId !== "all" && person.id !== personId) return false;
      const joinDate = new Date(person.joinDate);
      if (startDate && joinDate < new Date(startDate)) return false;
      if (endDate && joinDate > new Date(endDate)) return false;
      return true;
    });
  }, [people, reportFilters]);

  const filteredSales = useMemo(() => {
    const { startDate, endDate, personId } = reportFilters;
    return sales.filter((sale) => {
      if (sale.status === "cancelled") return false;
      if (personId && personId !== "all" && sale.sellerId !== personId) return false;
      const saleDate = new Date(sale.saleDate);
      if (startDate && saleDate < new Date(startDate)) return false;
      if (endDate && saleDate > new Date(endDate)) return false;
      return true;
    });
  }, [sales, reportFilters]);

  const salesByMonth = useMemo(() => {
    const buckets = {};
    filteredSales.forEach((sale) => {
      const date = new Date(sale.saleDate);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
        2,
        "0"
      )}`;
      buckets[key] = (buckets[key] || 0) + sale.totalAmount;
    });
    return Object.entries(buckets)
      .sort((a, b) => (a[0] > b[0] ? 1 : -1))
      .slice(-6)
      .map(([month, total]) => ({ month, total }));
  }, [filteredSales]);

  const maxSalesTotal = useMemo(() => {
    if (!salesByMonth.length) return 0;
    return Math.max(...salesByMonth.map((entry) => entry.total));
  }, [salesByMonth]);

  const peopleByMonth = useMemo(() => {
    const buckets = {};
    filteredPeople.forEach((person) => {
      const date = new Date(person.joinDate);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
        2,
        "0"
      )}`;
      buckets[key] = (buckets[key] || 0) + 1;
    });
    return Object.entries(buckets)
      .sort((a, b) => (a[0] > b[0] ? 1 : -1))
      .slice(-6)
      .map(([month, total]) => ({ month, total }));
  }, [filteredPeople]);

  const maxPeopleTotal = useMemo(() => {
    if (!peopleByMonth.length) return 0;
    return Math.max(...peopleByMonth.map((entry) => entry.total));
  }, [peopleByMonth]);

  const salesPaidSummary = useMemo(() => {
    const totalPaid = filteredSales.reduce(
      (acc, sale) => acc + sumPayments(sale.payments),
      0
    );
    const totalDue = filteredSales.reduce(
      (acc, sale) => acc + sale.totalAmount,
      0
    );
    return {
      totalPaid,
      totalDue,
      totalRemaining: Math.max(totalDue - totalPaid, 0),
    };
  }, [filteredSales]);

  const commissionsSummary = useMemo(() => {
    const { personId } = reportFilters;
    const relevantRows =
      personId === "all"
        ? commissionSummary.peopleRows
        : commissionSummary.peopleRows.filter(
            (row) => row.person.id === personId
          );
    const earned = relevantRows.reduce(
      (acc, row) => acc + row.totalCommission,
      0
    );
    const paid = relevantRows.reduce((acc, row) => acc + row.totalPaid, 0);
    return {
      earned,
      paid,
      remaining: Math.max(earned - paid, 0),
    };
  }, [commissionSummary, reportFilters]);

  const areaByMonth = useMemo(() => {
    const buckets = {};
    filteredSales.forEach((sale) => {
      const date = new Date(sale.saleDate);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
        2,
        "0"
      )}`;
      buckets[key] = (buckets[key] || 0) + sale.areaSqYd;
    });
    return Object.entries(buckets)
      .sort((a, b) => (a[0] > b[0] ? 1 : -1))
      .slice(-6)
      .map(([month, total]) => ({ month, total }));
  }, [filteredSales]);

  const maxAreaTotal = useMemo(() => {
    if (!areaByMonth.length) return 0;
    return Math.max(...areaByMonth.map((entry) => entry.total));
  }, [areaByMonth]);

  const orgRoots = useMemo(
    () => people.filter((person) => !person.sponsorId).map((person) => person.id),
    [people]
  );

  const nodeMatchesFilter = (node, stageFilter, searchTerm) => {
    const stage = getStageSummary(node, peopleIndex, sales).stage;
    const stageMatch = stageFilter === "all" || stage === Number(stageFilter);
    const searchMatch =
      !searchTerm ||
      node.name.toLowerCase().includes(searchTerm.toLowerCase());
    return stageMatch && searchMatch;
  };

  const subtreeMatches = (personId, stageFilter, searchTerm, rootId) => {
    const node = peopleIndex[personId];
    if (!node) return false;
    if (nodeMatchesFilter(node, stageFilter, searchTerm)) return true;
    return node.directRecruits.some((childId) =>
      subtreeMatches(childId, stageFilter, searchTerm, rootId)
    );
  };

  const getLevelDistance = (rootId, personId, maxLevels = 9) => {
    let current = peopleIndex[personId];
    let level = 0;
    while (current && current.sponsorId && level < maxLevels) {
      level += 1;
      if (current.sponsorId === rootId) return level;
      current = peopleIndex[current.sponsorId];
    }
    return null;
  };

  const getContributionToRoot = (rootId, personId) => {
    if (!rootId) return 0;
    const areaSold = salesIndex[personId]?.totalArea || 0;
    if (rootId === personId) {
      const stage = getStageSummary(peopleIndex[rootId], peopleIndex, sales)
        .stage;
      const selfRate = commissionConfig.personalRates?.[stage - 1] || 0;
      return areaSold * selfRate;
    }
    const level = getLevelDistance(rootId, personId, 9);
    if (!level) return 0;
    const investmentArea = peopleIndex[personId]?.investments
      ? [...peopleIndex[personId].investments]
          .sort((a, b) => new Date(a.date) - new Date(b.date))[0]
          ?.areaSqYd || 0
      : 0;
    const rate = commissionConfig.levelRates[level - 1] || 0;
    return investmentArea * rate;
  };

  const renderTreeNode = (
    personId,
    stageFilter,
    searchTerm,
    level = 0,
    showDetails = false,
    rootId = null
  ) => {
    const node = peopleIndex[personId];
    if (!node) return null;
    if (!subtreeMatches(personId, stageFilter, searchTerm, rootId)) return null;
    const isMatch = nodeMatchesFilter(node, stageFilter, searchTerm);
    const areaSold = salesIndex[personId]?.totalArea || 0;
    const contribution = rootId
      ? getContributionToRoot(rootId, personId)
      : commissionSummary.byPerson[personId]?.totalCommission || 0;
    const displayStage = getStageSummary(node, peopleIndex, sales).stage;
    return (
      <li key={personId}>
        <div className={`tree-node ${isMatch ? "tree-node-match" : ""}`}>
          <span className="tree-name">{formatName(node.name)}</span>
          <span className="tree-meta">
            Stage {displayStage}
            {level > 0 ? ` â€¢ Level ${level}` : ""}
          </span>
          {showDetails && (
            <span className="tree-meta">
              Area: {areaSold} sq yd
              {canSeeCommission
                ? ` â€¢ Contribution: ${formatCurrency(contribution)}`
                : ""}
            </span>
          )}
        </div>
        {node.directRecruits.length > 0 && (
          <ul>
            {node.directRecruits.map((childId) =>
              renderTreeNode(
                childId,
                stageFilter,
                searchTerm,
                level + 1,
                showDetails,
                rootId
              )
            )}
          </ul>
        )}
      </li>
    );
  };

  const buildTreeHtml = (rootIds, stageFilter, searchTerm, showDetails) => {
    const renderNodeHtml = (personId, level, rootId) => {
      const node = peopleIndex[personId];
      if (!node) return "";
      if (!subtreeMatches(personId, stageFilter, searchTerm, rootId)) return "";
      const isMatch = nodeMatchesFilter(node, stageFilter, searchTerm);
      const areaSold = salesIndex[personId]?.totalArea || 0;
      const contribution = rootId
        ? getContributionToRoot(rootId, personId)
        : commissionSummary.byPerson[personId]?.totalCommission || 0;
      const displayStage = getStageSummary(node, peopleIndex, sales).stage;
      const meta = `Stage ${displayStage}${
        level > 0 ? ` â€¢ Level ${level}` : ""
      }`;
      const detail = showDetails
        ? `Area: ${areaSold} sq yd${
            canSeeCommission
              ? ` â€¢ Contribution: ${formatCurrency(contribution)}`
              : ""
          }`
        : "";
      const childrenHtml = node.directRecruits
        .map((childId) => renderNodeHtml(childId, level + 1, rootId))
        .join("");
      return `
        <li>
          <div class="tree-node ${isMatch ? "tree-node-match" : ""}">
            <span class="tree-name">${formatName(node.name)}</span>
            <span class="tree-meta">${meta}</span>
            ${showDetails ? `<span class="tree-meta">${detail}</span>` : ""}
          </div>
          ${childrenHtml ? `<ul>${childrenHtml}</ul>` : ""}
        </li>
      `;
    };

    return `<ul>${rootIds
      .map((id) => renderNodeHtml(id, 0, id))
      .join("")}</ul>`;
  };

  const handleExportTreePdf = (title, rootIds, stageFilter, searchTerm, showDetails) => {
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;
    win.document.write("<html><head><title>" + title + "</title>");
    win.document.write(
      "<style>body{font-family:Arial;padding:24px;}h1{font-size:20px;}ul{list-style:none;padding-left:20px;margin:0;}li{margin:8px 0;padding-left:12px;position:relative;}li:before{content:'';position:absolute;top:12px;left:0;width:10px;height:1px;background:#b8c3cf;}li:after{content:'';position:absolute;top:-8px;left:0;width:1px;height:100%;background:#b8c3cf;}li:last-child:after{height:20px;} .tree-node{background:#f7f4ef;padding:8px 12px;border-radius:10px;display:inline-flex;gap:10px;align-items:center;border:1px solid #e5e9f0;} .tree-node-match{background:#fff4e8;border-color:#f3c79b;} .tree-name{font-weight:600;} .tree-meta{font-size:12px;color:#3a526e;}</style>"
    );
    win.document.write("</head><body>");
    win.document.write("<h1>" + title + "</h1>");
    win.document.write(
      buildTreeHtml(rootIds, stageFilter, searchTerm, showDetails)
    );
    win.document.write("</body></html>");
    win.document.close();
    win.print();
  };

  const flattenTree = (rootIds, includeDetails = false) => {
    const rows = [];
    const dfs = (personId, sponsorName, level) => {
      const node = peopleIndex[personId];
      if (!node) return;
      const areaSold = salesIndex[personId]?.totalArea || 0;
      rows.push({
        name: node.name,
        sponsor: sponsorName,
        stage: getStageSummary(node, peopleIndex, sales).stage,
        level,
        ...(includeDetails
          ? {
              area_sq_yd: areaSold,
              commission: canSeeCommission
                ? commissionSummary.byPerson[personId]?.totalCommission || 0
                : "Restricted",
            }
          : {}),
      });
      node.directRecruits.forEach((childId) =>
        dfs(childId, node.name, level + 1)
      );
    };
    rootIds.forEach((rootId) => dfs(rootId, "Owner", 1));
    return rows;
  };

  const startDrag = (event, setDragging, setDragStart) => {
    setDragging(true);
    setDragStart({ x: event.clientX, y: event.clientY });
  };

  const onDrag = (event, dragging, dragStart, setDragStart, setOffset) => {
    if (!dragging) return;
    setOffset((prev) => ({ x: prev.x + (event.clientX - dragStart.x),
      y: prev.y + (event.clientY - dragStart.y),
    }));
    setDragStart({ x: event.clientX, y: event.clientY });
  };

  const endDrag = (setDragging) => {
    setDragging(false);
  };

  const selectedPerson = peopleIndex[selectedPersonId];
  const selectedPersonSales = sales.filter(
    (sale) =>
      sale.sellerId === selectedPersonId && sale.status !== "cancelled"
  );
  const selectedPersonCommission =
    commissionSummary.byPerson[selectedPersonId] || {
      totalCommission: 0,
      totalPaid: 0,
      personalRate: 0,
    };
  const selectedPersonStageSummary = selectedPerson
    ? getStageSummary(selectedPerson, peopleIndex, sales)
    : { stage: 1, directRecruits: 0, progress: 0, nextTarget: 6 };
  const selectedPersonStage = selectedPersonStageSummary.stage;
  const selectedPersonStageRecruits = selectedPersonStageSummary.directRecruits;

  const formatName = (value) => (value ? value.toUpperCase() : "");

  const filteredPeopleTable = useMemo(() => {
    if (!peopleSearch) return people;
    const term = peopleSearch.toLowerCase();
    return people.filter((person) =>
      person.name.toLowerCase().includes(term)
    );
  }, [people, peopleSearch]);

  const salesBase = useMemo(() => {
    return salesView === "cancelled"
      ? sales.filter((sale) => sale.status === "cancelled")
      : sales.filter((sale) => sale.status !== "cancelled");
  }, [sales, salesView]);

  const filteredSalesTable = useMemo(() => {
    if (!salesSearch) return salesBase;
    const term = salesSearch.toLowerCase();
    return salesBase.filter((sale) => {
      const sellerName = peopleIndex[sale.sellerId]?.name || "";
      const projectName = getSaleProjectName(sale);
      const blockName = getSaleBlockName(sale);
      const propertyName = sale.propertyId
        ? propertiesById[sale.propertyId]?.name || ""
        : "";
      return (
        sellerName.toLowerCase().includes(term) ||
        projectName.toLowerCase().includes(term) ||
        blockName.toLowerCase().includes(term) ||
        propertyName.toLowerCase().includes(term) ||
        sale.location.toLowerCase().includes(term)
      );
    });
  }, [
    salesBase,
    salesSearch,
    peopleIndex,
    projectsById,
    blocksById,
    propertiesById,
    getSaleProjectName,
    getSaleBlockName,
  ]);

  const pagedPeopleTable = useMemo(
    () => peopleTableRows,
    [peopleTableRows]
  );

  const pagedSalesTable = useMemo(
    () => salesTableRows,
    [salesTableRows]
  );

  const totalPeoplePages = Math.max(1, Math.ceil(peopleTotal / 10));
  const totalSalesPages = Math.max(1, Math.ceil(salesTotal / 10));

  const buybackRows = useMemo(
    () =>
      people.flatMap((person) =>
        person.investments.map((inv) => ({
          ...inv,
          personId: person.id,
          personName: person.name,
        }))
      ),
    [people]
  );

  const filteredBuybacks = useMemo(() => {
    let rows = buybackRows;
    if (buybackSearch) {
      const term = buybackSearch.toLowerCase();
      rows = rows.filter((row) => row.personName.toLowerCase().includes(term));
    }
    if (buybackStatusFilter !== "all") {
      rows = rows.filter((row) => row.status === buybackStatusFilter);
    }
    if (buybackStageFilter !== "all") {
      rows = rows.filter((row) => row.stage === Number(buybackStageFilter));
    }
    if (buybackDateMode === "buyback" && buybackDateFrom) {
      rows = rows.filter(
        (row) => new Date(row.buybackDate) >= new Date(buybackDateFrom)
      );
    }
    if (buybackDateMode === "buyback" && buybackDateTo) {
      rows = rows.filter(
        (row) => new Date(row.buybackDate) <= new Date(buybackDateTo)
      );
    }
    if (buybackDateMode === "paid" && buybackPaidFrom) {
      rows = rows.filter(
        (row) =>
          row.paidDate && new Date(row.paidDate) >= new Date(buybackPaidFrom)
      );
    }
    if (buybackDateMode === "paid" && buybackPaidTo) {
      rows = rows.filter(
        (row) =>
          row.paidDate && new Date(row.paidDate) <= new Date(buybackPaidTo)
      );
    }
    const sorted = [...rows];
    switch (buybackSort) {
      case "buyback_asc":
        sorted.sort(
          (a, b) => new Date(a.buybackDate) - new Date(b.buybackDate)
        );
        break;
      case "amount_desc":
        sorted.sort((a, b) => b.amount - a.amount);
        break;
      case "amount_asc":
        sorted.sort((a, b) => a.amount - b.amount);
        break;
      case "name_asc":
        sorted.sort((a, b) => a.personName.localeCompare(b.personName));
        break;
      case "status":
        sorted.sort((a, b) => a.status.localeCompare(b.status));
        break;
      default:
        sorted.sort(
          (a, b) => new Date(b.buybackDate) - new Date(a.buybackDate)
        );
        break;
    }
    return sorted;
  }, [
    buybackRows,
    buybackSearch,
    buybackStatusFilter,
    buybackStageFilter,
    buybackSort,
    buybackDateMode,
    buybackDateFrom,
    buybackDateTo,
    buybackPaidFrom,
    buybackPaidTo,
  ]);

  const pagedBuybacks = useMemo(() => {
    const start = (buybackPage - 1) * 10;
    return filteredBuybacks.slice(start, start + 10);
  }, [filteredBuybacks, buybackPage]);

  const totalBuybackPages = Math.max(
    1,
    Math.ceil(filteredBuybacks.length / 10)
  );

  useEffect(() => {
    setCommissionPage(1);
  }, [
    commissionSearch,
    commissionStageFilter,
    commissionBalanceFilter,
    commissionMinEarned,
  ]);

  const pagedCommissionRows = useMemo(
    () => commissionTableRows,
    [commissionTableRows]
  );

  const totalCommissionPages = Math.max(
    1,
    Math.ceil(commissionTotal / 10)
  );

  const filteredProfileList = useMemo(() => {
    if (!profileSearch) return people;
    const term = profileSearch.toLowerCase();
    return people.filter((person) =>
      person.name.toLowerCase().includes(term)
    );
  }, [people, profileSearch]);

  const getSaleProjectName = useCallback(
    (sale) => {
      if (!sale) return "";
      return sale.projectId
        ? projectsById[sale.projectId]?.name || ""
        : sale.propertyName || "";
    },
    [projectsById]
  );

  const getSaleBlockName = useCallback(
    (sale) => {
      if (!sale) return "";
      return sale.blockId ? blocksById[sale.blockId]?.name || "" : "";
    },
    [blocksById]
  );

  const resolveSaleLocation = (projectId, fallback = "") => {
    const project = projectsById[projectId];
    if (!project) return fallback;
    const parts = [
      project.address,
      project.city,
      project.state,
      project.pincode,
    ].filter(Boolean);
    return parts.join(", ");
  };

  const addMonths = (dateStr, months) => {
    const date = new Date(dateStr);
    date.setMonth(date.getMonth() + months);
    return date.toISOString().split("T")[0];
  };

  const addWorkingDays = (dateStr, days) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return null;
    let remaining = days;
    while (remaining > 0) {
      date.setDate(date.getDate() + 1);
      const day = date.getDay();
      if (day !== 0 && day !== 6) {
        remaining -= 1;
      }
    }
    return date;
  };

  const getLocalPhone = (value) => {
    if (!value) return "";
    const digits = value.replace(/\D/g, "");
    const trimmed = digits.startsWith("91") ? digits.slice(2) : digits;
    return trimmed.slice(0, 10);
  };

  const getNowLocal = () => {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  };

  const getTodayLocal = () => getNowLocal().slice(0, 10);

  const toDateTimeLocal = (value) => {
    if (!value) return "";
    if (value.includes("T")) return value.slice(0, 16);
    return `${value}T00:00`;
  };

  const resetPersonForm = () => {
    setPersonForm({
      name: "",
      phone: "+91",
      sponsorId: "",
      joinDate: getNowLocal(),
      investmentAmount: "",
      investmentArea: "",
      investmentDate: getNowLocal(),
      buybackMonths: "",
      returnPercent: "",
      projectId: "",
      blockId: "",
      propertyId: "",
    });
    setPersonNameError("");
  };

  const resetEditPersonForm = () => {
    setEditPersonForm({
      name: "",
      phone: "+91",
      joinDate: "",
      investmentArea: "",
      investmentId: "",
      returnPercent: "",
    });
    setEditingPersonId(null);
    setEditPersonNameError("");
  };

  const resetSaleForm = () => {
    setSaleForm({
      sellerId: "",
      projectId: "",
      blockId: "",
      propertyId: "",
      areaSqYd: "",
      totalAmount: "",
      saleDate: getNowLocal(),
      payments: [{ amount: "", date: getTodayLocal() }],
      existingPayments: [],
    });
    setEditingSaleId(null);
  };

  const resetProjectForm = () => {
    setProjectForm({
      name: "",
      city: "",
      state: "",
      pincode: "",
      address: "",
      totalArea: "",
        blocksCount: "",
      blocks: [],
    });
    setPincodeOptions([]);
    setPincodeLoading(false);
    setPincodeError("");
    setPincodeSelected(false);
    setPincodeQuery("");
    latestPincodeQuery.current = "";
  };

  const resetPaymentForm = () => {
    setPaymentForm({
      saleId: "",
      amount: "",
      date: getTodayLocal(),
    });
  };

  const resetCommissionForm = () => {
    setCommissionForm({
      personId: "",
      amount: "",
      date: getNowLocal(),
      note: "",
    });
    setCommissionBalance(null);
  };

  const resetEmployeeForm = () => {
    setEmployeeForm({
      name: "",
      role: "",
      phone: "",
      joinDate: getNowLocal(),
      monthlySalary: "",
    });
    setEditingEmployeeId("");
  };

  const handleCreatePerson = async (event) => {
    event.preventDefault();
    setFormError("");
    if (!hasPermission("people:write")) {
      setFormError("You do not have permission to add members.");
      return;
    }
    if (
      !personForm.name ||
      !personForm.joinDate ||
      !personForm.phone ||
      !personForm.sponsorId
    ) {
      setFormError("All fields are required.");
      return;
    }
    if (personNameError) {
      setFormError("Please fix the name error.");
      return;
    }
    const phoneDigits = getLocalPhone(personForm.phone);
    if (phoneDigits.length !== 10) {
      setFormError("Phone number must include +91 and 10 digits.");
      return;
    }
      if (
        !personForm.investmentAmount ||
        !personForm.investmentDate ||
        !personForm.investmentArea ||
        !personForm.buybackMonths ||
        !personForm.returnPercent ||
        !personForm.projectId ||
        !personForm.blockId ||
        !personForm.propertyId
      ) {
        setFormError("All fields are required.");
        return;
      }
      if (Number(personForm.returnPercent) < 100) {
        setFormError("Return percentage must be at least 100.");
        return;
      }
    try {
      const trimmedName = personForm.name.trim();
      if (
        peopleLookup.some(
          (person) =>
            person.name.trim().toLowerCase() === trimmedName.toLowerCase()
        )
      ) {
        setFormError("Person name must be unique.");
        return;
      }
      let sponsorStage = null;
      if (personForm.sponsorId && personForm.sponsorId !== "owner") {
        sponsorStage = 1;
      }
      const response = await createPerson({
        name: trimmedName,
        sponsor_id:
          personForm.sponsorId === "owner" ? null : personForm.sponsorId || null,
        sponsor_stage: sponsorStage,
        phone: personForm.phone || null,
        join_date: personForm.joinDate,
      });

      await createInvestment({
        person_id: response.id,
        stage: 1,
        amount: Number(personForm.investmentAmount),
        area_sq_yd: Number(personForm.investmentArea),
        date: personForm.investmentDate,
        buyback_date: addMonths(
          personForm.investmentDate,
          Number(personForm.buybackMonths)
        ),
        buyback_months: Number(personForm.buybackMonths),
        return_percent: Number(personForm.returnPercent),
        project_id: personForm.projectId,
        block_id: personForm.blockId,
        property_id: personForm.propertyId,
        status: "pending",
      });

      await loadData();
      setShowPersonModal(false);
      resetPersonForm();
      addNotification("Member added successfully.");
    } catch (err) {
      console.error(err);
      setFormError("Failed to save the person.");
    }
  };

  const handleUpdatePerson = async (event) => {
    event.preventDefault();
    setFormError("");
    if (!hasPermission("people:write")) {
      setFormError("You do not have permission to edit members.");
      return;
    }
    if (!editingPersonId) return;
    if (!editPersonForm.name || !editPersonForm.joinDate || !editPersonForm.phone) {
      setFormError("All fields are required.");
      return;
    }
      if (editPersonNameError) {
        setFormError("Please fix the name error.");
        return;
      }
      if (Number(editPersonForm.returnPercent || 0) < 100) {
        setFormError("Return percentage must be at least 100.");
        return;
      }
    try {
      const trimmedName = editPersonForm.name.trim();
      const phoneDigits = getLocalPhone(editPersonForm.phone);
      if (phoneDigits.length !== 10) {
        setFormError("Phone number must include +91 and 10 digits.");
        return;
      }
      if (
        peopleLookup.some(
          (person) =>
            person.id !== editingPersonId &&
            person.name.trim().toLowerCase() === trimmedName.toLowerCase()
        )
      ) {
        setFormError("Person name must be unique.");
        return;
      }
      await updatePerson(editingPersonId, {
        name: trimmedName,
        phone: editPersonForm.phone || null,
        join_date: editPersonForm.joinDate,
      });
      if (editPersonForm.investmentId) {
        await updateInvestment(editPersonForm.investmentId, {
          area_sq_yd: Number(editPersonForm.investmentArea) || 0,
          return_percent: Number(editPersonForm.returnPercent) || 200,
        });
      }
      await loadData();
      setShowEditPersonModal(false);
      resetEditPersonForm();
      addNotification("Member updated successfully.");
    } catch (err) {
      console.error(err);
      setFormError("Failed to update the person.");
    }
  };

  const handleCreateSale = async (event) => {
    event.preventDefault();
    setFormError("");
    if (!hasPermission("sales:write")) {
      setFormError("You do not have permission to manage sales.");
      return;
    }
    if (
      !saleForm.sellerId ||
      !saleForm.projectId ||
      !saleForm.blockId ||
      !saleForm.propertyId ||
      !saleForm.areaSqYd ||
      !saleForm.totalAmount ||
      !saleForm.saleDate
    ) {
      setFormError("All sale fields are required.");
      return;
    }
    try {
      const locationValue = resolveSaleLocation(
        saleForm.projectId,
        editingSaleId ? salesById[editingSaleId]?.location || "" : ""
      );
      let saleId = editingSaleId;
      if (editingSaleId) {
        await updateSale(editingSaleId, {
          seller_id: saleForm.sellerId,
          project_id: saleForm.projectId,
          block_id: saleForm.blockId,
          property_id: saleForm.propertyId,
          location: locationValue,
          area_sq_yd: Number(saleForm.areaSqYd),
          total_amount: Number(saleForm.totalAmount),
          sale_date: saleForm.saleDate,
        });
      } else {
        const response = await createSale({
          seller_id: saleForm.sellerId,
          project_id: saleForm.projectId,
          block_id: saleForm.blockId,
          property_id: saleForm.propertyId,
          location: locationValue,
          area_sq_yd: Number(saleForm.areaSqYd),
          total_amount: Number(saleForm.totalAmount),
          sale_date: saleForm.saleDate,
        });
        saleId = response.id;
      }

      const paymentPayloads = saleForm.payments.filter(
        (payment) => payment.amount && payment.date
      );
      const scheduledTotal = paymentPayloads.reduce(
        (acc, payment) => acc + Number(payment.amount),
        0
      );
      if (scheduledTotal > Number(saleForm.totalAmount)) {
        setFormError("Total payments cannot exceed the property amount.");
        return;
      }

      for (const payment of paymentPayloads) {
        await createPayment({
          sale_id: saleId,
          amount: Number(payment.amount),
          date: payment.date,
        });
      }

      await loadData();
      setShowSaleModal(false);
      resetSaleForm();
      addNotification(editingSaleId ? "Sale updated successfully." : "Sale added successfully.");
    } catch (err) {
      console.error(err);
      setFormError("Failed to save the sale.");
    }
  };

  const openEditSale = (sale) => {
    const run = async () => {
      try {
        const saleId = typeof sale === "string" ? sale : sale?.id;
        if (!saleId) return;
        const detail = await fetchSaleDetail(saleId);
        const saleRow = detail.sale;
        await ensureBlockProperties(saleRow.block_id, "all");
        setEditingSaleId(saleRow.id);
        setSaleForm({
          sellerId: saleRow.seller_id,
          projectId: saleRow.project_id || "",
          blockId: saleRow.block_id || "",
          propertyId: saleRow.property_id || "",
          areaSqYd: saleRow.area_sq_yd,
          totalAmount: saleRow.total_amount,
          saleDate: toDateTimeLocal(saleRow.sale_date),
          payments: [{ amount: "", date: getTodayLocal() }],
          existingPayments: detail.payments || [],
        });
        setFormError("");
        setShowSaleModal(true);
      } catch (err) {
        console.error(err);
        setFormError("Failed to load sale details.");
      }
    };
    run();
  };

  const openPaymentModal = (sale) => {
    const run = async () => {
      try {
        const saleId = typeof sale === "string" ? sale : sale?.id;
        if (!saleId) return;
        const detail = await fetchSaleDetail(saleId);
        setPaymentSaleDetail(detail);
        setPaymentForm({
          saleId,
          amount: "",
          date: getTodayLocal(),
        });
        setFormError("");
        setShowPaymentModal(true);
      } catch (err) {
        console.error(err);
        setFormError("Failed to load sale details.");
      }
    };
    run();
  };

  const handleCreatePayment = async (event) => {
    event.preventDefault();
    setFormError("");
    if (!paymentForm.saleId || !paymentForm.amount || !paymentForm.date) {
      setFormError("All payment fields are required.");
      return;
    }
    const sale = paymentSaleDetail?.sale || salesById[paymentForm.saleId];
    const paidSoFar = paymentSaleDetail?.payments
      ? paymentSaleDetail.payments.reduce(
          (acc, payment) => acc + payment.amount,
          0
        )
      : sale
      ? sumPayments(sale.payments || [])
      : 0;
    const remaining = sale
      ? (sale.total_amount || sale.totalAmount) - paidSoFar
      : 0;
    if (remaining <= 0) {
      setFormError("This sale is already fully paid.");
      return;
    }
    if (Number(paymentForm.amount) > remaining) {
      setFormError("Payment exceeds remaining amount.");
      return;
    }
    try {
      await createPayment({
        sale_id: paymentForm.saleId,
        amount: Number(paymentForm.amount),
        date: paymentForm.date,
      });
      await loadData();
      setShowPaymentModal(false);
      resetPaymentForm();
      setPaymentSaleDetail(null);
      addNotification("Payment added successfully.");
    } catch (err) {
      console.error(err);
      setFormError("Failed to add payment.");
    }
  };

  const handleCreateProject = async (event) => {
    event.preventDefault();
    setFormError("");
    if (!hasPermission("projects:write")) {
      setFormError("You do not have permission to add projects.");
      return;
    }
    const trimmedName = projectForm.name.trim();
    if (
      !trimmedName ||
      !projectForm.city ||
      !projectForm.state ||
      !projectForm.pincode ||
      !projectForm.address ||
      !projectForm.blocksCount
    ) {
      setFormError("All project fields are required.");
      return;
    }
    if (!pincodeSelected) {
      setFormError("Select a pincode from the dropdown.");
      return;
    }
    const blocks = projectForm.blocks || [];
    if (!blocks.length || blocks.length !== Number(projectForm.blocksCount)) {
      setFormError("Please add all block details.");
      return;
    }
    if (
      blocks.some(
        (block) =>
          !block.name?.trim() || !block.totalProperties
      )
    ) {
      setFormError("Each block needs a name and total properties.");
      return;
    }
    try {
      await createProject({
        name: trimmedName,
        city: projectForm.city.trim(),
        state: projectForm.state.trim(),
        pincode: projectForm.pincode.trim(),
        address: projectForm.address.trim(),
        total_area: projectForm.totalArea ? Number(projectForm.totalArea) : null,
        blocks: blocks.map((block) => ({
          name: block.name.trim(),
          total_properties: Number(block.totalProperties),
        })),
      });
      await loadData();
      setShowProjectModal(false);
      resetProjectForm();
      addNotification("Project added successfully.");
    } catch (err) {
      console.error(err);
      setFormError("Failed to add project.");
    }
  };

  const handleSaveEmployee = async (event) => {
    event.preventDefault();
    setEmployeeFormError("");
    if (!hasPermission("employees:write")) {
      setEmployeeFormError("You do not have permission to manage employees.");
      return;
    }
    if (
      !employeeForm.name ||
      !employeeForm.role ||
      !employeeForm.joinDate ||
      !employeeForm.monthlySalary
    ) {
      setEmployeeFormError("All fields are required.");
      return;
    }
    try {
      if (editingEmployeeId) {
        await updateEmployee(editingEmployeeId, {
          name: employeeForm.name.trim(),
          role: employeeForm.role.trim(),
          phone: employeeForm.phone || null,
          join_date: employeeForm.joinDate,
          monthly_salary: Number(employeeForm.monthlySalary),
        });
        addNotification("Employee updated.");
      } else {
        await createEmployee({
          name: employeeForm.name.trim(),
          role: employeeForm.role.trim(),
          phone: employeeForm.phone || null,
          join_date: employeeForm.joinDate,
          monthly_salary: Number(employeeForm.monthlySalary),
        });
        addNotification("Employee added.");
      }
      await loadData();
      setShowEmployeeModal(false);
      resetEmployeeForm();
    } catch (err) {
      console.error(err);
      setEmployeeFormError(err?.message || "Failed to save employee.");
    }
  };

  const handleSaveSalaryPayment = async (event) => {
    event.preventDefault();
    setEmployeeFormError("");
    if (!hasPermission("employees:write")) {
      setEmployeeFormError("You do not have permission to pay salaries.");
      return;
    }
    if (!salaryForm.employeeId || !salaryForm.month || !salaryForm.amount) {
      setEmployeeFormError("All fields are required.");
      return;
    }
    const releaseDate = getNextMonthReleaseDate(salaryForm.month);
    if (new Date() < releaseDate) {
      setEmployeeFormError("Salary release date has not arrived yet.");
      return;
    }
    try {
      await createSalaryPayment({
        employee_id: salaryForm.employeeId,
        month: salaryForm.month,
        amount: Number(salaryForm.amount),
        paid_date: salaryForm.paidDate,
      });
      await loadData();
      setShowSalaryModal(false);
      setSalaryForm({
        employeeId: "",
        month: "",
        amount: "",
        paidDate: "",
      });
      addNotification("Salary payment recorded.");
    } catch (err) {
      console.error(err);
      setEmployeeFormError(err?.message || "Failed to record salary payment.");
    }
  };

  const handleCreateCommissionPayment = async (event) => {
    event.preventDefault();
    setFormError("");
    if (!hasPermission("commissions:write")) {
      setFormError("You do not have permission to record payouts.");
      return;
    }
    if (!commissionForm.personId || !commissionForm.amount || !commissionForm.date) {
      setFormError("Select a person, amount, and date.");
      return;
    }
    const balance = commissionBalance
      ? Math.max(
          0,
          (commissionBalance.totalCommission || 0) -
            (commissionBalance.totalPaid || 0)
        )
      : 0;
    if (balance <= 0) {
      setFormError("No commission balance available for this member.");
      return;
    }
    if (Number(commissionForm.amount) > balance) {
      setFormError("Payout cannot exceed the available balance.");
      return;
    }
    try {
      await createCommissionPayment({
        person_id: commissionForm.personId,
        amount: Number(commissionForm.amount),
        date: commissionForm.date,
        note: commissionForm.note || null,
      });
      await loadData();
      setShowCommissionModal(false);
      resetCommissionForm();
      addNotification("Commission payout recorded.");
    } catch (err) {
      console.error(err);
      setFormError("Failed to record commission payment.");
    }
  };

  const handleSaveConfig = async () => {
    if (!hasPermission("settings:write")) {
      setFormError("You do not have permission to edit settings.");
      return;
    }
    setConfigSaving(true);
    setConfigAppliedMsg("");
    try {
      await updateCommissionConfig(commissionConfig);
      if (
        hasPermission("commissions:read") ||
        hasPermission("settings:read")
      ) {
        try {
          const history = await fetchCommissionConfigHistory();
          setCommissionConfigHistory(history || []);
        } catch (historyErr) {
          console.error(historyErr);
        }
      }
      setConfigEditing(false);
      setConfigSnapshot(null);
      setConfigAppliedMsg("");
      addNotification("Rates updated successfully.");
    } catch (err) {
      console.error(err);
      setFormError("Failed to save commission settings.");
    } finally {
      setConfigSaving(false);
    }
  };

  const handleUndoActivity = async (logId) => {
    try {
      await undoActivity(logId);
      setActivityLogs((prev) =>
        prev.map((log) =>
          log.id === logId ? { ...log, status: "undone" } : log
        )
      );
      if (activeView === "activity") {
        await refreshActivityLogs();
      }
      await loadData();
    } catch (err) {
      console.error(err);
      setFormError("Undo failed.");
    }
  };

  const confirmUndoActivity = (log) => {
    if (!log) return;
    setPendingUndo({
      id: log.id,
      label: getActivityEntityLabel(log),
      action: log.action_type,
    });
  };

  const handleConfirmUndo = async () => {
    if (!pendingUndo) return;
    const id = pendingUndo.id;
    setPendingUndo(null);
    await handleUndoActivity(id);
  };

  const formatActivityLabel = (value) =>
    value
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");

  const resolveActivityValue = (key, value, log = null) => {
    if (value === null || value === undefined) return "-";
    if (!canSeeCommission) {
      const lowerKey = String(key).toLowerCase();
      const isCommissionLog =
        lowerKey.includes("commission") ||
        lowerKey.includes("personal_rate") ||
        lowerKey.includes("level_rates") ||
        lowerKey.includes("personal_rates") ||
        (log &&
          (String(log.action_type).toLowerCase().includes("commission") ||
            log.entity_type === "commission_payment"));
      if (isCommissionLog) return "Restricted";
    }
    if (key === "person_id" && peopleIndex[value]) {
      return formatName(peopleIndex[value].name);
    }
    if (key === "sponsor_id" && peopleIndex[value]) {
      return formatName(peopleIndex[value].name);
    }
    if (key === "seller_id" && peopleIndex[value]) {
      return formatName(peopleIndex[value].name);
    }
    if (key === "project_id" && projectsById[value]) {
      return projectsById[value].name;
    }
    if (key === "block_id" && blocksById[value]) {
      return blocksById[value].name;
    }
    if (key === "property_id" && propertiesById[value]) {
      return propertiesById[value].name;
    }
    if (key === "employee_id" && employeesById[value]) {
      return formatName(employeesById[value].name);
    }
    if (key === "sale_id" && salesById[value]) {
      const sale = salesById[value];
      const project = getSaleProjectName(sale);
      const block = getSaleBlockName(sale);
      return block ? `${project} - ${block}` : project;
    }
    if (key === "entity_id" && salesById[value]) {
      const sale = salesById[value];
      const project = getSaleProjectName(sale);
      const block = getSaleBlockName(sale);
      return block ? `${project} - ${block}` : project;
    }
    if (key === "entity_id" && peopleIndex[value]) {
      return formatName(peopleIndex[value].name);
    }
    return String(value);
  };

  const getActivityEntityLabel = (log) => {
    if (log.entity_type === "person") {
      return formatName(peopleIndex[log.entity_id]?.name || "PERSON");
    }
    if (log.entity_type === "employee") {
      return formatName(employeesById[log.entity_id]?.name || "EMPLOYEE");
    }
    if (log.entity_type === "salary_payment") {
      const payload = log.payload_json ? JSON.parse(log.payload_json) : null;
      const empId = payload?.employee_id;
      const name = empId && employeesById[empId] ? employeesById[empId].name : "";
      return name ? `${formatName(name)} Salary` : "SALARY";
    }
    if (log.entity_type === "sale") {
      const sale = salesById[log.entity_id];
      if (!sale) return "PROPERTY";
      const project = getSaleProjectName(sale);
      const block = getSaleBlockName(sale);
      const property = sale.propertyId
        ? propertiesById[sale.propertyId]?.name || ""
        : "";
      const label = [project, block, property].filter(Boolean).join(" - ");
      return label || project;
    }
    if (log.entity_type === "project") {
      return projectsById[log.entity_id]?.name || "PROJECT";
    }
    if (log.entity_type === "payment") {
      const payload = log.payload_json ? JSON.parse(log.payload_json) : null;
      const saleId = payload?.sale_id;
      if (saleId && salesById[saleId]) {
        const sale = salesById[saleId];
        const project = getSaleProjectName(sale);
        const block = getSaleBlockName(sale);
        const property = sale.propertyId
          ? propertiesById[sale.propertyId]?.name || ""
          : "";
        const label = [project, block, property].filter(Boolean).join(" - ");
        return label || project;
      }
      return "PAYMENT";
    }
    if (log.entity_type === "investment") {
      const payload = log.payload_json ? JSON.parse(log.payload_json) : null;
      const personId = payload?.person_id;
      return personId && peopleIndex[personId]
        ? formatName(peopleIndex[personId].name)
        : "INVESTMENT";
    }
    if (log.entity_type === "commission_payment") {
      const payload = log.payload_json ? JSON.parse(log.payload_json) : null;
      const personId = payload?.person_id;
      return personId && peopleIndex[personId]
        ? formatName(peopleIndex[personId].name)
        : "PAYOUT";
    }
    if (log.entity_type === "export") {
      return log.entity_id || "EXPORT";
    }
    if (log.entity_type === "config") {
      return "COMMISSION SETTINGS";
    }
    return log.entity_type;
  };

  const filteredActivityLogs = useMemo(() => activityLogs, [activityLogs]);

  useEffect(() => {
    setActivityPage(1);
  }, [
    activitySearch,
    activityActionFilter,
    activityEntityFilter,
    activityStatusFilter,
    activityDateFrom,
    activityDateTo,
  ]);

  const pagedActivityLogs = useMemo(
    () => filteredActivityLogs,
    [filteredActivityLogs]
  );

  const totalActivityPages = Math.max(1, Math.ceil(activityTotal / 50));

  useEffect(() => {
    setUsersPage(1);
  }, [users]);

  const pagedUsers = useMemo(() => {
    const start = (usersPage - 1) * 10;
    return users.slice(start, start + 10);
  }, [users, usersPage]);

  const totalUsersPages = Math.max(1, Math.ceil(usersTotal / 10));

  const selectedCommissionRow = useMemo(() => {
    if (!commissionBalance) return null;
    return commissionBalance;
  }, [commissionBalance]);

  const parseActivityPayload = (log) => {
    if (!log || !log.payload_json) return [];
    try {
      const payload = JSON.parse(log.payload_json);
      return Object.entries(payload).map(([key, value]) => ({
        label: formatActivityLabel(key),
        value: resolveActivityValue(key, value, log),
      }));
    } catch {
      return [{ label: "Details", value: log.payload_json }];
    }
  };

  const openBuybackModal = (investment) => {
    setBuybackForm({
      investmentId: investment.id,
      paidAmount:
        investment.amount * ((investment.returnPercent || 200) / 100),
      paidDate: getNowLocal(),
    });
    setFormError("");
    setShowBuybackModal(true);
  };

  const handleSaveBuyback = async (event) => {
    event.preventDefault();
    setFormError("");
    if (!hasPermission("buybacks:write")) {
      setFormError("You do not have permission to update buybacks.");
      return;
    }
    if (!buybackForm.investmentId || !buybackForm.paidDate) {
      setFormError("Paid date is required.");
      return;
    }
    const investment = buybackRows.find(
      (row) => row.id === buybackForm.investmentId
    );
    if (investment?.buybackDate) {
      const rawDate = investment.buybackDate;
      const dueDate = rawDate.includes("T")
        ? new Date(rawDate)
        : new Date(`${rawDate}T23:59:59`);
      if (new Date() < dueDate) {
        setFormError("Buyback date is yet to come.");
        return;
      }
    }
    try {
      await updateInvestment(buybackForm.investmentId, {
        status: "paid",
        paid_amount: Number(buybackForm.paidAmount),
        paid_date: buybackForm.paidDate,
      });
      await loadData();
      setShowBuybackModal(false);
      addNotification("Buyback marked as paid.");
    } catch (err) {
      console.error(err);
      setFormError("Failed to update buyback status.");
    }
  };

  if (authLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-card">
          <h2>Loading...</h2>
          <p>Preparing your workspace.</p>
        </div>
      </div>
    );
  }

  if (!authUser) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div className="brand">
            <div className="brand-mark">MLM</div>
            <div>
              <p className="brand-title">Nimbus Realty</p>
              <p className="brand-subtitle">Commission Core</p>
            </div>
          </div>
          <h2>Sign in</h2>
          <p className="muted">Use your credentials to access the platform.</p>
          <form className="modal-form" onSubmit={handleLogin}>
            <label>
              Username
              <input
                value={loginForm.username}
                onChange={(event) =>
                  setLoginForm((prev) => ({
                    ...prev,
                    username: event.target.value,
                  }))
                }
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={loginForm.password}
                onChange={(event) =>
                  setLoginForm((prev) => ({
                    ...prev,
                    password: event.target.value,
                  }))
                }
                required
              />
            </label>
            {authError && <p className="form-error">{authError}</p>}
            <button className="primary-button" type="submit">
              Login
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-card">
          <h2>Loading data...</h2>
          <p>Connecting to the backend and preparing the dashboard.</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="loading-screen">
        <div className="loading-card">
          <h2>Connection issue</h2>
          <p>{error}</p>
          <p className="muted">
            Ensure the backend server is running on port 4000.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {mobileNavOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setMobileNavOpen(false)}
        />
      )}
      <aside className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">MLM</div>
          <div>
            <p className="brand-title">Nimbus Realty</p>
            <p className="brand-subtitle">Commission Core</p>
          </div>
        </div>
        <nav className="nav">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${
                activeView === item.id ? "nav-item-active" : ""
              }`}
              onClick={() => requestViewChange(item.id)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <p>
            {authUser?.username} - {authUser?.role}
          </p>
          <div className="footer-actions">
            <button
              className="ghost-button"
              type="button"
              onClick={() => requestViewChange("account")}
            >
              My Account
            </button>
            <button className="ghost-button" type="button" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <div className="toast-stack">
          {notifications.map((note) => (
            <div className="toast" key={note.id}>
              <span>{note.message}</span>
              <button
                className="toast-close"
                type="button"
                onClick={() =>
                  setNotifications((prev) =>
                    prev.filter((item) => item.id !== note.id)
                  )
                }
              >
                x
              </button>
            </div>
          ))}
        </div>
        <div className={`mobile-header ${mobileHeaderHidden ? "mobile-header-hidden" : ""}`}>
          <button
            className="mobile-menu"
            type="button"
            onClick={() => setMobileNavOpen(true)}
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="currentColor"
              aria-hidden="true"
            >
              <rect x="6" y="6" width="12" height="2" rx="1" />
              <rect x="6" y="11" width="12" height="2" rx="1" />
              <rect x="6" y="16" width="12" height="2" rx="1" />
            </svg>
          </button>
          <button
            className="mobile-brand"
            type="button"
            onClick={() => requestViewChange("dashboard")}
          >
            <div className="brand-mark">MLM</div>
            <div>
              <p className="brand-title">Nimbus Realty</p>
              <p className="brand-subtitle">Commission Core</p>
            </div>
          </button>
          <div className="mobile-spacer" />
        </div>
        {activeView === "dashboard" && (
          <section className="grid">
            <div className="card stat-card">
              <p>Total Sales Value</p>
              <h2>{formatCurrency(dashboardStats.totalSales)}</h2>
              <span className="muted">Across all properties</span>
            </div>
            <div className="card stat-card">
              <p>Total Area Sold</p>
              <h2>{dashboardStats.totalArea.toLocaleString()} sq yd</h2>
              <span className="muted">Sold by all executives</span>
            </div>
            <div className="card stat-card">
              <p>Total Commission Generated</p>
              <h2>{renderCommission(dashboardStats.totalCommission)}</h2>
              <span className="muted">Levels and personal rates</span>
            </div>
            <div className="card stat-card">
              <p>Pending Buybacks</p>
              <h2>{dashboardStats.pendingBuybacks.length}</h2>
              <span className="muted">Scheduled payouts</span>
            </div>

            <div className="card wide-card">
              <div className="card-header">
                <h3>Recent Property Sales</h3>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() =>
                    handleExportPrint(
                      "Recent Property Sales",
                      recentSales.map((sale) => ({
                        seller: sale.sellerName || peopleIndex[sale.sellerId]?.name,
                        project: sale.projectName || getSaleProjectName(sale),
                        block: sale.blockName || getSaleBlockName(sale),
                        property: sale.propertyName ||
                          (sale.propertyId
                            ? propertiesById[sale.propertyId]?.name || "-"
                            : "-"),
                        area_sq_yd: sale.areaSqYd,
                        total_amount: sale.totalAmount,
                        sale_date: sale.saleDate || "",
                      }))
                    )
                  }
                >
                  Export PDF
                </button>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Seller</th>
                    <th>Project</th>
                    <th>Block</th>
                    <th>Property</th>
                    <th>Property</th>
                    <th>Area</th>
                    <th>Total</th>
                    <th>Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSales.map((sale) => (
                    <tr key={sale.id}>
                      <td>{formatName(sale.sellerName || peopleIndex[sale.sellerId]?.name)}</td>
                      <td>{sale.projectName || getSaleProjectName(sale)}</td>
                      <td>{sale.blockName || getSaleBlockName(sale) || "-"}</td>
                      <td>
                        {sale.propertyName ||
                          (sale.propertyId
                            ? propertiesById[sale.propertyId]?.name || "-"
                            : "-")}
                      </td>
                      <td>{sale.areaSqYd} sq yd</td>
                      <td>{formatCurrency(sale.totalAmount)}</td>
                      <td>
                        {Math.round(
                          ((sale.paidAmount || sumPayments(sale.payments || [])) /
                            sale.totalAmount) *
                            100
                        )}
                        %
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {canSeeCommission && (
              <div className="card wide-card">
                <div className="card-header">
                  <h3>Top Earners</h3>
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() =>
                      handleExportPrint(
                        "Top Earners",
                        topEarnersList.map((entry) => ({
                          person: entry.name,
                          commission: formatCurrency(entry.totalCommission),
                          max_level: entry.maxLevel,
                        }))
                      )
                    }
                  >
                    Export PDF
                  </button>
                </div>
                <div className="chip-row">
                  {topEarnersList.map((entry) => (
                    <div className="chip" key={entry.id}>
                      <div>
                        <p className="chip-title">{entry.name}</p>
                        <p className="muted">
                          {renderCommission(entry.totalCommission)}
                        </p>
                      </div>
                      <span className="chip-tag">Level {entry.maxLevel}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {activeView === "people" && (
          <section className="grid">
            <div className="card wide-card">
              <div className="card-header">
                <h3>Team Members</h3>
                <div className="top-actions">
                  <span className="badge">Total: {peopleTotal}</span>
                  <input
                    className="table-search"
                    placeholder="Search members..."
                    value={peopleSearch}
                    onChange={(event) => {
                      setPeopleSearch(event.target.value);
                      setPeoplePage(1);
                    }}
                  />
                  <select
                    className="select"
                    value={peopleSort}
                    onChange={(event) => setPeopleSort(event.target.value)}
                  >
                    <option value="recent">Recent</option>
                    <option value="alpha">A to Z</option>
                    {canSeeCommission && (
                      <option value="commission">Most Commission Earned</option>
                    )}
                    <option value="stage">Higher Stage</option>
                    <option value="recruits">Most Direct Recruits</option>
                  </select>
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() =>
                      handleExportCsv(
                        "people.csv",
                        peopleTableRows.map((person) => ({
                          name: person.name,
                          sponsor: person.sponsor_name || "Owner",
                          stage: person.stage,
                          recruits: person.direct_recruits,
                          phone: person.phone || "",
                        }))
                      )
                    }
                  >
                    Export Excel
                  </button>
                  {hasPermission("people:write") && (
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() => {
                        setFormError("");
                        resetPersonForm();
                        setShowPersonModal(true);
                      }}
                    >
                      Add Person
                    </button>
                  )}
                </div>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Referred By</th>
                    <th>Stage</th>
                    <th>Direct Recruits</th>
                    <th>Invested Area</th>
                    <th>Max Level</th>
                    {canSeeCommission && <th>Total Commission</th>}
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedPeopleTable.map((person) => (
                    <tr key={person.id}>
                      <td>
                        <button
                          className="link-button"
                          type="button"
                          onClick={() => openPersonProfile(person.id)}
                        >
                          {formatName(person.name)}
                        </button>
                      </td>
                      <td>{formatName(person.sponsor_name || "OWNER")}</td>
                      <td>
                        Stage {person.stage} - {stageTitles[person.stage]}
                      </td>
                      <td>{person.direct_recruits}</td>
                      <td>
                        {person.invested_area
                          ? `${person.invested_area} sq yd`
                          : "-"}
                      </td>
                      <td>Level {person.max_level}</td>
                      {canSeeCommission && (
                        <td>{formatCurrency(person.total_commission || 0)}</td>
                      )}
                      <td className="table-actions">
                        {hasPermission("people:write") ? (
                          <button
                            className="ghost-button"
                            type="button"
                            onClick={() => {
                              const go = async () => {
                                if (!fullDataLoaded) {
                                  await loadData();
                                }
                                const fullPerson = people.find(
                                  (item) => item.id === person.id
                                );
                                if (!fullPerson) {
                                  openPersonProfile(person.id);
                                  return;
                                }
                                const joinInvestment = fullPerson.investments
                                  ? [...fullPerson.investments].sort(
                                      (a, b) =>
                                        new Date(a.date) - new Date(b.date)
                                    )[0]
                                  : null;
                                setEditingPersonId(fullPerson.id);
                                setEditPersonForm({
                                  name: fullPerson.name,
                                  phone: fullPerson.phone || "+91",
                                  joinDate: toDateTimeLocal(fullPerson.joinDate),
                                  investmentArea: joinInvestment?.areaSqYd || "",
                                  investmentId: joinInvestment?.id || "",
                                  returnPercent:
                                    joinInvestment?.returnPercent || 200,
                                });
                                setFormError("");
                                setShowEditPersonModal(true);
                              };
                              go();
                            }}
                          >
                            Edit
                          </button>
                        ) : (
                          <span className="muted">Restricted</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="pagination">
                <button
                  className="ghost-button"
                  type="button"
                  disabled={peoplePage === 1}
                  onClick={() => setPeoplePage((prev) => Math.max(1, prev - 1))}
                >
                  Prev
                </button>
                <span>
                  Page {peoplePage} of {totalPeoplePages}
                </span>
                <button
                  className="ghost-button"
                  type="button"
                  disabled={peoplePage === totalPeoplePages}
                  onClick={() =>
                    setPeoplePage((prev) =>
                      Math.min(totalPeoplePages, prev + 1)
                    )
                  }
                >
                  Next
                </button>
              </div>
            </div>
            )}
          </section>
        )}

        {activeView === "employees" && (
          <section className="grid">
            <div className="card wide-card">
              <div className="card-header">
                <h3>Employees</h3>
                <div className="top-actions">
                  <span className="badge">Total: {employees.length}</span>
                  <input
                    className="table-search"
                    placeholder="Search employees..."
                    value={employeeSearch}
                    onChange={(event) => {
                      setEmployeeSearch(event.target.value);
                      setEmployeePage(1);
                    }}
                  />
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() =>
                      handleExportCsv(
                        "employees.csv",
                        filteredEmployees.map((emp) => ({
                          name: formatName(emp.name),
                          role: emp.role,
                          phone: emp.phone || "",
                          join_date: emp.join_date,
                          monthly_salary: emp.monthly_salary,
                          current_month_salary:
                            emp.remainingDays === 0
                              ? "Starts next month"
                              : emp.proratedSalary,
                          release_date: emp.releaseDate
                            ? emp.releaseDate.toISOString()
                            : "",
                          status: emp.payment ? "Paid" : "Pending",
                        }))
                      )
                    }
                  >
                    Export Excel
                  </button>
                  {hasPermission("employees:write") && (
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() => {
                        setEmployeeFormError("");
                        resetEmployeeForm();
                        setShowEmployeeModal(true);
                      }}
                    >
                      Add Employee
                    </button>
                  )}
                </div>
              </div>
              <p className="muted">
                Salary cycle is monthly (1st to last day). Release date is the
                7th of the following month.
              </p>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Phone</th>
                    <th>Join Date</th>
                    <th>Monthly Salary</th>
                    <th>Current Month Salary</th>
                    <th>Release Date</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedEmployees.map((emp) => {
                    const paid = !!emp.payment;
                    const statusLabel = paid ? "Paid" : "Pending";
                    return (
                      <tr key={emp.id}>
                        <td>{formatName(emp.name)}</td>
                        <td>{emp.role}</td>
                        <td>{emp.phone || "-"}</td>
                        <td>{formatDate(emp.join_date)}</td>
                        <td>{formatCurrency(emp.monthly_salary)}</td>
                        <td>
                          {emp.remainingDays === 0
                            ? "Starts next month"
                            : formatCurrency(emp.proratedSalary)}
                        </td>
                        <td>{formatDate(emp.releaseDate.toISOString())}</td>
                        <td>{statusLabel}</td>
                        <td className="table-actions">
                          {hasPermission("employees:write") ? (
                            <>
                              <button
                                className="ghost-button"
                                type="button"
                                onClick={() => {
                                  setEditingEmployeeId(emp.id);
                                  setEmployeeForm({
                                    name: emp.name,
                                    role: emp.role,
                                    phone: emp.phone || "",
                                    joinDate: toDateTimeLocal(emp.join_date),
                                    monthlySalary: emp.monthly_salary,
                                  });
                                  setEmployeeFormError("");
                                  setShowEmployeeModal(true);
                                }}
                              >
                                Edit
                              </button>
                              {!paid && emp.remainingDays > 0 && (
                                <button
                                  className="ghost-button"
                                  type="button"
                                  onClick={() => {
                                    setSalaryForm({
                                      employeeId: emp.id,
                                      month: emp.monthKey,
                                      amount: emp.proratedSalary,
                                      paidDate: getNowLocal(),
                                    });
                                    setEmployeeFormError("");
                                    setShowSalaryModal(true);
                                  }}
                                >
                                  Mark Paid
                                </button>
                              )}
                            </>
                          ) : (
                            <span className="muted">Restricted</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="pagination">
                <button
                  className="ghost-button"
                  type="button"
                  disabled={employeePage === 1}
                  onClick={() =>
                    setEmployeePage((prev) => Math.max(1, prev - 1))
                  }
                >
                  Prev
                </button>
                <span>
                  Page {employeePage} of {totalEmployeePages}
                </span>
                <button
                  className="ghost-button"
                  type="button"
                  disabled={employeePage === totalEmployeePages}
                  onClick={() =>
                    setEmployeePage((prev) =>
                      Math.min(totalEmployeePages, prev + 1)
                    )
                  }
                >
                  Next
                </button>
              </div>
            </div>
            )}
          </section>
        )}

        {activeView === "projects" && (
          <section className="grid">
            <div className="card wide-card">
              <div className="card-header">
                <h3>Projects</h3>
                <div className="top-actions">
                  <input
                    className="table-search"
                    placeholder="Search projects..."
                    value={projectSearch}
                    onChange={(event) => setProjectSearch(event.target.value)}
                  />
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() =>
                      handleExportCsv(
                        "projects.csv",
                        filteredProjects.map((project) => {
                          const stats = projectPropertyStats[project.id] || {
                            total: 0,
                            available: 0,
                            sold: 0,
                            bySale: 0,
                            byInvestment: 0,
                          };
                          return {
                            project: project.name,
                            city: project.city,
                            state: project.state,
                            pincode: project.pincode,
                            blocks: blocksForProject(project.id).length,
                            total_properties: stats.total,
                            available: stats.available,
                            sold: stats.sold,
                            sales: stats.bySale,
                            investments: stats.byInvestment,
                          };
                        })
                      )
                    }
                  >
                    Export Excel
                  </button>
                  {hasPermission("projects:write") && (
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() => {
                        setFormError("");
                        resetProjectForm();
                        setShowProjectModal(true);
                      }}
                    >
                      Add Project
                    </button>
                  )}
                </div>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>City</th>
                    <th>Blocks</th>
                    <th>Total Properties</th>
                    <th>Available</th>
                    <th>Sold</th>
                    <th>Sales</th>
                    <th>Investments</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedProjects.map((project) => {
                    const stats = projectPropertyStats[project.id] || {
                      total: 0,
                      available: 0,
                      sold: 0,
                      bySale: 0,
                      byInvestment: 0,
                    };
                    return (
                      <tr key={project.id}>
                        <td>
                          <button
                            className="link-button"
                            type="button"
                            onClick={() => {
                              openProjectDetail(project.id);
                            }}
                          >
                            {project.name}
                          </button>
                        </td>
                        <td>{project.city}</td>
                        <td>{blocksForProject(project.id).length}</td>
                        <td>{stats.total}</td>
                        <td>{stats.available}</td>
                        <td>{stats.sold}</td>
                        <td>{stats.bySale}</td>
                        <td>{stats.byInvestment}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="pagination">
                <button
                  className="ghost-button"
                  type="button"
                  disabled={projectPage === 1}
                  onClick={() => setProjectPage((prev) => Math.max(1, prev - 1))}
                >
                  Prev
                </button>
                <span>
                  Page {projectPage} of {totalProjectPages}
                </span>
                <button
                  className="ghost-button"
                  type="button"
                  disabled={projectPage === totalProjectPages}
                  onClick={() =>
                    setProjectPage((prev) =>
                      Math.min(totalProjectPages, prev + 1)
                    )
                  }
                >
                  Next
                </button>
              </div>
            </div>
          </section>
        )}

        {activeView === "orgTree" && (
          <section className="grid">
            {!hasPermission("orgtree:read") || !hasPermission("people:read") ? (
              <div className="card wide-card">
                <h3>Organization Tree</h3>
                <p className="muted">
                  You do not have access to the organization tree.
                </p>
              </div>
            ) : (
            <div className="card wide-card">
              <div className="card-header">
                <h3>Organization Tree</h3>
                <div className="top-actions">
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() =>
                      handleExportCsv(
                        "organization_tree.csv",
                        flattenTree(orgRoots, false)
                      )
                    }
                  >
                    Export Excel
                  </button>
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() =>
                      handleExportTreePdf(
                        "Organization Tree",
                        orgRoots,
                        treeStageFilter,
                        treeSearch,
                        false
                      )
                    }
                  >
                    Export PDF
                  </button>
                </div>
              </div>
              <div className="tree-controls">
                <input
                  placeholder="Search name..."
                  value={treeSearch}
                  onChange={(event) => setTreeSearch(event.target.value)}
                />
                <select
                  value={treeStageFilter}
                  onChange={(event) => setTreeStageFilter(event.target.value)}
                >
                  <option value="all">All stages</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((stage) => (
                    <option key={`stage-${stage}`} value={stage}>
                      Stage {stage}
                    </option>
                  ))}
                </select>
                <label className="tree-zoom">
                  Zoom
                  <input
                    type="range"
                    min="0.6"
                    max="1.6"
                    step="0.1"
                    value={treeScale}
                    onChange={(event) => setTreeScale(Number(event.target.value))}
                  />
                </label>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => {
                    setTreeScale(1);
                    setTreeOffset({ x: 0, y: 0 });
                  }}
                >
                  Reset View
                </button>
              </div>
              <div
                className="tree-canvas"
                onMouseDown={(event) =>
                  startDrag(event, setTreeDragging, setTreeDragStart)
                }
                onMouseMove={(event) =>
                  onDrag(
                    event,
                    treeDragging,
                    treeDragStart,
                    setTreeDragStart,
                    setTreeOffset
                  )
                }
                onMouseUp={() => endDrag(setTreeDragging)}
                onMouseLeave={() => endDrag(setTreeDragging)}
              >
                <div
                  className="tree"
                  style={{
                    transform: `translate(${treeOffset.x}px, ${treeOffset.y}px) scale(${treeScale})`,
                  }}
                >
                  <ul>
                    {orgRoots.map((rootId) =>
                      renderTreeNode(
                        rootId,
                        treeStageFilter,
                        treeSearch,
                        0,
                        false,
                        rootId
                      )
                    )}
                  </ul>
                </div>
              </div>
            </div>
            )}
          </section>
        )}

        {activeView === "sales" && (
          <section className="grid">
            <div className="card wide-card">
              <div className="card-header">
                <h3>Property Sales Ledger</h3>
                <div className="top-actions">
                  <div className="segmented">
                    <button
                      className={`segmented-btn ${
                        salesView === "active" ? "active" : ""
                      }`}
                      type="button"
                      onClick={() => {
                        setSalesView("active");
                        setSalesPage(1);
                      }}
                    >
                      Active & Completed
                    </button>
                    <button
                      className={`segmented-btn ${
                        salesView === "cancelled" ? "active" : ""
                      }`}
                      type="button"
                      onClick={() => {
                        setSalesView("cancelled");
                        setSalesPage(1);
                      }}
                    >
                      Cancelled
                    </button>
                  </div>
                  <input
                    className="table-search"
                    placeholder="Search by seller or project..."
                    value={salesSearch}
                    onChange={(event) => {
                      setSalesSearch(event.target.value);
                      setSalesPage(1);
                    }}
                  />
                  <select
                    className="select"
                    value={salesSort}
                    onChange={(event) => setSalesSort(event.target.value)}
                  >
                    <option value="recent">Recent</option>
                    <option value="alpha">A to Z</option>
                  </select>
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() =>
                      handleExportCsv(
                        "sales.csv",
                        salesTableRows.map((sale) => ({
                          seller: sale.sellerName,
                          project: sale.projectName,
                          block: sale.blockName,
                          location: sale.location,
                          area_sq_yd: sale.areaSqYd,
                          total_amount: sale.totalAmount,
                          sale_date: sale.saleDate,
                        }))
                      )
                    }
                  >
                    Export Excel
                  </button>
                  {salesView !== "cancelled" && (
                  hasPermission("sales:write") && (
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() => {
                        setFormError("");
                        resetSaleForm();
                        setShowSaleModal(true);
                      }}
                    >
                      Add Sale
                    </button>
                  )
                  )}
                </div>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Sale Date</th>
                    <th>Seller</th>
                    <th>Project</th>
                    <th>Block</th>
                    <th>Property</th>
                    <th>Area</th>
                    <th>Total</th>
                    {salesView === "cancelled" ? (
                      <>
                        <th>Refund Amount</th>
                        <th>Cancelled At</th>
                        <th>Status</th>
                      </>
                    ) : (
                      <>
                        <th>Payments</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {pagedSalesTable.map((sale) => {
                    const fullSale = salesById[sale.id];
                    const paid = fullSale
                      ? sumPayments(fullSale.payments || [])
                      : sale.paidAmount || 0;
                    const percent = Math.min(
                      100,
                      Math.round((paid / sale.totalAmount) * 100)
                    );
                    return (
                      <tr key={sale.id}>
                        <td>{formatDate(sale.saleDate)}</td>
                        <td>{formatName(sale.sellerName)}</td>
                        <td>
                          {sale.projectId ? (
                            <button
                              className="link-button"
                              type="button"
                              onClick={() => openProjectDetail(sale.projectId)}
                            >
                              {sale.projectName || "-"}
                            </button>
                          ) : (
                            sale.propertyName || "-"
                          )}
                        </td>
                        <td>{sale.blockName || "-"}</td>
                        <td>
                          {sale.propertyId ? (
                            <button
                              className="link-button"
                              type="button"
                              onClick={() => openPropertyDetail(sale.propertyId)}
                            >
                              {sale.propertyName || "-"}
                            </button>
                          ) : (
                            sale.propertyName || "-"
                          )}
                        </td>
                        <td>{sale.areaSqYd} sq yd</td>
                        <td>{formatCurrency(sale.totalAmount)}</td>
                        {salesView === "cancelled" ? (
                          <>
                            <td>{formatCurrency(paid)}</td>
                            <td>{sale.cancelledAt ? formatDate(sale.cancelledAt) : "-"}</td>
                            <td>Cancelled</td>
                          </>
                        ) : (
                          <>
                            <td>
                              <div className="progress">
                                <div
                                  className="progress-fill"
                                  style={{ width: `${percent}%` }}
                                />
                              </div>
                              <span className="muted">{percent}% received</span>
                            </td>
                            <td>{percent === 100 ? "Completed" : "In progress"}</td>
                            <td>
                              <div className="table-actions">
                                {hasPermission("sales:write") && (
                                  <>
                                    <button
                                      className="ghost-button"
                                      type="button"
                                      onClick={() => openEditSale(sale)}
                                    >
                                      Edit
                                    </button>
                                    {paid < sale.totalAmount && (
                                      <button
                                        className="ghost-button"
                                        type="button"
                                        onClick={() => openPaymentModal(sale)}
                                      >
                                        Add Payment
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="pagination">
                <button
                  className="ghost-button"
                  type="button"
                  disabled={salesPage === 1}
                  onClick={() => setSalesPage((prev) => Math.max(1, prev - 1))}
                >
                  Prev
                </button>
                <span>
                  Page {salesPage} of {totalSalesPages}
                </span>
                <button
                  className="ghost-button"
                  type="button"
                  disabled={salesPage === totalSalesPages}
                  onClick={() =>
                    setSalesPage((prev) =>
                      Math.min(totalSalesPages, prev + 1)
                    )
                  }
                >
                  Next
                </button>
              </div>
            </div>
          </section>
        )}

        {activeView === "commissions" && (
          <section className="grid">
            <div className="card wide-card">
              <div className="card-header">
                <h3>Commission Summary</h3>
                <div className="top-actions">
                  <input
                    className="table-search"
                    placeholder="Search member..."
                    value={commissionSearch}
                    onChange={(event) => setCommissionSearch(event.target.value)}
                  />
                  <select
                    className="select"
                    value={commissionStageFilter}
                    onChange={(event) =>
                      setCommissionStageFilter(event.target.value)
                    }
                  >
                    <option value="all">All stages</option>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((stage) => (
                      <option key={`c-stage-${stage}`} value={stage}>
                        Stage {stage}
                      </option>
                    ))}
                  </select>
                  <select
                    className="select"
                    value={commissionBalanceFilter}
                    onChange={(event) =>
                      setCommissionBalanceFilter(event.target.value)
                    }
                  >
                    <option value="all">All balances</option>
                    <option value="due">Balance due</option>
                    <option value="paid">Fully paid</option>
                  </select>
                  <input
                    className="table-search"
                    type="number"
                    placeholder="Min earned"
                    value={commissionMinEarned}
                    onChange={(event) =>
                      setCommissionMinEarned(event.target.value)
                    }
                  />
                  {hasPermission("commissions:write") && (
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => {
                      setFormError("");
                      resetCommissionForm();
                      setShowCommissionModal(true);
                    }}
                  >
                    Add Payout
                  </button>
                  )}
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() =>
                      handleExportPrint(
                        "Commission Summary",
                        commissionTableRows.map((row) => ({
                          member: row.name,
                          personal_rate: row.personal_rate,
                          commission_earned: formatCurrency(row.total_commission),
                          commission_paid: formatCurrency(row.total_paid),
                          balance: formatCurrency(
                            row.total_commission - row.total_paid
                          ),
                        }))
                      )
                    }
                  >
                    Export PDF
                  </button>
                </div>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Personal Rate</th>
                    <th>Level Range</th>
                    <th>Commission Earned</th>
                    <th>Commission Paid</th>
                    <th>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedCommissionRows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.name}</td>
                      <td>{row.personal_rate}/sq yd</td>
                      <td>1-9</td>
                      <td>{formatCurrency(row.total_commission)}</td>
                      <td>{formatCurrency(row.total_paid)}</td>
                      <td>
                        {formatCurrency(row.total_commission - row.total_paid)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="pagination">
                <button
                  className="ghost-button"
                  type="button"
                  disabled={commissionPage === 1}
                  onClick={() =>
                    setCommissionPage((prev) => Math.max(1, prev - 1))
                  }
                >
                  Prev
                </button>
                <span>
                  Page {commissionPage} of {totalCommissionPages}
                </span>
                <button
                  className="ghost-button"
                  type="button"
                  disabled={commissionPage === totalCommissionPages}
                  onClick={() =>
                    setCommissionPage((prev) =>
                      Math.min(totalCommissionPages, prev + 1)
                    )
                  }
                >
                  Next
                </button>
              </div>
            </div>
          </section>
        )}

        {activeView === "buybacks" && (
          <section className="grid">
            <div className="card wide-card">
              <div className="card-header stacked-header">
                <div>
                  <h3>Buyback Schedule</h3>
                  <p className="muted">Filter, sort, and export buyback payouts.</p>
                </div>
                <div className="top-actions">
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() =>
                      handleExportCsv(
                        "buybacks.csv",
                        filteredBuybacks.map((inv) => ({
                          member: inv.personName,
                          stage: inv.stage,
                          investment: inv.amount,
                          area_sq_yd: inv.areaSqYd,
                          buyback_date: inv.buybackDate,
                          buyback_amount:
                            inv.amount * ((inv.returnPercent || 200) / 100),
                          return_percent: inv.returnPercent || 200,
                          status: inv.status,
                          paid_amount: inv.paidAmount || "",
                          paid_date: inv.paidDate || "",
                        }))
                      )
                    }
                  >
                    Export Excel
                  </button>
                </div>
              </div>
              <div className="filter-row">
                <input
                  className="table-search"
                  placeholder="Search member..."
                  value={buybackSearch}
                  onChange={(event) => {
                    setBuybackSearch(event.target.value);
                    setBuybackPage(1);
                  }}
                />
                <select
                  className="select"
                  value={buybackStatusFilter}
                  onChange={(event) => {
                    setBuybackStatusFilter(event.target.value);
                    setBuybackPage(1);
                  }}
                >
                  <option value="all">All status</option>
                  <option value="pending">Pending</option>
                  <option value="paid">Paid</option>
                </select>
                <select
                  className="select"
                  value={buybackStageFilter}
                  onChange={(event) => {
                    setBuybackStageFilter(event.target.value);
                    setBuybackPage(1);
                  }}
                >
                  <option value="all">All stages</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((stage) => (
                    <option key={`bb-stage-${stage}`} value={stage}>
                      Stage {stage}
                    </option>
                  ))}
                </select>
                <select
                  className="select"
                  value={buybackSort}
                  onChange={(event) => setBuybackSort(event.target.value)}
                >
                  <option value="buyback_desc">Buyback date (newest)</option>
                  <option value="buyback_asc">Buyback date (oldest)</option>
                  <option value="amount_desc">Amount (high to low)</option>
                  <option value="amount_asc">Amount (low to high)</option>
                  <option value="name_asc">Member name (A-Z)</option>
                  <option value="status">Status</option>
                </select>
              </div>
              <div className="filter-grid compact">
                <label>
                  Date filter
                  <select
                    className="select"
                    value={buybackDateMode}
                    onChange={(event) => {
                      setBuybackDateMode(event.target.value);
                      setBuybackPage(1);
                    }}
                  >
                    <option value="buyback">Buyback date</option>
                    <option value="paid">Paid date</option>
                  </select>
                </label>
                {buybackDateMode === "buyback" ? (
                  <>
                    <label>
                      Buyback From
                      <input
                        type="date"
                        value={buybackDateFrom}
                        onChange={(event) => {
                          setBuybackDateFrom(event.target.value);
                          setBuybackPage(1);
                        }}
                      />
                    </label>
                    <label>
                      Buyback To
                      <input
                        type="date"
                        value={buybackDateTo}
                        onChange={(event) => {
                          setBuybackDateTo(event.target.value);
                          setBuybackPage(1);
                        }}
                      />
                    </label>
                  </>
                ) : (
                  <>
                    <label>
                      Paid From
                      <input
                        type="date"
                        value={buybackPaidFrom}
                        onChange={(event) => {
                          setBuybackPaidFrom(event.target.value);
                          setBuybackPage(1);
                        }}
                      />
                    </label>
                    <label>
                      Paid To
                      <input
                        type="date"
                        value={buybackPaidTo}
                        onChange={(event) => {
                          setBuybackPaidTo(event.target.value);
                          setBuybackPage(1);
                        }}
                      />
                    </label>
                  </>
                )}
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Stage</th>
                    <th>Investment</th>
                    <th>Area</th>
                    <th>Buyback Date</th>
                    <th>Return %</th>
                    <th>Buyback Amount</th>
                    <th>Status</th>
                    <th>Paid Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedBuybacks.map((inv) => (
                    <tr key={inv.id}>
                      <td>{formatName(inv.personName)}</td>
                      <td>Stage {inv.stage}</td>
                      <td>{formatCurrency(inv.amount)}</td>
                      <td>{inv.areaSqYd} sq yd</td>
                      <td>{formatDate(inv.buybackDate)}</td>
                      <td>{inv.returnPercent || 200}%</td>
                      <td>
                        {formatCurrency(
                          inv.amount * ((inv.returnPercent || 200) / 100)
                        )}
                      </td>
                      <td>{inv.status}</td>
                      <td>{inv.paidDate ? formatDate(inv.paidDate) : "-"}</td>
                      <td className="table-actions">
                        {inv.status !== "paid" && hasPermission("buybacks:write") && (
                          <button
                            className="ghost-button"
                            type="button"
                            onClick={() => openBuybackModal(inv)}
                          >
                            Mark Paid
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="pagination">
                <button
                  className="ghost-button"
                  type="button"
                  disabled={buybackPage === 1}
                  onClick={() =>
                    setBuybackPage((prev) => Math.max(1, prev - 1))
                  }
                >
                  Prev
                </button>
                <span>
                  Page {buybackPage} of {totalBuybackPages}
                </span>
                <button
                  className="ghost-button"
                  type="button"
                  disabled={buybackPage === totalBuybackPages}
                  onClick={() =>
                    setBuybackPage((prev) =>
                      Math.min(totalBuybackPages, prev + 1)
                    )
                  }
                >
                  Next
                </button>
              </div>
            </div>
          </section>
        )}

        {activeView === "reports" && (
          <section className="grid">
            <div className="card wide-card">
              <div className="card-header">
                <h3>Reports and Analytics</h3>
                <div className="top-actions">
                  <button
                    className={`ghost-button ${
                      reportsView === "analytics" ? "active-tab" : ""
                    }`}
                    type="button"
                    onClick={() => setReportsView("analytics")}
                  >
                    Analytics
                  </button>
                  <button
                    className={`ghost-button ${
                      reportsView === "reports" ? "active-tab" : ""
                    }`}
                    type="button"
                    onClick={() => setReportsView("reports")}
                  >
                    Reports
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={handleExportAllReports}
                  >
                    Export All (CSV)
                  </button>
                </div>
              </div>
              {reportsView === "analytics" ? (
                <div className="report-grid">
                  <div className="report-card filter-card">
                    <h4>Filters</h4>
                    <div className="filter-grid">
                      <label>
                        From
                        <input
                          type="date"
                          value={reportFilters.startDate}
                          onChange={(event) =>
                            setReportFilters((prev) => ({
                              ...prev,
                              startDate: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label>
                        To
                        <input
                          type="date"
                          value={reportFilters.endDate}
                          onChange={(event) =>
                            setReportFilters((prev) => ({
                              ...prev,
                              endDate: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label>
                        Person
                        <SearchableSelect
                          value={reportFilters.personId}
                          onChange={(value) =>
                            setReportFilters((prev) => ({
                              ...prev,
                              personId: value || "all",
                            }))
                          }
                          options={[
                            { value: "all", label: "All people" },
                            ...people.map((person) => ({
                              value: person.id,
                              label: formatName(person.name),
                            })),
                          ]}
                          placeholder="Search person..."
                        />
                      </label>
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={() =>
                          setReportFilters({
                            startDate: "",
                            endDate: "",
                            personId: "all",
                          })
                        }
                      >
                        Reset Filters
                      </button>
                    </div>
                  </div>
                  <div className="report-card">
                    <h4>Totals (Filtered)</h4>
                    <div className="kpi-stack">
                      <div className="kpi-row">
                        <span>Total Team</span>
                        <strong>{filteredPeople.length}</strong>
                      </div>
                      <div className="kpi-row">
                        <span>Total Sales</span>
                        <strong>
                          {formatCurrency(
                            filteredSales.reduce(
                              (acc, sale) => acc + sale.totalAmount,
                              0
                            )
                          )}
                        </strong>
                      </div>
                      <div className="kpi-row">
                        <span>Total Commission</span>
                        <strong>
                          {canSeeCommission
                            ? formatCurrency(commissionsSummary.earned)
                            : "Restricted"}
                        </strong>
                      </div>
                    </div>
                  </div>
                  <div className="report-card">
                    <h4>Team Growth (Line)</h4>
                    <LineChart
                      data={peopleByMonth}
                      max={maxPeopleTotal}
                      stroke="#1a8a6a"
                      fill="#1a8a6a"
                    />
                    <div className="chart-legend">
                      {peopleByMonth.map((entry) => (
                        <span key={`people-${entry.month}`}>
                          {entry.month}: {entry.total}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="report-card">
                    <h4>Sales Growth (Bar)</h4>
                    <div className="bar-chart">
                      {salesByMonth.map((entry) => (
                        <div key={`sales-${entry.month}`} className="bar-item">
                          <div className="bar-label">{entry.month}</div>
                          <div className="bar-track">
                            <div
                              className="bar-fill"
                              style={{
                                width: `${maxSalesTotal
                                  ? Math.min(
                                      100,
                                      (entry.total / maxSalesTotal) * 100
                                    )
                                  : 0}%`,
                              }}
                            />
                          </div>
                          <div className="bar-value">
                            {formatCurrency(entry.total)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="report-card">
                    <h4>Area Sold Growth (Line)</h4>
                    <LineChart
                      data={areaByMonth}
                      max={maxAreaTotal}
                      stroke="#d38f5a"
                      fill="#d38f5a"
                    />
                    <div className="chart-legend">
                      {areaByMonth.map((entry) => (
                        <span key={`area-${entry.month}`}>
                          {entry.month}: {entry.total} sq yd
                        </span>
                      ))}
                    </div>
                  </div>
                  {canSeeCommission && (
                    <div className="report-card">
                      <h4>Commission Earned vs Paid (Donut)</h4>
                      <div className="donut-grid">
                        <DonutChart
                          value={commissionsSummary.paid}
                          total={commissionsSummary.earned}
                          colors={{ base: "#f1e6da", primary: "#1a8a6a" }}
                        />
                        <div className="kpi-stack">
                          <div className="kpi-row">
                            <span>Earned</span>
                            <strong>
                              {formatCurrency(commissionsSummary.earned)}
                            </strong>
                          </div>
                          <div className="kpi-row">
                            <span>Paid</span>
                            <strong>{formatCurrency(commissionsSummary.paid)}</strong>
                          </div>
                          <div className="kpi-row">
                            <span>Remaining</span>
                            <strong>
                              {formatCurrency(commissionsSummary.remaining)}
                            </strong>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="report-card">
                    <h4>Property Payments (Donut)</h4>
                    <div className="donut-grid">
                      <DonutChart
                        value={salesPaidSummary.totalPaid}
                        total={salesPaidSummary.totalDue}
                        colors={{ base: "#f1e6da", primary: "#d38f5a" }}
                      />
                      <div className="kpi-stack">
                        <div className="kpi-row">
                          <span>Received</span>
                          <strong>
                            {formatCurrency(salesPaidSummary.totalPaid)}
                          </strong>
                        </div>
                        <div className="kpi-row">
                          <span>Remaining</span>
                          <strong>
                            {formatCurrency(salesPaidSummary.totalRemaining)}
                          </strong>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="report-grid">
                  {canSeeCommission && (
                    <div className="report-card">
                      <h4>Commission Analytics</h4>
                      <p>
                        Track monthly payouts, personal rates, and top earning
                        lines.
                      </p>
                      <button
                        className="primary-button"
                        type="button"
                        onClick={() =>
                          handleExportPrint(
                            "Commission Analytics",
                            commissionSummary.peopleRows.map((row) => ({
                              member: row.person.name,
                              stage: row.stage,
                              commission: formatCurrency(row.totalCommission),
                            }))
                          )
                        }
                      >
                        Generate Report
                      </button>
                    </div>
                  )}
                  <div className="report-card">
                    <h4>Sales Funnel</h4>
                    <p>
                      Property sales velocity and payment completion statistics.
                    </p>
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() =>
                        handleExportCsv(
                          "sales_funnel.csv",
                          sales.map((sale) => ({
                            seller: peopleIndex[sale.sellerId]?.name,
                            project: getSaleProjectName(sale),
                            block: getSaleBlockName(sale),
                            total_amount: sale.totalAmount,
                            paid: sumPayments(sale.payments),
                            remaining: Math.max(
                              sale.totalAmount - sumPayments(sale.payments),
                              0
                            ),
                          }))
                        )
                      }
                    >
                      Export Excel
                    </button>
                  </div>
                  <div className="report-card">
                    <h4>Team Growth</h4>
                    <p>
                      Direct recruit growth per stage and level depth tracking.
                    </p>
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() =>
                        handleExportCsv(
                          "team_growth.csv",
                          people.map((person) => ({
                            name: person.name,
                            stage: getStageSummary(person, peopleIndex, sales).stage,
                            recruits: getStageRecruitCount(person.id, peopleIndex),
                            downline_depth: getDownlineDepth(
                              person.id,
                              peopleIndex
                            ),
                          }))
                        )
                      }
                    >
                      Export Excel
                    </button>
                  </div>
                  <div className="report-card">
                    <h4>Buybacks Summary</h4>
                    <p>Pending and upcoming buyback payouts.</p>
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() =>
                        handleExportCsv(
                          "buybacks.csv",
                          people.flatMap((person) =>
                            person.investments.map((inv) => ({
                              member: person.name,
                              stage: inv.stage,
                              investment: inv.amount,
                              area_sq_yd: inv.areaSqYd,
                              buyback_date: inv.buybackDate,
                              return_percent: inv.returnPercent || 200,
                              buyback_amount:
                                inv.amount * ((inv.returnPercent || 200) / 100),
                              status: inv.status,
                            }))
                          )
                        )
                      }
                    >
                      Export Excel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {activeView === "profile" && (
          <section className="grid">
            {!hasPermission("profile:read") || !hasPermission("people:read") ? (
              <div className="card wide-card">
                <h3>Individual Profile</h3>
                <p className="muted">
                  You do not have access to the individual profile.
                </p>
              </div>
            ) : (
            <div className="card wide-card">
              <div className="card-header">
                <h3>Individual Profile</h3>
                <div className="top-actions">
                  <input
                    className="table-search"
                    placeholder="Search person..."
                    value={profileSearch}
                    onChange={(event) => setProfileSearch(event.target.value)}
                  />
                  <select
                    className="select"
                    value={selectedPersonId}
                    onChange={(event) => setSelectedPersonId(event.target.value)}
                    disabled={!filteredProfileList.length}
                  >
                    {filteredProfileList.map((person) => (
                      <option key={person.id} value={person.id}>
                        {formatName(person.name)}
                      </option>
                    ))}
                  </select>
                  {selectedPerson && (
                    <>
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={() =>
                          handleExportCsv(
                            "individual_profile.csv",
                            [
                              {
                                name: selectedPerson.name,
                                stage: selectedPersonStage,
                                direct_recruits: selectedPersonStageRecruits,
                                commission_earned: canSeeCommission
                                  ? formatCurrency(
                                      selectedPersonCommission.totalCommission
                                    )
                                  : "Restricted",
                                commission_paid: canSeeCommission
                                  ? formatCurrency(
                                      selectedPersonCommission.totalPaid
                                    )
                                  : "Restricted",
                              },
                            ]
                          )
                        }
                      >
                        Export Excel
                      </button>
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={() =>
                          handleExportPrint(
                            `Profile - ${selectedPerson.name}`,
                            selectedPersonSales.map((sale) => ({
                              project: getSaleProjectName(sale),
                              block: getSaleBlockName(sale),
                              property: sale.propertyId
                                ? propertiesById[sale.propertyId]?.name || "-"
                                : "-",
                              area_sq_yd: sale.areaSqYd,
                              amount: formatCurrency(sale.totalAmount),
                              sale_date: sale.saleDate,
                            }))
                          )
                        }
                      >
                        Export PDF
                      </button>
                    </>
                  )}
                </div>
              </div>
              {!selectedPerson ? (
                <div className="empty-state">
                  <h4>No team members yet</h4>
                  <p className="muted">
                    Add a team member to view the individual profile dashboard.
                  </p>
                  {hasPermission("people:write") && (
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() => {
                        setFormError("");
                        resetPersonForm();
                        setShowPersonModal(true);
                      }}
                    >
                      Add Team Member
                    </button>
                  )}
                </div>
              ) : (
              <>
              <div className="profile-grid">
                {canSeeCommission && (
                  <div className="profile-card">
                    <p className="muted">Commission Earned</p>
                    <h3>
                      {formatCurrency(selectedPersonCommission.totalCommission)}
                    </h3>
                    <p className="muted">
                      Paid: {formatCurrency(selectedPersonCommission.totalPaid)}
                    </p>
                  </div>
                )}
                <div className="profile-card">
                  <p className="muted">Stage Status</p>
                  <h3>
                    Stage {selectedPersonStage} -{" "}
                    {stageTitles[selectedPersonStage]}
                  </h3>
                  {canSeeCommission && (
                    <p className="muted">
                      Personal rate: {selectedPersonCommission.personalRate}/sq yd
                    </p>
                  )}
                  <p className="muted">
                    {selectedPersonStage === 1
                      ? `Direct recruits: ${selectedPersonStageRecruits}/6`
                      : selectedPersonStageSummary.nextTarget
                      ? `Promotion progress: ${selectedPersonStageSummary.progress}/${selectedPersonStageSummary.nextTarget}`
                      : "Maximum stage achieved"}
                  </p>
                </div>
                <div className="profile-card">
                  <p className="muted">Downline Depth</p>
                  <h3>Level {getDownlineDepth(selectedPerson.id, peopleIndex)}</h3>
                  <p className="muted">
                    Direct recruits: {peopleIndex[selectedPerson.id].directRecruits.length}
                  </p>
                </div>
                <div className="profile-card">
                  <p className="muted">Total Area Sold</p>
                  <h3>
                    {selectedPersonSales
                      .reduce((acc, sale) => acc + sale.areaSqYd, 0)
                      .toLocaleString()} sq yd
                  </h3>
                  <p className="muted">
                    Last sale: {salesIndex[selectedPerson.id]?.lastSale}
                  </p>
                </div>
              </div>

              <div className="split">
                <div className="split-card">
                  <h4>Recent Sales</h4>
                      <div className="table-scroll">
                      <table className="data-table compact">
                        <thead>
                          <tr>
                            <th>Project</th>
                            <th>Block</th>
                            <th>Property</th>
                            <th>Area</th>
                            <th>Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedPersonSales.map((sale) => (
                            <tr key={sale.id}>
                              <td>
                                {sale.projectId ? (
                                  <button
                                    className="link-button"
                                    type="button"
                                    onClick={() =>
                                      openProjectDetail(sale.projectId)
                                    }
                                  >
                                    {projectsById[sale.projectId]?.name || "-"}
                                  </button>
                                ) : (
                                  sale.propertyName
                                )}
                              </td>
                              <td>
                                {sale.blockId
                                  ? blocksById[sale.blockId]?.name || "-"
                                  : "-"}
                              </td>
                              <td>
                                {sale.propertyId ? (
                                  <button
                                    className="link-button"
                                    type="button"
                                    onClick={() =>
                                      openPropertyDetail(sale.propertyId)
                                    }
                                  >
                                    {propertiesById[sale.propertyId]?.name || "-"}
                                  </button>
                                ) : (
                                  "-"
                                )}
                              </td>
                              <td>{sale.areaSqYd} sq yd</td>
                              <td>{formatCurrency(sale.totalAmount)}</td>
                            </tr>
                          ))}
                        </tbody>
                  </table>
                  </div>
                </div>
                <div className="split-card">
                  <h4>Investment and Buybacks</h4>
                  <div className="table-scroll">
                  <table className="data-table compact">
                    <thead>
                      <tr>
                        <th>Project</th>
                        <th>Block</th>
                        <th>Property</th>
                        <th>Stage</th>
                        <th>Amount</th>
                        <th>Area</th>
                        <th>Buyback Date</th>
                        <th>Return %</th>
                        <th>Buyback Amount</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedPerson.investments.map((inv) => (
                        <tr key={inv.id || inv.stage}>
                          <td>
                            {inv.projectId ? (
                              <button
                                className="link-button"
                                type="button"
                                onClick={() => openProjectDetail(inv.projectId)}
                              >
                                {projectsById[inv.projectId]?.name || "-"}
                              </button>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td>
                            {inv.blockId
                              ? blocksById[inv.blockId]?.name || "-"
                              : "-"}
                          </td>
                          <td>
                            {inv.propertyId ? (
                              <button
                                className="link-button"
                                type="button"
                                onClick={() =>
                                  openPropertyDetail(inv.propertyId)
                                }
                              >
                                {propertiesById[inv.propertyId]?.name || "-"}
                              </button>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td>{inv.stage}</td>
                          <td>{formatCurrency(inv.amount)}</td>
                          <td>{inv.areaSqYd} sq yd</td>
                          <td>{formatDate(inv.buybackDate)}</td>
                          <td>{inv.returnPercent || 200}%</td>
                          <td>
                            {formatCurrency(
                              inv.amount * ((inv.returnPercent || 200) / 100)
                            )}
                          </td>
                          <td>{inv.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              </div>

              <div className="card wide-card tree-card">
                <div className="card-header">
                  <h4>Individual Tree</h4>
                  <div className="top-actions">
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() =>
                        handleExportCsv(
                          "individual_tree.csv",
                          flattenTree([selectedPersonId], true)
                        )
                      }
                    >
                      Export Excel
                    </button>
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() =>
                        handleExportTreePdf(
                          `Individual Tree - ${selectedPerson.name}`,
                          [selectedPersonId],
                          profileTreeStageFilter,
                          profileTreeSearch,
                          true
                        )
                      }
                    >
                      Export PDF
                    </button>
                  </div>
                </div>
                <div className="tree-controls">
                  <input
                    placeholder="Search name..."
                    value={profileTreeSearch}
                    onChange={(event) =>
                      setProfileTreeSearch(event.target.value)
                    }
                  />
                  <select
                    value={profileTreeStageFilter}
                    onChange={(event) =>
                      setProfileTreeStageFilter(event.target.value)
                    }
                  >
                    <option value="all">All stages</option>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((stage) => (
                      <option key={`stage-${stage}`} value={stage}>
                        Stage {stage}
                      </option>
                    ))}
                  </select>
                  <label className="tree-zoom">
                    Zoom
                    <input
                      type="range"
                      min="0.6"
                      max="1.6"
                      step="0.1"
                      value={profileTreeScale}
                      onChange={(event) =>
                        setProfileTreeScale(Number(event.target.value))
                      }
                    />
                  </label>
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => {
                      setProfileTreeScale(1);
                      setProfileTreeOffset({ x: 0, y: 0 });
                    }}
                  >
                    Reset View
                  </button>
                </div>
                <div
                  className="tree-canvas"
                  onMouseDown={(event) =>
                    startDrag(event, setProfileTreeDragging, setProfileTreeDragStart)
                  }
                  onMouseMove={(event) =>
                    onDrag(
                      event,
                      profileTreeDragging,
                      profileTreeDragStart,
                      setProfileTreeDragStart,
                      setProfileTreeOffset
                    )
                  }
                  onMouseUp={() => endDrag(setProfileTreeDragging)}
                  onMouseLeave={() => endDrag(setProfileTreeDragging)}
                >
                  <div
                    className="tree"
                    style={{
                      transform: `translate(${profileTreeOffset.x}px, ${profileTreeOffset.y}px) scale(${profileTreeScale})`,
                    }}
                  >
                    <ul>
                      {renderTreeNode(
                        selectedPersonId,
                        profileTreeStageFilter,
                        profileTreeSearch,
                        0,
                        true,
                        selectedPersonId
                      )}
                    </ul>
                  </div>
                </div>
              </div>
              </>
              )}
            </div>
            )}
          </section>
        )}

        {activeView === "settings" && (
          <section className="grid">
            <div className="card wide-card">
              <div className="card-header">
                <h3>Commission Settings</h3>
                <div className="top-actions">
                  {hasPermission("settings:write") && (
                    !configEditing ? (
                      <button
                        className="primary-button"
                        type="button"
                        onClick={() => {
                          setConfigSnapshot(JSON.parse(JSON.stringify(commissionConfig)));
                          setConfigEditing(true);
                          setConfigAppliedMsg("");
                        }}
                      >
                        Edit Rates
                      </button>
                    ) : (
                      <div className="rate-action-row">
                        <button
                          className={`ghost-button ${configShake ? "shake" : ""}`}
                          type="button"
                          onClick={() => {
                            if (configSnapshot) {
                              setCommissionConfig(configSnapshot);
                            }
                            setConfigEditing(false);
                            setConfigSnapshot(null);
                            setConfigAppliedMsg("");
                          }}
                          disabled={configSaving}
                        >
                          Cancel
                        </button>
                        <button
                          className={`primary-button ${configShake ? "shake" : ""}`}
                          type="button"
                          onClick={handleSaveConfig}
                          disabled={configSaving}
                        >
                          {configSaving ? "Saving..." : "Save Rates"}
                        </button>
                      </div>
                    )
                  )}
                </div>
              </div>
              {configAppliedMsg && (
                <div className="success-banner">{configAppliedMsg}</div>
              )}
              <div className="settings-grid">
                <div>
                  <h4>Investment Level Rates (per sq yd)</h4>
                  <div className="rate-list">
                    {commissionConfig.levelRates.map((rate, index) => (
                      <div key={`level-${index}`} className="rate-item">
                        <span>Level {index + 1}</span>
                        <input
                          type="number"
                          value={rate}
                          disabled={!configEditing || !hasPermission("settings:write")}
                          onChange={(event) => {
                            const nextRates = [...commissionConfig.levelRates];
                            nextRates[index] = Number(event.target.value);
                            setCommissionConfig((prev) => ({
                              ...prev,
                              levelRates: nextRates,
                            }));
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h4>Personal Sale Rates (per sq yd)</h4>
                  <div className="rate-list">
                    {commissionConfig.personalRates.map((bonus, index) => (
                      <div key={`stage-${index}`} className="rate-item">
                        <span>Stage {index + 1}</span>
                        <input
                          type="number"
                          value={bonus}
                          disabled={!configEditing || !hasPermission("settings:write")}
                          onChange={(event) => {
                            const nextBonuses = [...commissionConfig.personalRates];
                            nextBonuses[index] = Number(event.target.value);
                            setCommissionConfig((prev) => ({
                              ...prev,
                              personalRates: nextBonuses,
                            }));
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {activeView === "users" && (
          <section className="grid">
            <div className="card wide-card">
              <div className="card-header">
                <h3>User Access</h3>
                <div className="top-actions">
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() =>
                      handleExportCsv(
                        "users.csv",
                        users.map((user) => ({
                          username: user.username,
                          role: user.role,
                          permissions: (user.permissions || []).includes("*")
                            ? "All Access"
                            : `${(user.permissions || []).length} permissions`,
                          created: user.created_at || "",
                          last_login: user.last_login || "",
                          status: user.active === 0 ? "Disabled" : "Active",
                        }))
                      )
                    }
                  >
                    Export Excel
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => {
                      setUserFormError("");
                      setShowUserModal(true);
                    }}
                  >
                    Add User
                  </button>
                </div>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Role</th>
                    <th>Permissions</th>
                    <th>Created</th>
                    <th>Last Login</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedUsers.map((user) => (
                    <tr key={user.id}>
                      <td>{user.username}</td>
                      <td>{user.role}</td>
                      <td>
                        {(user.permissions || []).includes("*")
                          ? "All Access"
                          : `${(user.permissions || []).length} permissions`}
                      </td>
                      <td>{user.created_at ? formatDate(user.created_at) : "-"}</td>
                      <td>{user.last_login ? formatDate(user.last_login) : "-"}</td>
                      <td>
                        <span className="badge">
                          {user.active === 0 ? "Disabled" : "Active"}
                        </span>
                      </td>
                      <td className="table-actions">
                        {user.username === "owner" ? (
                          <span className="muted">Owner</span>
                        ) : (
                          <button
                            className="ghost-button"
                            type="button"
                            onClick={() => openEditUser(user)}
                          >
                            Edit
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="pagination">
                <button
                  className="ghost-button"
                  type="button"
                  disabled={usersPage === 1}
                  onClick={() => setUsersPage((prev) => Math.max(1, prev - 1))}
                >
                  Prev
                </button>
                <span>
                  Page {usersPage} of {totalUsersPages}
                </span>
                <button
                  className="ghost-button"
                  type="button"
                  disabled={usersPage === totalUsersPages}
                  onClick={() =>
                    setUsersPage((prev) =>
                      Math.min(totalUsersPages, prev + 1)
                    )
                  }
                >
                  Next
                </button>
              </div>
            </div>
          </section>
        )}

        {activeView === "account" && (
          <section className="grid">
            <div className="card wide-card">
              <div className="card-header">
                <h3>My Account</h3>
              </div>
              <div className="profile-grid">
                <div className="profile-card">
                  <p className="muted">Username</p>
                  <h3>{authUser.username}</h3>
                </div>
                <div className="profile-card">
                  <p className="muted">Role</p>
                  <h3>{authUser.role}</h3>
                </div>
                <div className="profile-card">
                  <p className="muted">Permissions</p>
                  <h3>
                    {authUser.permissions?.includes("*")
                      ? "All Access"
                      : `${authUser.permissions?.length || 0} permissions`}
                  </h3>
                </div>
              </div>
              <div className="split">
                <div className="split-card">
                  <h4>Change Password</h4>
                  <form className="modal-form" onSubmit={handleChangePassword}>
                    <label>
                      Current Password
                      <input
                        type="password"
                        value={accountForm.currentPassword}
                        onChange={(event) =>
                          setAccountForm((prev) => ({
                            ...prev,
                            currentPassword: event.target.value,
                          }))
                        }
                        required
                      />
                    </label>
                    <label>
                      New Password
                      <input
                        type="password"
                        value={accountForm.newPassword}
                        onChange={(event) =>
                          setAccountForm((prev) => ({
                            ...prev,
                            newPassword: event.target.value,
                          }))
                        }
                        required
                      />
                    </label>
                    <label>
                      Confirm New Password
                      <input
                        type="password"
                        value={accountForm.confirmPassword}
                        onChange={(event) =>
                          setAccountForm((prev) => ({
                            ...prev,
                            confirmPassword: event.target.value,
                          }))
                        }
                        required
                      />
                    </label>
                    {accountError && <p className="form-error">{accountError}</p>}
                    {accountSuccess && (
                      <div className="success-banner">{accountSuccess}</div>
                    )}
                    <button className="primary-button" type="submit">
                      Update Password
                    </button>
                  </form>
                </div>
                <div className="split-card">
                  <h4>Access Summary</h4>
                  <div className="kpi-stack">
                    {(authUser.permissions || []).includes("*") ? (
                      <p className="muted">Full platform access enabled.</p>
                    ) : (
                      (authUser.permissions || []).map((perm) => (
                        <span key={perm} className="badge">
                          {perm}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {activeView === "activity" && (
          <section className="grid">
            <div className="card wide-card">
              <div className="card-header">
                <h3>Activity History</h3>
                <div className="top-actions">
                  <input
                    className="table-search"
                    placeholder="Search activity..."
                    value={activitySearch}
                    onChange={(event) => setActivitySearch(event.target.value)}
                  />
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() =>
                      handleExportCsv(
                        "activity_history.csv",
                        filteredActivityLogs.map((log) => ({
                          time: log.created_at,
                          action: log.action_type,
                          entity: getActivityEntityLabel(log),
                          details: parseActivityPayload(log)
                            .map((item) => `${item.label}: ${item.value}`)
                            .join(" | "),
                          status: log.status,
                        }))
                      )
                    }
                  >
                    Export Excel
                  </button>
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={loadData}
                  >
                    Refresh
                  </button>
                </div>
              </div>
              <div className="filter-row">
                <select
                  className="select"
                  value={activityActionFilter}
                  onChange={(event) => setActivityActionFilter(event.target.value)}
                >
                  <option value="all">All actions</option>
                  {activityActionOptions.map((action) => (
                    <option key={`act-${action}`} value={action}>
                      {action}
                    </option>
                  ))}
                </select>
                <select
                  className="select"
                  value={activityEntityFilter}
                  onChange={(event) => setActivityEntityFilter(event.target.value)}
                >
                  <option value="all">All entities</option>
                  {activityEntityOptions.map((entity) => (
                    <option key={`entity-${entity}`} value={entity}>
                      {entity}
                    </option>
                  ))}
                </select>
                <select
                  className="select"
                  value={activityStatusFilter}
                  onChange={(event) => setActivityStatusFilter(event.target.value)}
                >
                  <option value="all">All status</option>
                  <option value="active">Active</option>
                  <option value="undone">Undone</option>
                </select>
              </div>
              <div className="filter-row date-row">
                <div className="filter-field">
                  <span className="filter-label">From</span>
                  <input
                    className="table-search"
                    type="datetime-local"
                    value={activityDateFrom}
                    onChange={(event) => setActivityDateFrom(event.target.value)}
                  />
                </div>
                <div className="filter-field">
                  <span className="filter-label">To</span>
                  <input
                    className="table-search"
                    type="datetime-local"
                    value={activityDateTo}
                    onChange={(event) => setActivityDateTo(event.target.value)}
                  />
                </div>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>Details</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedActivityLogs.map((log) => (
                    <tr key={log.id}>
                      <td>{formatDate(log.created_at)}</td>
                      <td>{log.action_type}</td>
                      <td>
                        {getActivityEntityLabel(log)}
                      </td>
                      <td className="activity-details">
                        {log.payload_json ? "View details" : "-"}
                      </td>
                      <td>{log.status}</td>
                      <td className="table-actions">
                        <button
                          className="ghost-button"
                          type="button"
                          onClick={() => setSelectedActivity(log)}
                        >
                          View
                        </button>
                        {hasPermission("activity:write") && (
                          <button
                            className="ghost-button"
                            type="button"
                            disabled={log.status !== "active"}
                            onClick={() => confirmUndoActivity(log)}
                          >
                            Undo
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="pagination">
                <button
                  className="ghost-button"
                  type="button"
                  disabled={activityPage === 1}
                  onClick={() => setActivityPage((prev) => Math.max(1, prev - 1))}
                >
                  Prev
                </button>
                <span>
                  Page {activityPage} of {totalActivityPages}
                </span>
                <button
                  className="ghost-button"
                  type="button"
                  disabled={activityPage === totalActivityPages}
                  onClick={() =>
                    setActivityPage((prev) =>
                      Math.min(totalActivityPages, prev + 1)
                    )
                  }
                >
                  Next
                </button>
              </div>
            </div>
          </section>
        )}
      </main>

      {selectedActivity && (
        <div className="modal-overlay">
          <div className="modal-card modal-wide">
            <div className="modal-header">
              <h3>Activity Details</h3>
              <button
                className="ghost-button"
                type="button"
                onClick={() => setSelectedActivity(null)}
              >
                Close
              </button>
            </div>
            <div className="activity-modal">
              <div className="activity-row">
                <span>Action</span>
                <strong>{selectedActivity.action_type}</strong>
              </div>
              <div className="activity-row">
                <span>Entity</span>
                <strong>{selectedActivity.entity_type}</strong>
              </div>
              <div className="activity-row">
                <span>Time</span>
                <strong>
                  {formatDate(selectedActivity.created_at)}
                </strong>
              </div>
              <div className="activity-section">
                <h4>Changes</h4>
                {parseActivityPayload(selectedActivity).map(
                  (item, index) => (
                    <div className="activity-row" key={`change-${index}`}>
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                    </div>
                  )
                )}
              </div>
              {selectedActivity.undo_payload_json && (
                <div className="activity-section">
                  <h4>Previous Values</h4>
                  {parseActivityPayload({
                    ...selectedActivity,
                    payload_json: selectedActivity.undo_payload_json,
                  }).map((item, index) => (
                    <div className="activity-row" key={`prev-${index}`}>
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showBuybackModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Record Buyback Payment</h3>
              <button
                className="ghost-button"
                type="button"
                onClick={() => setShowBuybackModal(false)}
              >
                Close
              </button>
            </div>
            <form className="modal-form" onSubmit={handleSaveBuyback}>
              <label>
                Paid Amount
                <input
                  type="number"
                  value={buybackForm.paidAmount}
                  readOnly
                />
              </label>
              <label>
                Paid Date
                <input
                  type="datetime-local"
                  value={buybackForm.paidDate}
                  onChange={(e) =>
                    setBuybackForm((prev) => ({
                      ...prev,
                      paidDate: e.target.value,
                    }))
                  }
                  required
                />
              </label>
              {formError && <p className="form-error">{formError}</p>}
              <button className="primary-button" type="submit">
                Save Payment
              </button>
            </form>
          </div>
        </div>
      )}

      {showPersonModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Add New Person</h3>
              <button
                className="ghost-button"
                type="button"
                onClick={() => setShowPersonModal(false)}
              >
                Close
              </button>
            </div>
            <form className="modal-form" onSubmit={handleCreatePerson}>
              <label>
                Full Name
                <input
                  value={personForm.name}
                  onChange={(e) => {
                    const next = e.target.value;
                    setPersonForm((prev) => ({ ...prev, name: next }));
                    const trimmed = next.trim();
                    if (
                      trimmed &&
                      peopleLookup.some(
                        (person) =>
                          person.name.trim().toLowerCase() ===
                          trimmed.toLowerCase()
                      )
                    ) {
                      setPersonNameError("Name already exists.");
                    } else {
                      setPersonNameError("");
                    }
                  }}
                  required
                />
              </label>
              {personNameError && <p className="form-error">{personNameError}</p>}
              <label>
                Phone
                <div className="phone-input">
                  <span className="phone-prefix">+91</span>
                  <input
                    inputMode="numeric"
                    maxLength={10}
                    value={getLocalPhone(personForm.phone)}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                      setPersonForm((prev) => ({
                        ...prev,
                        phone: `+91${digits}`,
                      }));
                    }}
                    placeholder="10-digit number"
                    required
                  />
                </div>
              </label>
              <label>
                Referred By
                <SearchableSelect
                  key={showPersonModal ? "open" : "closed"}
                  value={personForm.sponsorId}
                  onChange={(value) =>
                    setPersonForm((prev) => ({
                      ...prev,
                      sponsorId: value,
                    }))
                  }
                  options={[
                    { value: "owner", label: "Owner" },
                    ...peopleLookup.map((person) => ({
                      value: person.id,
                      label: formatName(person.name),
                    })),
                  ]}
                  placeholder="Search sponsor..."
                />
              </label>
              <label>
                Join Date
                <input
                  type="datetime-local"
                  value={personForm.joinDate}
                  onChange={(e) =>
                    setPersonForm((prev) => ({
                      ...prev,
                      joinDate: e.target.value,
                    }))
                  }
                  required
                />
              </label>
              <div className="modal-divider">Joining Investment</div>
              <label>
                Amount
                <input
                  type="number"
                  value={personForm.investmentAmount}
                  onChange={(e) =>
                    setPersonForm((prev) => ({
                      ...prev,
                      investmentAmount: e.target.value,
                    }))
                  }
                  required
                />
              </label>
              <label>
                Investment Area (sq yd)
                <input
                  type="number"
                  value={personForm.investmentArea}
                  onChange={(e) =>
                    setPersonForm((prev) => ({
                      ...prev,
                      investmentArea: e.target.value,
                    }))
                  }
                  required
                />
              </label>
              <label>
                Project
                <SearchableSelect
                  key={`${showPersonModal ? "open" : "closed"}-invest-project`}
                  value={personForm.projectId}
                  onChange={(value) =>
                    setPersonForm((prev) => ({
                      ...prev,
                      projectId: value,
                      blockId: "",
                      propertyId: "",
                    }))
                  }
                  options={projects.map((project) => ({
                    value: project.id,
                    label: project.name,
                  }))}
                  placeholder="Search project..."
                />
              </label>
              <label>
                Block
                <SearchableSelect
                  key={`${showPersonModal ? "open" : "closed"}-invest-block-${personForm.projectId}`}
                  value={personForm.blockId}
                  onChange={(value) =>
                    setPersonForm((prev) => ({
                      ...prev,
                      blockId: value,
                      propertyId: "",
                    }))
                  }
                  options={blocksForProject(personForm.projectId).map((block) => ({
                    value: block.id,
                    label: block.name,
                  }))}
                  placeholder={
                    personForm.projectId
                      ? "Search block..."
                      : "Select project first"
                  }
                  disabled={!personForm.projectId}
                />
              </label>
              <label>
                Property
                <SearchableSelect
                  key={`${showPersonModal ? "open" : "closed"}-invest-property-${personForm.blockId}`}
                  value={personForm.propertyId}
                  onChange={(value) =>
                    setPersonForm((prev) => ({
                      ...prev,
                      propertyId: value,
                    }))
                  }
                  options={propertiesForBlock(personForm.blockId).map((prop) => ({
                    value: prop.id,
                    label: prop.name,
                  }))}
                  placeholder={
                    personForm.blockId
                      ? "Search property..."
                      : "Select block first"
                  }
                  disabled={!personForm.blockId}
                />
              </label>
              <label>
                Investment Date
                <input
                  type="datetime-local"
                  value={personForm.investmentDate}
                  onChange={(e) =>
                    setPersonForm((prev) => ({
                      ...prev,
                      investmentDate: e.target.value,
                    }))
                  }
                  required
                />
              </label>
              <label>
                Buyback Period (months)
                <select
                  className="select"
                  value={personForm.buybackMonths}
                  onChange={(e) =>
                    setPersonForm((prev) => ({
                      ...prev,
                      buybackMonths: e.target.value,
                    }))
                  }
                  required
                >
                  <option value="">Select period</option>
                  {Array.from({ length: 46 }, (_, idx) => idx + 3).map(
                    (month) => (
                      <option key={`bb-${month}`} value={month}>
                        {month} months
                      </option>
                    )
                  )}
                </select>
              </label>
              <label>
                Return Percentage
                <input
                  type="number"
                  min="100"
                  value={personForm.returnPercent}
                  onChange={(e) =>
                    setPersonForm((prev) => ({
                      ...prev,
                      returnPercent: e.target.value,
                    }))
                  }
                  required
                />
              </label>
              {formError && <p className="form-error">{formError}</p>}
              <button className="primary-button" type="submit">
                Save Person
              </button>
            </form>
          </div>
        </div>
      )}

      {showEditPersonModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Edit Team Member</h3>
              <button
                className="ghost-button"
                type="button"
                onClick={() => setShowEditPersonModal(false)}
              >
                Close
              </button>
            </div>
            <form className="modal-form" onSubmit={handleUpdatePerson}>
              <label>
                Full Name
                <input
                  value={editPersonForm.name}
                  onChange={(e) => {
                    const next = e.target.value;
                    setEditPersonForm((prev) => ({
                      ...prev,
                      name: next,
                    }));
                    const trimmed = next.trim();
                    if (
                      trimmed &&
                      peopleLookup.some(
                        (person) =>
                          person.id !== editingPersonId &&
                          person.name.trim().toLowerCase() ===
                          trimmed.toLowerCase()
                      )
                    ) {
                      setEditPersonNameError("Name already exists.");
                    } else {
                      setEditPersonNameError("");
                    }
                  }}
                  required
                />
              </label>
              {editPersonNameError && (
                <p className="form-error">{editPersonNameError}</p>
              )}
              <label>
                Phone
                <div className="phone-input">
                  <span className="phone-prefix">+91</span>
                  <input
                    inputMode="numeric"
                    maxLength={10}
                    value={getLocalPhone(editPersonForm.phone)}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                      setEditPersonForm((prev) => ({
                        ...prev,
                        phone: `+91${digits}`,
                      }));
                    }}
                    placeholder="10-digit number"
                    required
                  />
                </div>
              </label>
              <label>
                Join Date
                <input
                  type="datetime-local"
                  value={editPersonForm.joinDate}
                  onChange={(e) =>
                    setEditPersonForm((prev) => ({
                      ...prev,
                      joinDate: e.target.value,
                    }))
                  }
                  required
                />
              </label>
              <label>
                Investment Area (sq yd)
                <input
                  type="number"
                  value={editPersonForm.investmentArea}
                  onChange={(e) =>
                    setEditPersonForm((prev) => ({
                      ...prev,
                      investmentArea: e.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Return Percentage
                <input
                  type="number"
                  min="100"
                  value={editPersonForm.returnPercent}
                  onChange={(e) =>
                    setEditPersonForm((prev) => ({
                      ...prev,
                      returnPercent: e.target.value,
                    }))
                  }
                />
              </label>
              {formError && <p className="form-error">{formError}</p>}
              <button className="primary-button" type="submit">
                Update Member
              </button>
            </form>
          </div>
        </div>
      )}

      {showSaleModal && (
        <div className="modal-overlay">
          <div className="modal-card modal-wide">
            <div className="modal-header">
              <h3>{editingSaleId ? "Edit Property Sale" : "Add Property Sale"}</h3>
              <button
                className="ghost-button"
                type="button"
                onClick={() => {
                  setShowSaleModal(false);
                  resetSaleForm();
                }}
              >
                Close
              </button>
            </div>
            <form className="modal-form" onSubmit={handleCreateSale}>
              <label>
                Seller
                <SearchableSelect
                  key={showSaleModal ? "open" : "closed"}
                  value={saleForm.sellerId}
                  onChange={(value) =>
                    setSaleForm((prev) => ({
                      ...prev,
                      sellerId: value,
                    }))
                  }
                  options={[
                    ...peopleLookup.map((person) => ({
                      value: person.id,
                      label: formatName(person.name),
                    })),
                  ]}
                  placeholder="Search seller..."
                />
              </label>
              <label>
                Project
                <SearchableSelect
                  key={`${showSaleModal ? "open" : "closed"}-project`}
                  value={saleForm.projectId}
                  onChange={(value) =>
                    setSaleForm((prev) => ({
                      ...prev,
                      projectId: value,
                      blockId: "",
                      propertyId: "",
                    }))
                  }
                  options={[
                    ...projects.map((project) => ({
                      value: project.id,
                      label: project.name,
                    })),
                  ]}
                  placeholder="Search project..."
                />
              </label>
              <label>
                Block
                <SearchableSelect
                  key={`${showSaleModal ? "open" : "closed"}-block-${saleForm.projectId}`}
                  value={saleForm.blockId}
                  onChange={(value) =>
                    setSaleForm((prev) => ({
                      ...prev,
                      blockId: value,
                      propertyId: "",
                    }))
                  }
                  options={blocksForProject(saleForm.projectId).map((block) => ({
                    value: block.id,
                    label: block.name,
                  }))}
                  placeholder={
                    saleForm.projectId ? "Search block..." : "Select project first"
                  }
                  disabled={!saleForm.projectId}
                />
              </label>
              <label>
                Property
                <SearchableSelect
                  key={`${showSaleModal ? "open" : "closed"}-property-${saleForm.blockId}`}
                  value={saleForm.propertyId}
                  onChange={(value) =>
                    setSaleForm((prev) => ({
                      ...prev,
                      propertyId: value,
                    }))
                  }
                  options={propertiesForBlock(
                    saleForm.blockId,
                    editingSaleId ? saleForm.propertyId : null
                  ).map((prop) => ({
                    value: prop.id,
                    label: prop.name,
                  }))}
                  placeholder={
                    saleForm.blockId
                      ? "Search property..."
                      : "Select block first"
                  }
                  disabled={!saleForm.blockId}
                />
              </label>
              <div className="modal-row">
                <label>
                  Area (sq yd)
                  <input
                    type="number"
                    value={saleForm.areaSqYd}
                    onChange={(e) =>
                      setSaleForm((prev) => ({
                        ...prev,
                        areaSqYd: e.target.value,
                      }))
                    }
                    required
                  />
                </label>
                <label>
                  Total Amount
                  <input
                    type="number"
                    value={saleForm.totalAmount}
                    onChange={(e) =>
                      setSaleForm((prev) => ({
                        ...prev,
                        totalAmount: e.target.value,
                      }))
                    }
                    required
                  />
                </label>
              </div>
              <label>
                Sale Date
                <input
                  type="datetime-local"
                  value={saleForm.saleDate}
                  onChange={(e) =>
                    setSaleForm((prev) => ({
                      ...prev,
                      saleDate: e.target.value,
                    }))
                  }
                  required
                />
              </label>
              {saleForm.saleDate && (
                <div className="helper-text">
                  Auto-cancel after 15 working days:{" "}
                  {(() => {
                    const due = addWorkingDays(saleForm.saleDate, 15);
                    return due ? formatDate(due.toISOString()) : "-";
                  })()}
                </div>
              )}

              {editingSaleId && saleForm.existingPayments.length > 0 && (
                <>
                  <div className="modal-divider">Existing Payments</div>
                  <table className="data-table compact">
                    <thead>
                      <tr>
                        <th>Amount</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {saleForm.existingPayments.map((payment, index) => (
                        <tr key={`existing-${index}`}>
                          <td>{formatCurrency(payment.amount)}</td>
                          <td>{formatDate(payment.date)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}

              {!editingSaleId && (
                <>
                  <div className="modal-divider">Payment Schedule</div>
                  {saleForm.payments.map((payment, index) => (
                    <div className="modal-row" key={`payment-${index}`}>
                      <label>
                        Amount
                        <input
                          type="number"
                          value={payment.amount}
                          onChange={(e) => {
                            const nextPayments = [...saleForm.payments];
                            nextPayments[index].amount = e.target.value;
                            setSaleForm((prev) => ({
                              ...prev,
                              payments: nextPayments,
                            }));
                          }}
                        />
                      </label>
                      <label>
                        Date
                        <input
                          type="date"
                          value={payment.date}
                          onChange={(e) => {
                            const nextPayments = [...saleForm.payments];
                            nextPayments[index].date = e.target.value;
                            setSaleForm((prev) => ({
                              ...prev,
                              payments: nextPayments,
                            }));
                          }}
                        />
                      </label>
                    </div>
                  ))}
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() =>
                      setSaleForm((prev) => ({
                        ...prev,
                        payments: [
                          ...prev.payments,
                          { amount: "", date: getTodayLocal() },
                        ],
                      }))
                    }
                  >
                    Add Another Payment
                  </button>
                </>
              )}
              {formError && <p className="form-error">{formError}</p>}
              <button className="primary-button" type="submit">
                {editingSaleId ? "Update Sale" : "Save Sale"}
              </button>
            </form>
          </div>
        </div>
      )}

      {showPaymentModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Add Payment</h3>
              <button
                className="ghost-button"
                type="button"
                onClick={() => {
                  setShowPaymentModal(false);
                  resetPaymentForm();
                  setPaymentSaleDetail(null);
                }}
              >
                Close
              </button>
            </div>
            <form className="modal-form" onSubmit={handleCreatePayment}>
              <div className="helper-text">
                Project:{" "}
                {paymentSaleDetail?.sale?.project_id
                  ? projectsById[paymentSaleDetail.sale.project_id]?.name || "-"
                  : paymentSaleDetail?.sale?.property_name || "-"}
                {" • "}
                Block:{" "}
                {paymentSaleDetail?.sale?.block_id
                  ? blocksById[paymentSaleDetail.sale.block_id]?.name || "-"
                  : "-"}
                {" • "}
                Property:{" "}
                {paymentSaleDetail?.sale?.property_id
                  ? propertiesById[paymentSaleDetail.sale.property_id]?.name ||
                    "-"
                  : "-"}
                {" • "}
                Seller:{" "}
                {paymentSaleDetail?.sale?.seller_id
                  ? formatName(
                      peopleLookup.find(
                        (person) =>
                          person.id === paymentSaleDetail.sale.seller_id
                      )?.name || "-"
                    )
                  : "-"}
              </div>
              {paymentSaleDetail?.sale && (
                <div className="helper-text">
                  Remaining amount:{" "}
                  {(() => {
                    const paid = (paymentSaleDetail.payments || []).reduce(
                      (acc, payment) => acc + payment.amount,
                      0
                    );
                    const remaining = Math.max(
                      0,
                      paymentSaleDetail.sale.total_amount - paid
                    );
                    return formatCurrency(remaining);
                  })()}
                </div>
              )}
              {paymentSaleDetail?.sale?.sale_date && (
                <div className="helper-text">
                  Last payment date:{" "}
                  {(() => {
                    const due = addWorkingDays(
                      paymentSaleDetail.sale.sale_date,
                      15
                    );
                    return due ? formatDate(due.toISOString()) : "-";
                  })()}
                </div>
              )}
              <label>
                Amount
                <input
                  type="number"
                  value={paymentForm.amount}
                  onChange={(e) =>
                    setPaymentForm((prev) => ({
                      ...prev,
                      amount: e.target.value,
                    }))
                  }
                  required
                />
              </label>
              <label>
                Payment Date
                <input
                  type="date"
                  value={paymentForm.date}
                  onChange={(e) =>
                    setPaymentForm((prev) => ({
                      ...prev,
                      date: e.target.value,
                    }))
                  }
                  required
                />
              </label>
              {formError && <p className="form-error">{formError}</p>}
              <button className="primary-button" type="submit">
                Save Payment
              </button>
            </form>
          </div>
        </div>
      )}

      {pendingUndo && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Confirm Undo</h3>
              <button
                className="ghost-button"
                type="button"
                onClick={() => setPendingUndo(null)}
              >
                Close
              </button>
            </div>
            <div className="modal-body">
              <p>
                Are you sure you want to undo this action?
              </p>
              <div className="helper-text">
                {pendingUndo.action} • {pendingUndo.label}
              </div>
            </div>
            <div className="modal-actions">
              <button
                className="ghost-button"
                type="button"
                onClick={() => setPendingUndo(null)}
              >
                Cancel
              </button>
              <button className="primary-button" type="button" onClick={handleConfirmUndo}>
                Yes, Undo
              </button>
            </div>
          </div>
        </div>
      )}

      {showProjectModal && (
        <div className="modal-overlay">
          <div className="modal-card modal-wide">
            <div className="modal-header">
              <h3>Add New Project</h3>
              <button
                className="ghost-button"
                type="button"
                onClick={() => {
                  setShowProjectModal(false);
                  resetProjectForm();
                }}
              >
                Close
              </button>
            </div>
            <form className="modal-form" onSubmit={handleCreateProject}>
              <label>
                Project Name
                <input
                  value={projectForm.name}
                  onChange={(e) =>
                    setProjectForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  required
                />
              </label>
              <div className="modal-row">
                <label>
                  City
                  <input
                    value={projectForm.city}
                    onChange={(e) =>
                      setProjectForm((prev) => ({ ...prev, city: e.target.value }))
                    }
                    required
                  />
                </label>
                <label>
                  State
                  <SearchableSelect
                    value={projectForm.state}
                    onChange={handleProjectStateChange}
                    options={indiaStatesSorted.map((state) => ({
                      value: state,
                      label: state,
                    }))}
                    placeholder="Select state..."
                    name="project-state"
                    autoComplete="new-password"
                  />
                </label>
                <label>
                  Pincode
                  <SearchableSelect
                    value={projectForm.pincode}
                    onChange={(value) =>
                      setProjectForm((prev) => ({ ...prev, pincode: value }))
                    }
                    onInputChange={(val) => {
                      setPincodeSelected(false);
                      setPincodeQuery(val);
                    }}
                    onSelect={(val) => {
                      setPincodeSelected(true);
                      setPincodeQuery(val);
                    }}
                    onSearch={handlePincodeSearch}
                    options={visiblePincodeOptions.map((item) => ({
                      value: item.pincode,
                      label: `${item.pincode}${
                        item.district ? ` • ${item.district}` : ""
                      }${item.name ? ` • ${item.name}` : ""}`,
                    }))}
                    placeholder={
                      projectForm.state ? "Search pincode..." : "Select state first"
                    }
                    disabled={!projectForm.state}
                    loadingLabel={
                      pincodeLoading
                        ? "Searching..."
                        : pincodeError ||
                          (projectForm.state
                            ? pincodeQuery.trim().length >= 3 &&
                              !visiblePincodeOptions.length
                              ? "Type correct pincode for selected state"
                              : "Type at least 3 characters"
                            : "Select state first")
                    }
                    name="project-pincode"
                    autoComplete="new-password"
                    inputMode="numeric"
                    maxLength={6}
                  />
                </label>
              </div>
              <label>
                Full Address
                <input
                  value={projectForm.address}
                  onChange={(e) =>
                    setProjectForm((prev) => ({ ...prev, address: e.target.value }))
                  }
                  required
                />
              </label>
              <div className="modal-row">
                <label>
                  Total Project Area (sq yd)
                  <input
                    type="number"
                    value={projectForm.totalArea}
                    onChange={(e) =>
                      setProjectForm((prev) => ({
                        ...prev,
                        totalArea: e.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <label>
                Number of Blocks
                <input
                  type="number"
                  min="1"
                  value={projectForm.blocksCount}
                  onChange={(e) => {
                    const count = Math.max(0, Number(e.target.value));
                    setProjectForm((prev) => {
                      const nextBlocks = [...(prev.blocks || [])];
                      if (count > nextBlocks.length) {
                        while (nextBlocks.length < count) {
                          nextBlocks.push({ name: "", totalProperties: "" });
                        }
                      } else if (count < nextBlocks.length) {
                        nextBlocks.splice(count);
                      }
                      return {
                        ...prev,
                        blocksCount: e.target.value,
                        blocks: nextBlocks,
                      };
                    });
                  }}
                  required
                />
              </label>
              {projectForm.blocks.length > 0 && (
                <>
                  <div className="modal-divider">Blocks</div>
                  {projectForm.blocks.map((block, index) => (
                    <div className="modal-row" key={`block-${index}`}>
                      <label>
                        Block Name
                        <input
                          value={block.name}
                          onChange={(e) => {
                            const cleaned = e.target.value
                              .replace(/[^A-Za-z]/g, "")
                              .toUpperCase();
                            const nextBlocks = [...projectForm.blocks];
                            nextBlocks[index] = {
                              ...nextBlocks[index],
                              name: cleaned,
                            };
                            setProjectForm((prev) => ({
                              ...prev,
                              blocks: nextBlocks,
                            }));
                          }}
                          required
                        />
                      </label>
                      <label>
                        Total Properties
                        <input
                          type="number"
                          value={block.totalProperties}
                          onChange={(e) => {
                            const nextBlocks = [...projectForm.blocks];
                            nextBlocks[index] = {
                              ...nextBlocks[index],
                              totalProperties: e.target.value,
                            };
                            setProjectForm((prev) => ({
                              ...prev,
                              blocks: nextBlocks,
                            }));
                          }}
                          required
                        />
                      </label>
                    </div>
                  ))}
                </>
              )}
              {formError && <p className="form-error">{formError}</p>}
              <button className="primary-button" type="submit">
                Save Project
              </button>
            </form>
          </div>
        </div>
      )}

      {showUserModal && (
        <div className="modal-overlay">
          <div className="modal-card modal-wide">
            <div className="modal-header">
              <h3>Create User</h3>
              <button
                className="ghost-button"
                type="button"
                onClick={() => setShowUserModal(false)}
              >
                Close
              </button>
            </div>
            <form className="modal-form" onSubmit={handleCreateUser}>
              <label>
                Username
                <input
                  value={userForm.username}
                  onChange={(event) =>
                    setUserForm((prev) => ({
                      ...prev,
                      username: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <label>
                Role
                <input
                  value={userForm.role}
                  onChange={(event) =>
                    setUserForm((prev) => ({ ...prev, role: event.target.value }))
                  }
                  required
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={userForm.password}
                  onChange={(event) =>
                    setUserForm((prev) => ({
                      ...prev,
                      password: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <div className="modal-divider">Permissions</div>
              <div className="checkbox-grid">
                {permissionOptions.map((perm) => (
                  <label key={perm.id} className="checkbox-item">
                    <input
                      type="checkbox"
                      checked={userForm.permissions.includes(perm.id)}
                      onChange={(event) => {
                        setUserForm((prev) => {
                          const next = new Set(prev.permissions);
                          if (event.target.checked) {
                            next.add(perm.id);
                          } else {
                            next.delete(perm.id);
                          }
                          return { ...prev, permissions: Array.from(next) };
                        });
                      }}
                    />
                    <span>{perm.label}</span>
                  </label>
                ))}
              </div>
              {userFormError && <p className="form-error">{userFormError}</p>}
              <button className="primary-button" type="submit">
                Save User
              </button>
            </form>
          </div>
        </div>
      )}

      {showEditUserModal && (
        <div className="modal-overlay">
          <div className="modal-card modal-wide">
            <div className="modal-header">
              <h3>Edit User</h3>
              <button
                className="ghost-button"
                type="button"
                onClick={() => setShowEditUserModal(false)}
              >
                Close
              </button>
            </div>
            <form className="modal-form" onSubmit={handleUpdateUser}>
              <label>
                Role
                <input
                  value={editUserForm.role}
                  onChange={(event) =>
                    setEditUserForm((prev) => ({
                      ...prev,
                      role: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <label>
                Reset Password (optional)
                <input
                  type="password"
                  value={editUserForm.password}
                  onChange={(event) =>
                    setEditUserForm((prev) => ({
                      ...prev,
                      password: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="checkbox-item">
                <input
                  type="checkbox"
                  checked={editUserForm.active}
                  onChange={(event) =>
                    setEditUserForm((prev) => ({
                      ...prev,
                      active: event.target.checked,
                    }))
                  }
                />
                <span>Active account</span>
              </label>
              <div className="modal-divider">Permissions</div>
              <div className="checkbox-grid">
                {permissionOptions.map((perm) => (
                  <label key={perm.id} className="checkbox-item">
                    <input
                      type="checkbox"
                      checked={editUserForm.permissions.includes(perm.id)}
                      onChange={(event) => {
                        setEditUserForm((prev) => {
                          const next = new Set(prev.permissions);
                          if (event.target.checked) {
                            next.add(perm.id);
                          } else {
                            next.delete(perm.id);
                          }
                          return { ...prev, permissions: Array.from(next) };
                        });
                      }}
                    />
                    <span>{perm.label}</span>
                  </label>
                ))}
              </div>
              {userFormError && <p className="form-error">{userFormError}</p>}
              <button className="primary-button" type="submit">
                Save Changes
              </button>
            </form>
          </div>
        </div>
      )}

      {showEmployeeModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3>{editingEmployeeId ? "Edit Employee" : "Add Employee"}</h3>
              <button
                className="ghost-button"
                type="button"
                onClick={() => {
                  setShowEmployeeModal(false);
                  resetEmployeeForm();
                }}
              >
                Close
              </button>
            </div>
            <form className="modal-form" onSubmit={handleSaveEmployee}>
              <label>
                Full Name
                <input
                  value={employeeForm.name}
                  onChange={(event) =>
                    setEmployeeForm((prev) => ({
                      ...prev,
                      name: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <label>
                Role / Department
                <input
                  value={employeeForm.role}
                  onChange={(event) =>
                    setEmployeeForm((prev) => ({
                      ...prev,
                      role: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <label>
                Phone
                <input
                  value={employeeForm.phone}
                  onChange={(event) =>
                    setEmployeeForm((prev) => ({
                      ...prev,
                      phone: event.target.value,
                    }))
                  }
                  placeholder="+91..."
                />
              </label>
              <label>
                Join Date
                <input
                  type="datetime-local"
                  value={employeeForm.joinDate}
                  onChange={(event) =>
                    setEmployeeForm((prev) => ({
                      ...prev,
                      joinDate: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <label>
                Monthly Salary
                <input
                  type="number"
                  value={employeeForm.monthlySalary}
                  onChange={(event) =>
                    setEmployeeForm((prev) => ({
                      ...prev,
                      monthlySalary: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              {employeeFormError && (
                <p className="form-error">{employeeFormError}</p>
              )}
              <button className="primary-button" type="submit">
                Save Employee
              </button>
            </form>
          </div>
        </div>
      )}

      {showSalaryModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Record Salary Payment</h3>
              <button
                className="ghost-button"
                type="button"
                onClick={() => setShowSalaryModal(false)}
              >
                Close
              </button>
            </div>
            <form className="modal-form" onSubmit={handleSaveSalaryPayment}>
              <label>
                Month
                <input value={salaryForm.month} disabled />
              </label>
              <label>
                Amount
                <input value={salaryForm.amount} disabled />
              </label>
              <label>
                Paid Date
                <input
                  type="datetime-local"
                  value={salaryForm.paidDate}
                  onChange={(event) =>
                    setSalaryForm((prev) => ({
                      ...prev,
                      paidDate: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              {employeeFormError && (
                <p className="form-error">{employeeFormError}</p>
              )}
              <button className="primary-button" type="submit">
                Save Payment
              </button>
            </form>
          </div>
        </div>
      )}

      {showProjectDetailModal && selectedProject && (
        <div className="modal-overlay">
          <div className="modal-card modal-wide">
            <div className="modal-header">
              <h3>{selectedProject.name} Project Details</h3>
              <button
                className="ghost-button"
                type="button"
                onClick={() => setShowProjectDetailModal(false)}
              >
                Close
              </button>
            </div>
            <div className="project-details">
              <div className="detail-row">
                <span>Location</span>
                <strong>
                  {selectedProject.city}, {selectedProject.state}{" "}
                  {selectedProject.pincode}
                </strong>
              </div>
              <div className="detail-row">
                <span>Address</span>
                <strong>{selectedProject.address}</strong>
              </div>
              <div className="detail-row">
                <span>Total Area</span>
                <strong>
                  {selectedProject.total_area
                    ? `${selectedProject.total_area} sq yd`
                    : "-"}
                </strong>
              </div>
            </div>
            <div className="profile-grid">
              {(() => {
                const stats = projectPropertyStats[selectedProject.id] || {
                  total: 0,
                  available: 0,
                  sold: 0,
                  bySale: 0,
                  byInvestment: 0,
                };
                return (
                  <>
                    <div className="profile-card">
                      <p className="muted">Total Properties</p>
                      <h3>{stats.total}</h3>
                    </div>
                    <div className="profile-card">
                      <p className="muted">Available</p>
                      <h3>{stats.available}</h3>
                    </div>
                    <div className="profile-card">
                      <p className="muted">Sold</p>
                      <h3>{stats.sold}</h3>
                    </div>
                    <div className="profile-card">
                      <p className="muted">Sales</p>
                      <h3>{stats.bySale}</h3>
                    </div>
                    <div className="profile-card">
                      <p className="muted">Investments</p>
                      <h3>{stats.byInvestment}</h3>
                    </div>
                  </>
                );
              })()}
            </div>
            <div className="modal-divider">Blocks</div>
            {projectDetailLoading && (
              <p className="muted">Loading project details...</p>
            )}
            {projectDetailError && (
              <p className="form-error">{projectDetailError}</p>
            )}
            <table className="data-table compact">
              <thead>
                <tr>
                  <th>Block</th>
                  <th>Total Properties</th>
                  <th>Available</th>
                  <th>Sold</th>
                </tr>
              </thead>
              <tbody>
                {selectedProjectBlocks.map((block) => {
                  const blockProps = modalProjectProperties.filter(
                    (prop) => prop.block_id === block.id
                  );
                  const available = blockProps.filter(
                    (prop) => !prop.status || prop.status === "available"
                  ).length;
                  return (
                    <tr key={block.id}>
                      <td>{block.name}</td>
                      <td>{blockProps.length}</td>
                      <td>{available}</td>
                      <td>{blockProps.length - available}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="modal-divider">Properties</div>
            <div className="table-scroll">
              <table className="data-table compact">
                <thead>
                  <tr>
                    <th>Block</th>
                    <th>Property</th>
                    <th>Status</th>
                    <th>Type</th>
                    <th>Member</th>
                    <th>Amount</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {modalProjectProperties.map((prop) => {
                    const blockName = blocksById[prop.block_id]?.name || "-";
                    const sale = prop.last_sale_id
                      ? salesById[prop.last_sale_id]
                      : null;
                    const investment = prop.last_investment_id
                      ? investmentsById[prop.last_investment_id]
                      : null;
                    const memberName =
                      prop.last_sale_seller_name ||
                      prop.last_investment_person_name ||
                      (sale
                        ? peopleIndex[sale.sellerId]?.name
                        : investment
                        ? investment.personName
                        : "-");
                    const memberId =
                      prop.last_sale_seller_id ||
                      prop.last_investment_person_id ||
                      (sale
                        ? sale.sellerId
                        : investment
                        ? investment.personId
                        : null);
                    const type = prop.last_sale_id
                      ? "Sale"
                      : prop.last_investment_id
                      ? "Investment"
                      : "-";
                    const amount =
                      prop.last_sale_amount ?? sale?.totalAmount ?? prop.last_investment_amount ?? investment?.amount ?? null;
                    const date =
                      prop.last_sale_date ||
                      sale?.saleDate ||
                      prop.last_investment_date ||
                      investment?.date ||
                      null;
                    return (
                      <tr key={prop.id}>
                        <td>{blockName}</td>
                        <td>
                          <button
                            className="link-button"
                            type="button"
                            onClick={() => openPropertyDetail(prop.id)}
                          >
                            {prop.name}
                          </button>
                        </td>
                        <td>{prop.status || "available"}</td>
                        <td>{type}</td>
                        <td>
                          {memberId ? (
                            <button
                              className="link-button"
                              type="button"
                              onClick={() => openPersonProfile(memberId)}
                            >
                              {formatName(memberName)}
                            </button>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td>{amount ? formatCurrency(amount) : "-"}</td>
                        <td>{date ? formatDate(date) : "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {showPropertyDetailModal && selectedPropertyId && (
        <div className="modal-overlay">
          <div className="modal-card modal-wide">
            <div className="modal-header">
              <h3>Property Details</h3>
              <button
                className="ghost-button"
                type="button"
                onClick={() => {
                  setShowPropertyDetailModal(false);
                  setSelectedPropertyId("");
                }}
              >
                Close
              </button>
            </div>
            {(() => {
              const prop = propertiesById[selectedPropertyId];
              if (!prop) {
                return <p className="muted">Property not found.</p>;
              }
              const project = projectsById[prop.project_id];
              const block = blocksById[prop.block_id];
              const sale = prop.last_sale_id ? salesById[prop.last_sale_id] : null;
              const investment = prop.last_investment_id
                ? investmentsById[prop.last_investment_id]
                : null;
              const saleSeller = sale ? peopleIndex[sale.sellerId] : null;
              const investmentOwner = investment
                ? peopleIndex[investment.personId]
                : null;
              const saleData = {
                sellerId: prop.last_sale_seller_id || sale?.sellerId,
                sellerName:
                  prop.last_sale_seller_name || saleSeller?.name || "",
                saleDate: prop.last_sale_date || sale?.saleDate,
                areaSqYd: prop.last_sale_area ?? sale?.areaSqYd,
                totalAmount: prop.last_sale_amount ?? sale?.totalAmount,
                status: prop.last_sale_status || sale?.status,
              };
              const hasSale = !!(prop.last_sale_id || sale);
              const investmentData = {
                personId:
                  prop.last_investment_person_id || investment?.personId,
                personName:
                  prop.last_investment_person_name ||
                  investmentOwner?.name ||
                  "",
                date: prop.last_investment_date || investment?.date,
                amount: prop.last_investment_amount ?? investment?.amount,
                areaSqYd: prop.last_investment_area ?? investment?.areaSqYd,
                returnPercent:
                  prop.last_investment_return_percent ?? investment?.returnPercent,
                buybackDate:
                  prop.last_investment_buyback_date ||
                  investment?.buybackDate,
                status: prop.last_investment_status || investment?.status,
              };
              const hasInvestment = !!(prop.last_investment_id || investment);
              return (
                <>
                  <div className="project-details">
                    <div className="detail-row">
                      <span>Project</span>
                      <strong>{project?.name || "-"}</strong>
                    </div>
                    <div className="detail-row">
                      <span>Block</span>
                      <strong>{block?.name || "-"}</strong>
                    </div>
                    <div className="detail-row">
                      <span>Property</span>
                      <strong>{prop.name}</strong>
                    </div>
                    <div className="detail-row">
                      <span>Status</span>
                      <strong>{prop.status || "available"}</strong>
                    </div>
                    <div className="detail-row">
                      <span>Address</span>
                      <strong>
                        {project
                          ? `${project.address}, ${project.city}, ${project.state} ${project.pincode}`
                          : "-"}
                      </strong>
                    </div>
                  </div>
                  <div className="modal-divider">Latest Sale</div>
                  {hasSale ? (
                    <div className="project-details">
                      <div className="detail-row">
                        <span>Seller</span>
                        <strong>
                          <button
                            className="link-button"
                            type="button"
                            onClick={() =>
                              saleData.sellerId
                                ? openPersonProfile(saleData.sellerId)
                                : null
                            }
                          >
                            {formatName(saleData.sellerName || "-")}
                          </button>
                        </strong>
                      </div>
                      <div className="detail-row">
                        <span>Sale Date</span>
                        <strong>
                          {saleData.saleDate ? formatDate(saleData.saleDate) : "-"}
                        </strong>
                      </div>
                      <div className="detail-row">
                        <span>Area</span>
                        <strong>
                          {saleData.areaSqYd ? `${saleData.areaSqYd} sq yd` : "-"}
                        </strong>
                      </div>
                      <div className="detail-row">
                        <span>Total Amount</span>
                        <strong>
                          {saleData.totalAmount
                            ? formatCurrency(saleData.totalAmount)
                            : "-"}
                        </strong>
                      </div>
                      <div className="detail-row">
                        <span>Status</span>
                        <strong>{saleData.status || "active"}</strong>
                      </div>
                    </div>
                  ) : (
                    <p className="muted">No sale recorded for this property.</p>
                  )}
                  <div className="modal-divider">Latest Investment</div>
                  {hasInvestment ? (
                    <div className="project-details">
                      <div className="detail-row">
                        <span>Member</span>
                        <strong>
                          <button
                            className="link-button"
                            type="button"
                            onClick={() =>
                              investmentData.personId
                                ? openPersonProfile(investmentData.personId)
                                : null
                            }
                          >
                            {formatName(investmentData.personName || "-")}
                          </button>
                        </strong>
                      </div>
                      <div className="detail-row">
                        <span>Investment Date</span>
                        <strong>
                          {investmentData.date
                            ? formatDate(investmentData.date)
                            : "-"}
                        </strong>
                      </div>
                      <div className="detail-row">
                        <span>Amount</span>
                        <strong>
                          {investmentData.amount
                            ? formatCurrency(investmentData.amount)
                            : "-"}
                        </strong>
                      </div>
                      <div className="detail-row">
                        <span>Area</span>
                        <strong>
                          {investmentData.areaSqYd
                            ? `${investmentData.areaSqYd} sq yd`
                            : "-"}
                        </strong>
                      </div>
                      <div className="detail-row">
                        <span>Return %</span>
                        <strong>
                          {investmentData.returnPercent
                            ? `${investmentData.returnPercent}%`
                            : "-"}
                        </strong>
                      </div>
                      <div className="detail-row">
                        <span>Buyback Date</span>
                        <strong>
                          {investmentData.buybackDate
                            ? formatDate(investmentData.buybackDate)
                            : "-"}
                        </strong>
                      </div>
                      <div className="detail-row">
                        <span>Status</span>
                        <strong>{investmentData.status || "-"}</strong>
                      </div>
                    </div>
                  ) : (
                    <p className="muted">No investment recorded for this property.</p>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}

      {showCommissionModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Record Commission Payout</h3>
              <button
                className="ghost-button"
                type="button"
                onClick={() => setShowCommissionModal(false)}
              >
                Close
              </button>
            </div>
            <form className="modal-form" onSubmit={handleCreateCommissionPayment}>
              <label>
                Person
                <SearchableSelect
                  key={showCommissionModal ? "open" : "closed"}
                  value={commissionForm.personId}
                  onChange={(value) => {
                    setCommissionForm((prev) => ({
                      ...prev,
                      personId: value,
                    }));
                    setCommissionBalance(null);
                    if (!value) return;
                    fetchCommissionBalance(value)
                      .then((data) => {
                        setCommissionBalance(data);
                        const balance = Math.max(
                          0,
                          (data.totalCommission || 0) - (data.totalPaid || 0)
                        );
                        setCommissionForm((prev) => ({
                          ...prev,
                          amount: balance,
                        }));
                      })
                      .catch((err) => {
                        console.error(err);
                      });
                  }}
                  options={[
                    ...people.map((person) => ({
                      value: person.id,
                      label: formatName(person.name),
                    })),
                  ]}
                  placeholder="Search person..."
                />
              </label>
              {selectedCommissionRow && (
                <p className="muted">
                  Balance due:{" "}
                  {formatCurrency(
                    Math.max(
                      0,
                      selectedCommissionRow.totalCommission -
                        selectedCommissionRow.totalPaid
                    )
                  )}
                </p>
              )}
              <label>
                Amount
                <input
                  type="number"
                  value={commissionForm.amount}
                  onChange={(e) =>
                    setCommissionForm((prev) => ({
                      ...prev,
                      amount: e.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Date
                <input
                  type="datetime-local"
                  value={commissionForm.date}
                  onChange={(e) =>
                    setCommissionForm((prev) => ({
                      ...prev,
                      date: e.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Note (optional)
                <input
                  value={commissionForm.note}
                  onChange={(e) =>
                    setCommissionForm((prev) => ({
                      ...prev,
                      note: e.target.value,
                    }))
                  }
                />
              </label>
              {formError && <p className="form-error">{formError}</p>}
              <button className="primary-button" type="submit">
                Save Payout
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;









