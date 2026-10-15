export type Employee = {
  id: string;
  name: string;
  email: string;
  role: string;
  type: "Employee" | "Contractor";
  avatar: string;
};
export const initialEmployees: Employee[] = [
  {
    id: "4586936",
    name: "Alex Turner",
    email: "alex@acme.com",
    role: "Product Manager",
    type: "Employee",
    avatar: "indigo",
  },
  {
    id: "4586937",
    name: "Emma Davis",
    email: "emma@acme.com",
    role: "Senior Designer",
    type: "Employee",
    avatar: "rose",
  },
  {
    id: "4586933",
    name: "John Smith",
    email: "john@acme.com",
    role: "Chief Technology Officer",
    type: "Employee",
    avatar: "sky",
  },
  {
    id: "4586932",
    name: "Kate Moore",
    email: "kate@acme.com",
    role: "Chief Executive Officer",
    type: "Employee",
    avatar: "blue-light",
  },
  {
    id: "4586935",
    name: "Mike Wilson",
    email: "mike@acme.com",
    role: "VP of Engineering",
    type: "Employee",
    avatar: "green-dark",
  },
  {
    id: "4586934",
    name: "Sara Johnson",
    email: "sara@acme.com",
    role: "Chief Marketing Officer",
    type: "Employee",
    avatar: "emerald",
  },
  ...Array.from({ length: 26 }, (_, i) => ({
    id: String(4586938 + i),
    name:
      [
        "Oliver Bennett",
        "Sophia Chen",
        "Liam Parker",
        "Ava Williams",
        "Noah Garcia",
        "Isabella Martin",
        "Elijah Brown",
        "Mia Anderson",
        "James Taylor",
        "Charlotte Lee",
        "Lucas White",
        "Amelia Thomas",
        "Mason Harris",
      ][i % 13] + (i >= 13 ? " Jr." : ""),
    email: `team${i + 1}@acme.com`,
    role: [
      "Software Engineer",
      "Product Designer",
      "Marketing Specialist",
      "Customer Success",
    ][i % 4],
    type: i % 5 === 0 ? ("Contractor" as const) : ("Employee" as const),
    avatar: ["indigo", "rose", "sky", "green-dark", "emerald"][i % 5],
  })),
];
export const monthLabels = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
export const salesData = [30, 53, 35, 17, 44, 24, 26, 31, 7, 44, 38, 32];
export const trafficOrganic = [
  2000, 15000, 8000, 14000, 15000, 8000, 18000, 18000, 20000, 17000, 22000,
  15000,
];
export const trafficPaid = [
  1000, 10000, 12000, 14000, 8000, 9000, 12000, 10000, 5000, 12000, 18000, 9000,
];
export const DEMO_EMAIL = "kate@acme.com";
export const DEMO_PASSWORD = "heroui123";
export const SESSION_KEY = "hero.demo.session";
export const EMPLOYEES_KEY = "hero.demo.employees";

export function readSession(): string | null {
  try {
    const value =
      sessionStorage.getItem(SESSION_KEY) ?? localStorage.getItem(SESSION_KEY);
    if (!value) return null;
    const data = JSON.parse(value);
    return typeof data.email === "string" && data.email === DEMO_EMAIL
      ? data.email
      : null;
  } catch {
    return null;
  }
}
export function readEmployees(): Employee[] {
  try {
    const value = JSON.parse(localStorage.getItem(EMPLOYEES_KEY) ?? "null");
    if (
      Array.isArray(value) &&
      value.every(
        (item) =>
          item &&
          typeof item.id === "string" &&
          typeof item.name === "string" &&
          typeof item.email === "string" &&
          typeof item.role === "string" &&
          (item.type === "Employee" || item.type === "Contractor") &&
          [
            "indigo",
            "rose",
            "sky",
            "blue-light",
            "green-dark",
            "emerald",
          ].includes(item.avatar),
      )
    )
      return value;
  } catch {
    /* A cleared or invalid demo store starts with fixtures. */
  }
  return initialEmployees;
}
