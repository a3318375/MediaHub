import {
useEffect,
useMemo,
useRef,
useState,
type FormEvent,
type ReactNode,
} from "react";

import {
Button,
Card,
Checkbox,
Chip,
Dropdown,
Input,
Tabs
} from "@heroui/react";

import {
ArrowDown,
ArrowDownToLine,
ArrowRight,
ArrowUp,
ArrowUpDown,
Bell,
CalendarDays,
ChartColumnIncreasing,
Check,
ChevronDown,
CircleHelp,
Columns3,
Copy,
Eye,
House,
ListChecks,
LogOut,
Mail,
Menu,
Moon,
MoreVertical,
PanelLeft,
Pencil,
Plus,
ReceiptText,
RefreshCcw,
Search,
Settings,
SlidersHorizontal,
Sun,
Trash2,
UserPlus,
X
} from "lucide-react";

import {
DEMO_EMAIL,
DEMO_PASSWORD,
EMPLOYEES_KEY,
SESSION_KEY,
initialEmployees,
readEmployees,
readSession,
type Employee,
} from "./data";

import { Overlay } from '../components/ui/Overlay';
import { SalesChart,TrafficChart } from "./charts";
import { Login } from './DemoLogin';
export { Overlay } from '../components/ui/Overlay';
export { Login } from './DemoLogin';


type DialogState =
  | { kind: "invite" }
  | { kind: "view" | "edit" | "delete"; employee: Employee }
  | { kind: "search" | "notifications" | "help" | "settings" | "forgot" }
  | null;

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: House },
  { id: "orders", label: "Orders", icon: ReceiptText },
  { id: "tracker", label: "Tracker", icon: ListChecks },
  { id: "analytics", label: "Analytics", icon: ChartColumnIncreasing },
  { id: "settings", label: "Settings", icon: Settings },
];


function ChoiceMenu({
  label,
  icon,
  options,
  value,
  onChange,
  ariaLabel,
}: {
  label: ReactNode;
  icon?: ReactNode;
  options: { id: string; label: string }[];
  value?: string;
  onChange: (id: string) => void;
  ariaLabel: string;
}) {
  return (
    <Dropdown>
      <Dropdown.Trigger
        className={`button button--secondary button--sm control-button ${typeof label === "string" ? "" : "icon-control"}`}
        aria-label={ariaLabel}
      >
        {icon}
        {label}
        <ChevronDown size={14} />
      </Dropdown.Trigger>
      <Dropdown.Popover placement="bottom end">
        <Dropdown.Menu
          aria-label={ariaLabel}
          onAction={(key) => onChange(String(key))}
        >
          {options.map((option) => (
            <Dropdown.Item
              key={option.id}
              id={option.id}
              textValue={option.label}
            >
              <span>{option.label}</span>
              {value === option.id && (
                <Check size={14} className="menu-check" />
              )}
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

export function Avatar({
  name = "Kate Moore",
  avatar = "blue-light",
  className = "",
}: {
  name?: string;
  avatar?: string;
  className?: string;
}) {
  return (
    <img
      src={`/avatars/${avatar}.jpg`}
      alt={name}
      className={`avatar ${className}`}
    />
  );
}

export function Growth({
  value = "3.3%",
  negative = false,
  soft = false,
}: {
  value?: string;
  negative?: boolean;
  soft?: boolean;
}) {
  return (
    <span
      className={`growth ${negative ? "negative" : ""} ${soft ? "soft" : ""}`}
    >
      {negative ? <ArrowDown size={11} /> : <ArrowUp size={11} />} {value}
    </span>
  );
}


export default function App() {
  const [session, setSession] = useState(readSession);
  const [employees, setEmployees] = useState(readEmployees);
  const [activePage, setActivePage] = useState("dashboard");
  const [tab, setTab] = useState("overview");
  const [period, setPeriod] = useState("Monthly");
  const [chartRange, setChartRange] = useState("Last 2 weeks");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sort, setSort] = useState("default");
  const [columns, setColumns] = useState({ role: true, type: true });
  const [page, setPage] = useState(1);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formRole, setFormRole] = useState("");
  const [formType, setFormType] = useState<"Employee" | "Contractor">(
    "Employee",
  );
  const [formError, setFormError] = useState("");
  const [toast, setToast] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [dark, setDark] = useState(() => {
    try {
      return localStorage.getItem("hero.demo.theme") === "dark";
    } catch {
      return false;
    }
  });
  const [tasks, setTasks] = useState([
    { name: "Review this month’s performance", done: true },
    { name: "Prepare the quarterly report", done: false },
    { name: "Meet with the design team", done: false },
    { name: "Review new employee onboarding", done: true },
  ]);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("hero.demo.theme", dark ? "dark" : "light");
    } catch {}
  }, [dark]);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    },
    [],
  );
  function notify(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3500);
  }
  function saveEmployees(items: Employee[]) {
    setEmployees(items);
    try {
      localStorage.setItem(EMPLOYEES_KEY, JSON.stringify(items));
    } catch {
      notify("Changes are available for this session only.");
    }
  }
  function login(remember: boolean) {
    const data = JSON.stringify({ email: DEMO_EMAIL });
    try {
      localStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(SESSION_KEY);
      (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, data);
    } catch {}
    setSession(DEMO_EMAIL);
    window.scrollTo(0, 0);
    location.hash = "/dashboard";
  }
  function logout() {
    try {
      localStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(SESSION_KEY);
    } catch {}
    setDialog(null);
    setSession(null);
    setActivePage("dashboard");
    setMobileOpen(false);
    window.scrollTo(0, 0);
    location.hash = "/login";
  }
  const factor =
    { Daily: 0.033, Weekly: 0.25, Monthly: 1, Yearly: 12 }[period] ?? 1;
  const chartFactor =
    (period === "Yearly"
      ? 1.08
      : period === "Weekly"
        ? 0.85
        : period === "Daily"
          ? 0.65
          : 1) *
    (tab === "expenses" ? 0.68 : 1) *
    (chartRange === "Last week" ? 0.75 : chartRange === "Last month" ? 1.1 : 1);
  const filtered = useMemo(() => {
    let result = employees.filter(
      (employee) =>
        (typeFilter === "all" || employee.type === typeFilter) &&
        `${employee.name} ${employee.email} ${employee.role} ${employee.id}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
    );
    if (sort !== "default")
      result = [...result].sort((a, b) =>
        sort === "name-desc"
          ? b.name.localeCompare(a.name)
          : a.name.localeCompare(b.name),
      );
    return result;
  }, [employees, typeFilter, query, sort]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 6));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * 6, currentPage * 6);
  function openEmployee(kind: "view" | "edit" | "delete", employee: Employee) {
    setFormName(employee.name);
    setFormEmail(employee.email);
    setFormRole(employee.role);
    setFormType(employee.type);
    setFormError("");
    setDialog({ kind, employee });
  }
  function invite() {
    setFormName("");
    setFormEmail("");
    setFormRole("Team Member");
    setFormType("Employee");
    setFormError("");
    setDialog({ kind: "invite" });
  }
  function submitEmployee(event: FormEvent) {
    event.preventDefault();
    if (!formName.trim() || !formEmail.trim() || !formRole.trim()) {
      setFormError("Please fill in all fields.");
      return;
    }
    const editing = dialog?.kind === "edit" ? dialog.employee : null;
    if (
      employees.some(
        (item) =>
          item.email.toLowerCase() === formEmail.trim().toLowerCase() &&
          item.id !== editing?.id,
      )
    ) {
      setFormError("A member with this email already exists.");
      return;
    }
    const employee: Employee = {
      id:
        editing?.id ??
        String(
          Math.max(...employees.map((item) => Number(item.id)), 4586937) + 1,
        ),
      name: formName.trim(),
      email: formEmail.trim(),
      role: formRole.trim(),
      type: formType,
      avatar: editing?.avatar ?? "indigo",
    };
    saveEmployees(
      editing
        ? employees.map((item) => (item.id === editing.id ? employee : item))
        : [employee, ...employees],
    );
    setPage(1);
    setDialog(null);
    notify(
      editing
        ? "Member updated."
        : "Member added to this local demo. No email was sent.",
    );
  }
  function download() {
    const escape = (text: string) => `"${text.replaceAll('"', '""')}"`;
    const rows = [
      ["Worker ID", "Member", "Email", "Role", "Worker Type"],
      ...filtered.map((item) => [
        item.id,
        item.name,
        item.email,
        item.role,
        item.type,
      ]),
    ];
    const blob = new Blob(
      ["\uFEFF" + rows.map((row) => row.map(escape).join(",")).join("\r\n")],
      { type: "text/csv;charset=utf-8;" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "hero-employees.csv";
    anchor.click();
    URL.revokeObjectURL(url);
    notify("Employee report downloaded.");
  }
  function refresh() {
    setRefreshing(true);
    refreshTimer.current = setTimeout(() => {
      setRefreshing(false);
      notify("Dashboard is up to date.");
    }, 550);
  }
  function navigate(id: string) {
    if (id === "settings") {
      setDialog({ kind: "settings" });
      return;
    }
    setActivePage(id);
    setMobileOpen(false);
    window.scrollTo(0, 0);
    location.hash = `/${id}`;
  }
  const money = (value: number) =>
    `US$${Math.round(value * factor).toLocaleString("en-US")}`;
  const stats = [
    { label: "Revenue", value: money(228441), change: "3.3%" },
    { label: "Expenses", value: money(25108), change: "3.3%", negative: true },
    {
      label: "Sales",
      value: Math.round(458 * factor).toLocaleString("en-US"),
      change: "3.3%",
    },
    { label: "Profit", value: money(203133), change: "4.1%" },
  ];
  const dialogTitle =
    dialog?.kind === "invite"
      ? "Invite a team member"
      : dialog?.kind === "view"
        ? "Member details"
        : dialog?.kind === "edit"
          ? "Edit member"
          : dialog?.kind === "delete"
            ? "Delete member?"
            : dialog?.kind === "settings"
              ? "Workspace settings"
              : dialog?.kind === "notifications"
                ? "Notifications"
                : dialog?.kind === "search"
                  ? "Search workspace"
                  : dialog?.kind === "forgot"
                    ? "Demo account"
                    : "Help & Information";

  return (
    <>
      {!session ? (
        <Login onLogin={login} onForgot={() => setDialog({ kind: "forgot" })} />
      ) : (
        <div
          className={`app-shell ${sidebarCollapsed ? "is-collapsed" : ""} ${mobileOpen ? "mobile-open" : ""}`}
        >
          {mobileOpen && (
            <button
              className="sidebar-backdrop"
              aria-label="Close navigation"
              onClick={() => setMobileOpen(false)}
            />
          )}
          <aside className="sidebar">
            <button
              className="profile"
              onClick={() => setDialog({ kind: "settings" })}
            >
              <Avatar />
              <span>
                <strong>Kate Moore</strong>
                <small>Admin</small>
              </span>
            </button>
            <nav className="primary-nav" aria-label="Dashboard navigation">
              {navItems.map(({ id, label, icon: Icon }) => (
                <Button
                  key={id}
                  variant="ghost"
                  className={`nav-item ${activePage === id ? "active" : ""}`}
                  onPress={() => navigate(id)}
                  aria-label={label}
                  aria-current={activePage === id ? "page" : undefined}
                >
                  <Icon size={18} />
                  <span className="nav-label">{label}</span>
                  {id === "tracker" && <span className="new-badge">New</span>}
                </Button>
              ))}
            </nav>
            <nav className="account-nav" aria-label="Account">
              <Button
                variant="ghost"
                className="nav-item"
                onPress={() => setDialog({ kind: "help" })}
                aria-label="Help & Information"
              >
                <CircleHelp size={18} />
                <span className="nav-label">Help & Information</span>
              </Button>
              <Button
                variant="ghost"
                className="nav-item"
                onPress={logout}
                aria-label="Log out"
              >
                <LogOut size={18} />
                <span className="nav-label">Log out</span>
              </Button>
            </nav>
          </aside>
          <div className="app-content">
            <header className="topbar">
              <div className="header-title">
                <Button
                  isIconOnly
                  variant="ghost"
                  size="sm"
                  aria-label="Toggle sidebar"
                  onPress={() => {
                    if (matchMedia("(max-width: 760px)").matches)
                      setMobileOpen(!mobileOpen);
                    else setSidebarCollapsed(!sidebarCollapsed);
                  }}
                >
                  <PanelLeft size={18} className="desktop-menu" />
                  <Menu size={19} className="mobile-menu" />
                </Button>
                <h1>
                  {activePage === "dashboard"
                    ? "Good morning, Kate"
                    : activePage === "orders"
                      ? "Orders"
                      : activePage === "tracker"
                        ? "Tracker"
                        : "Analytics"}
                </h1>
              </div>
              <div className="header-actions">
                <Button
                  isIconOnly
                  variant="secondary"
                  size="sm"
                  aria-label="Search"
                  onPress={() => {
                    setQuery("");
                    setDialog({ kind: "search" });
                  }}
                >
                  <Search size={17} />
                </Button>
                <Button
                  isIconOnly
                  variant="secondary"
                  size="sm"
                  aria-label="Notifications"
                  onPress={() => setDialog({ kind: "notifications" })}
                >
                  <Bell size={17} />
                </Button>
                <Button size="sm" className="invite-button" onPress={invite}>
                  <UserPlus size={16} />
                  Invite
                </Button>
              </div>
            </header>
            <main className="workspace">
              {(activePage === "dashboard" || activePage === "analytics") && (
                <>
                  <div className="dashboard-toolbar">
                    <Tabs
                      selectedKey={tab}
                      onSelectionChange={(key) => setTab(String(key))}
                      className="overview-tabs"
                    >
                      <Tabs.List aria-label="Dashboard tabs">
                        {["overview", "sales", "expenses"].map((id) => (
                          <Tabs.Tab key={id} id={id}>
                            {id[0].toUpperCase() + id.slice(1)}
                            <Tabs.Indicator />
                          </Tabs.Tab>
                        ))}
                      </Tabs.List>
                    </Tabs>
                    <div className="toolbar-actions">
                      <Button
                        variant="secondary"
                        size="sm"
                        isIconOnly
                        aria-label="Refresh"
                        onPress={refresh}
                      >
                        <RefreshCcw
                          size={16}
                          className={refreshing ? "spin" : ""}
                        />
                      </Button>
                      <ChoiceMenu
                        label={period}
                        icon={<CalendarDays size={16} />}
                        ariaLabel="Change period"
                        options={["Daily", "Weekly", "Monthly", "Yearly"].map(
                          (id) => ({ id, label: id }),
                        )}
                        value={period}
                        onChange={setPeriod}
                      />
                      <Button size="sm" onPress={download}>
                        Download
                      </Button>
                    </div>
                  </div>
                  <div className="stats-grid">
                    {stats.map((stat) => (
                      <Card key={stat.label} className="stat-card">
                        <span className="stat-label">{stat.label}</span>
                        <div className="stat-bottom">
                          <strong>{stat.value}</strong>
                          <Growth
                            value={stat.change}
                            negative={stat.negative}
                            soft
                          />
                        </div>
                      </Card>
                    ))}
                  </div>
                  <div className="charts-grid">
                    <Card className="chart-card">
                      <div className="card-heading">
                        <h2>
                          {tab === "expenses"
                            ? "Expenses Performance"
                            : "Sales Performance"}
                        </h2>
                        <ChoiceMenu
                          label={chartRange}
                          ariaLabel="Sales chart range"
                          options={[
                            "Last week",
                            "Last 2 weeks",
                            "Last month",
                          ].map((id) => ({ id, label: id }))}
                          value={chartRange}
                          onChange={setChartRange}
                        />
                      </div>
                      <div className="sales-metrics">
                        <div>
                          <div>
                            <strong>
                              {money(tab === "expenses" ? 4108 : 28441)}
                            </strong>
                            <Growth />
                          </div>
                          <span>
                            {tab === "expenses"
                              ? "Weekly Expenses"
                              : "Weekly Sales"}
                          </span>
                        </div>
                        <div>
                          <div>
                            <strong>
                              {money(tab === "expenses" ? 1063 : 4063)}
                            </strong>
                            <Growth />
                          </div>
                          <span>
                            {tab === "expenses"
                              ? "Daily Expenses"
                              : "Daily Sales"}
                          </span>
                        </div>
                        <div>
                          <div>
                            <strong>{Math.round(278 * factor)}</strong>
                            <Growth />
                          </div>
                          <span>
                            {tab === "expenses"
                              ? "Transactions"
                              : "Total Sales"}
                          </span>
                        </div>
                      </div>
                      <SalesChart factor={chartFactor} />
                    </Card>
                    <Card className="chart-card traffic-card">
                      <div className="card-heading">
                        <h2>Traffic Source</h2>
                        <div className="chart-legend">
                          <span>
                            <i />
                            Organic
                          </span>
                          <span>
                            <i />
                            Paid Ads
                          </span>
                          <ChoiceMenu
                            label={<MoreVertical size={17} />}
                            ariaLabel="Traffic options"
                            options={[
                              { id: "download", label: "Download report" },
                              { id: "refresh", label: "Refresh data" },
                            ]}
                            onChange={(id) =>
                              id === "download" ? download() : refresh()
                            }
                          />
                        </div>
                      </div>
                      <div className="traffic-metric">
                        <strong>
                          {Math.round(231856 * factor).toLocaleString()}
                        </strong>
                        <span>Sessions</span>
                      </div>
                      <TrafficChart
                        factor={
                          period === "Yearly"
                            ? 1.05
                            : period === "Daily"
                              ? 0.65
                              : period === "Weekly"
                                ? 0.85
                                : 1
                        }
                      />
                    </Card>
                  </div>
                </>
              )}
              {(activePage === "dashboard" || activePage === "analytics") && (
                <section className="employees-section" aria-label="Employees">
                  <div className="section-title">
                    <h2>All Employees</h2>
                    <Chip size="sm" variant="soft" className="count-chip">
                      {employees.length}
                    </Chip>
                  </div>
                  <div className="table-toolbar">
                    <div className="table-controls">
                      <ChoiceMenu
                        label="Filter"
                        icon={<SlidersHorizontal size={16} />}
                        ariaLabel="Filter employees"
                        options={[
                          { id: "all", label: "All workers" },
                          { id: "Employee", label: "Employees" },
                          { id: "Contractor", label: "Contractors" },
                        ]}
                        value={typeFilter}
                        onChange={(value) => {
                          setTypeFilter(value);
                          setPage(1);
                        }}
                      />
                      <ChoiceMenu
                        label="Sort"
                        icon={<ArrowDownToLine size={15} />}
                        ariaLabel="Sort employees"
                        options={[
                          { id: "default", label: "Default order" },
                          { id: "name-asc", label: "Name: A to Z" },
                          { id: "name-desc", label: "Name: Z to A" },
                        ]}
                        value={sort}
                        onChange={(value) => {
                          setSort(value);
                          setPage(1);
                        }}
                      />
                      <ChoiceMenu
                        label="Columns"
                        icon={<Columns3 size={16} />}
                        ariaLabel="Visible columns"
                        options={[
                          {
                            id: "role",
                            label: `${columns.role ? "Hide" : "Show"} role`,
                          },
                          {
                            id: "type",
                            label: `${columns.type ? "Hide" : "Show"} worker type`,
                          },
                        ]}
                        onChange={(id) =>
                          setColumns((current) => ({
                            ...current,
                            [id]: !current[id as keyof typeof current],
                          }))
                        }
                      />
                      {typeFilter !== "all" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onPress={() => setTypeFilter("all")}
                        >
                          {typeFilter}
                          <X size={12} />
                        </Button>
                      )}
                    </div>
                    <div className="table-search">
                      <Search size={17} />
                      <Input
                        aria-label="Search employees"
                        placeholder="Search..."
                        value={query}
                        onChange={(event) => {
                          setQuery(event.target.value);
                          setPage(1);
                        }}
                      />
                      {query && (
                        <Button
                          variant="ghost"
                          size="sm"
                          isIconOnly
                          aria-label="Clear search"
                          onPress={() => setQuery("")}
                        >
                          <X size={14} />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="employee-table-wrap">
                    <table
                      className="employee-table"
                      aria-label="All employees"
                    >
                      <thead>
                        <tr>
                          <th>Worker ID</th>
                          <th>
                            <button
                              onClick={() => {
                                setSort(
                                  sort === "name-asc"
                                    ? "name-desc"
                                    : "name-asc",
                                );
                                setPage(1);
                              }}
                            >
                              Member
                              <ArrowUpDown size={13} />
                            </button>
                          </th>
                          {columns.role && <th>Role</th>}
                          {columns.type && <th>Worker Type</th>}
                          <th className="actions-heading">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map((employee) => (
                          <tr key={employee.id}>
                            <td>
                              <div className="worker-id">
                                #{employee.id}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  isIconOnly
                                  aria-label={`Copy ID ${employee.id}`}
                                  onPress={() => {
                                    void navigator.clipboard
                                      .writeText(employee.id)
                                      .then(
                                        () => notify("Worker ID copied."),
                                        () =>
                                          notify(
                                            "Copy is unavailable in this browser.",
                                          ),
                                      );
                                  }}
                                >
                                  <Copy size={13} />
                                </Button>
                              </div>
                            </td>
                            <td>
                              <div className="member">
                                <Avatar
                                  avatar={employee.avatar}
                                  name={employee.name}
                                />
                                <span>
                                  <strong>{employee.name}</strong>
                                  <small>{employee.email}</small>
                                </span>
                              </div>
                            </td>
                            {columns.role && <td>{employee.role}</td>}
                            {columns.type && (
                              <td>
                                <span
                                  className={`worker-type ${employee.type === "Contractor" ? "contractor" : ""}`}
                                >
                                  {employee.type}
                                </span>
                              </td>
                            )}
                            <td>
                              <div className="row-actions">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  isIconOnly
                                  aria-label={`View ${employee.name}`}
                                  onPress={() => openEmployee("view", employee)}
                                >
                                  <Eye size={16} />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  isIconOnly
                                  aria-label={`Edit ${employee.name}`}
                                  onPress={() => openEmployee("edit", employee)}
                                >
                                  <Pencil size={15} />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  isIconOnly
                                  aria-label={`Delete ${employee.name}`}
                                  onPress={() =>
                                    openEmployee("delete", employee)
                                  }
                                >
                                  <Trash2 size={15} />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!visible.length && (
                      <div className="empty-state">
                        <Search size={24} />
                        <h3>No members found</h3>
                        <p>Try another name, email, or worker type.</p>
                        <Button
                          variant="secondary"
                          size="sm"
                          onPress={() => {
                            setQuery("");
                            setTypeFilter("all");
                          }}
                        >
                          Clear filters
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="table-footer">
                    <span>
                      {filtered.length
                        ? `${(currentPage - 1) * 6 + 1}–${Math.min(currentPage * 6, filtered.length)}`
                        : "0"}{" "}
                      of {filtered.length} members
                    </span>
                    <div>
                      <Button
                        size="sm"
                        variant="secondary"
                        isDisabled={currentPage === 1}
                        onPress={() => setPage(currentPage - 1)}
                      >
                        Previous
                      </Button>
                      <span>
                        Page {currentPage} of {pageCount}
                      </span>
                      <Button
                        size="sm"
                        variant="secondary"
                        isDisabled={currentPage === pageCount}
                        onPress={() => setPage(currentPage + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </section>
              )}
              {activePage === "orders" && (
                <Card className="secondary-page">
                  <div className="card-heading">
                    <h2>Recent orders</h2>
                    <Button size="sm" variant="secondary" onPress={download}>
                      Export report
                    </Button>
                  </div>
                  <p className="muted">Sample workspace orders</p>
                  <div className="orders-list">
                    {initialEmployees.slice(0, 6).map((employee, index) => (
                      <div key={employee.id}>
                        <span className="order-number">#{10028 - index}</span>
                        <div className="member">
                          <Avatar
                            avatar={employee.avatar}
                            name={employee.name}
                          />
                          <span>
                            <strong>{employee.name}</strong>
                            <small>{employee.email}</small>
                          </span>
                        </div>
                        <Chip
                          size="sm"
                          color={index === 2 ? "warning" : "success"}
                          variant="soft"
                        >
                          {index === 2 ? "Pending" : "Completed"}
                        </Chip>
                        <strong>
                          US${[149, 299, 79, 449, 199, 89][index]}.00
                        </strong>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
              {activePage === "tracker" && (
                <Card className="secondary-page">
                  <div className="card-heading">
                    <h2>Your team’s focus</h2>
                    <Chip size="sm" variant="soft">
                      {tasks.filter((task) => task.done).length}/{tasks.length}{" "}
                      completed
                    </Chip>
                  </div>
                  <p className="muted">Keep the small things moving.</p>
                  <div className="task-list">
                    {tasks.map((task, index) => (
                      <Checkbox
                        key={task.name}
                        isSelected={task.done}
                        onChange={(done) =>
                          setTasks((items) =>
                            items.map((item, i) =>
                              i === index ? { ...item, done } : item,
                            ),
                          )
                        }
                      >
                        <Checkbox.Content
                          className={task.done ? "task-done" : ""}
                        >
                          <Checkbox.Control>
                            <Checkbox.Indicator />
                          </Checkbox.Control>
                          {task.name}
                        </Checkbox.Content>
                      </Checkbox>
                    ))}
                  </div>
                </Card>
              )}
            </main>
          </div>
        </div>
      )}
      {dialog && (
        <Overlay title={dialogTitle} onClose={() => setDialog(null)}>
          {(dialog.kind === "invite" || dialog.kind === "edit") && (
            <form className="member-form" onSubmit={submitEmployee}>
              <p className="muted">
                {dialog.kind === "invite"
                  ? "Add a member to this local workspace. No invitation email will be sent."
                  : "Update this member’s workspace details."}
              </p>
              <label className="form-label">
                Full name
                <Input
                  autoFocus
                  value={formName}
                  onChange={(event) => setFormName(event.target.value)}
                  placeholder="e.g. Jordan Lee"
                  required
                />
              </label>
              <label className="form-label">
                Email
                <Input
                  type="email"
                  value={formEmail}
                  onChange={(event) => setFormEmail(event.target.value)}
                  placeholder="jordan@acme.com"
                  required
                />
              </label>
              <label className="form-label">
                Role
                <Input
                  value={formRole}
                  onChange={(event) => setFormRole(event.target.value)}
                  required
                />
              </label>
              <div>
                <span className="form-label">Worker type</span>
                <Tabs
                  selectedKey={formType}
                  onSelectionChange={(key) =>
                    setFormType(String(key) as "Employee" | "Contractor")
                  }
                >
                  <Tabs.List aria-label="Worker type">
                    {["Employee", "Contractor"].map((type) => (
                      <Tabs.Tab key={type} id={type}>
                        {type}
                        <Tabs.Indicator />
                      </Tabs.Tab>
                    ))}
                  </Tabs.List>
                </Tabs>
              </div>
              {formError && (
                <p role="alert" className="form-error">
                  {formError}
                </p>
              )}
              <div className="modal-form-actions">
                <Button variant="secondary" onPress={() => setDialog(null)}>
                  Cancel
                </Button>
                <Button type="submit">
                  {dialog.kind === "invite" ? (
                    <>
                      <Plus size={16} />
                      Add member
                    </>
                  ) : (
                    "Save changes"
                  )}
                </Button>
              </div>
            </form>
          )}
          {dialog.kind === "view" && (
            <div className="member-details">
              <Avatar
                name={dialog.employee.name}
                avatar={dialog.employee.avatar}
              />
              <h3>{dialog.employee.name}</h3>
              <p>{dialog.employee.role}</p>
              <dl>
                <div>
                  <dt>Email</dt>
                  <dd>{dialog.employee.email}</dd>
                </div>
                <div>
                  <dt>Worker ID</dt>
                  <dd>#{dialog.employee.id}</dd>
                </div>
                <div>
                  <dt>Worker type</dt>
                  <dd>{dialog.employee.type}</dd>
                </div>
              </dl>
              <Button
                variant="secondary"
                onPress={() => openEmployee("edit", dialog.employee)}
              >
                <Pencil size={15} />
                Edit member
              </Button>
            </div>
          )}
          {dialog.kind === "delete" && (
            <>
              <p className="muted">
                Remove <strong>{dialog.employee.name}</strong> from this local
                demo workspace? You can restore the sample data in Settings.
              </p>
              <div className="modal-form-actions">
                <Button variant="secondary" onPress={() => setDialog(null)}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  onPress={() => {
                    saveEmployees(
                      employees.filter(
                        (item) => item.id !== dialog.employee.id,
                      ),
                    );
                    setDialog(null);
                    notify("Member removed.");
                  }}
                >
                  Delete member
                </Button>
              </div>
            </>
          )}
          {dialog.kind === "search" && (
            <div className="workspace-search">
              <div className="table-search">
                <Search size={18} />
                <Input
                  autoFocus
                  aria-label="Search workspace"
                  placeholder="Search by name, email, or role..."
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <div className="search-results">
                {filtered.slice(0, 6).map((employee) => (
                  <button
                    key={employee.id}
                    onClick={() => openEmployee("view", employee)}
                  >
                    <Avatar name={employee.name} avatar={employee.avatar} />
                    <span>
                      <strong>{employee.name}</strong>
                      <small>{employee.role}</small>
                    </span>
                    <ArrowRight size={15} />
                  </button>
                ))}
                {!filtered.length && (
                  <p className="muted">No matching team members.</p>
                )}
              </div>
            </div>
          )}
          {dialog.kind === "notifications" && (
            <div className="notification-list">
              {[
                {
                  title: "Your monthly report is ready",
                  detail: "The September performance report is available.",
                  time: "5 min ago",
                },
                {
                  title: "Welcome to your workspace",
                  detail: "Explore your overview and meet the team.",
                  time: "1 hour ago",
                },
                {
                  title: "All systems operational",
                  detail: "Your local demo is ready to use.",
                  time: "Today",
                },
              ].map((item, index) => (
                <div key={item.title}>
                  <span className="notification-icon">
                    {index === 0 ? (
                      <ChartColumnIncreasing size={17} />
                    ) : index === 1 ? (
                      <UserPlus size={17} />
                    ) : (
                      <Check size={17} />
                    )}
                  </span>
                  <section>
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                    <small>{item.time}</small>
                  </section>
                </div>
              ))}
            </div>
          )}
          {dialog.kind === "settings" && (
            <div className="settings-content">
              <div className="member">
                <Avatar />
                <span>
                  <strong>Kate Moore</strong>
                  <small>{DEMO_EMAIL}</small>
                </span>
              </div>
              <div className="setting-row">
                <span>
                  <strong>Appearance</strong>
                  <small>Choose a comfortable workspace theme.</small>
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onPress={() => setDark(!dark)}
                >
                  {dark ? <Sun size={16} /> : <Moon size={16} />}{" "}
                  {dark ? "Light" : "Dark"}
                </Button>
              </div>
              <div className="setting-row">
                <span>
                  <strong>Demo data</strong>
                  <small>Restore the original 32 team members.</small>
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onPress={() => {
                    saveEmployees(initialEmployees);
                    setPage(1);
                    notify("Sample data restored.");
                  }}
                >
                  Reset data
                </Button>
              </div>
              <Button variant="secondary" onPress={logout}>
                <LogOut size={16} />
                Log out
              </Button>
            </div>
          )}
          {(dialog.kind === "help" || dialog.kind === "forgot") && (
            <div className="help-content">
              <img src="/favicon.svg" alt="" />
              <h3>
                {dialog.kind === "forgot"
                  ? "Your demo credentials"
                  : "Welcome to Hero workspace"}
              </h3>
              <p>
                This is a standalone frontend demo. Sign in with the account
                below; nothing is sent to a server.
              </p>
              <div className="credential-box">
                <span>
                  <Mail size={15} />
                  {DEMO_EMAIL}
                </span>
                <span>
                  Password: <code>{DEMO_PASSWORD}</code>
                </span>
              </div>
              {dialog.kind === "help" && (
                <p>
                  Use the tabs and date ranges to explore the charts. Search,
                  filter, edit, or invite team members, and download your
                  employee report. Changes stay in this browser.
                </p>
              )}
            </div>
          )}
        </Overlay>
      )}
      {toast && (
        <div role="status" className="toast">
          <span>
            <Check size={16} />
          </span>
          {toast}
          <button
            onClick={() => setToast("")}
            aria-label="Dismiss notification"
          >
            <X size={15} />
          </button>
        </div>
      )}
    </>
  );
}
