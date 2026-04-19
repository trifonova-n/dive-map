const BASE = "/api";
const AUTH = "/auth";

let token: string | null = null;

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

export function setToken(t: string | null): void {
  token = t;
  if (t) localStorage.setItem("divemap_token", t);
  else localStorage.removeItem("divemap_token");
}

export function getToken(): string | null {
  if (!token) token = localStorage.getItem("divemap_token");
  return token;
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

// --- Auth ---

export async function register(
  email: string,
  password: string
): Promise<string> {
  const res = await fetch(`${AUTH}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Register failed (${res.status})`);
  }
  const data = await res.json();
  setToken(data.access_token);
  return data.access_token;
}

export async function login(
  email: string,
  password: string
): Promise<string> {
  const res = await fetch(`${AUTH}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Login failed (${res.status})`);
  }
  const data = await res.json();
  setToken(data.access_token);
  return data.access_token;
}

export function logout(): void {
  setToken(null);
}

// --- Site config ---

export interface SiteConfigAPI {
  id: number;
  name: string;
  mag_declination: number;
  crs_proj4: string;
  z_scale: number;
  base_extent: Record<string, number> | null;
}

export async function getSiteConfig(siteId: number): Promise<SiteConfigAPI> {
  const res = await fetch(`${BASE}/sites/${siteId}/config`);
  if (!res.ok) throw new Error(`Site config failed (${res.status})`);
  return res.json();
}

// --- Dive plans ---

export interface DivePlanAPI {
  id: number;
  user_id: number;
  site_id: number;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface WaypointAPI {
  id: number;
  plan_id: number;
  seq: number;
  latitude: number;
  longitude: number;
  depth_m: number;
}

export interface DivePlanDetailAPI extends DivePlanAPI {
  waypoints: WaypointAPI[];
}

export async function listPlans(): Promise<DivePlanAPI[]> {
  const res = await fetch(`${BASE}/plans/`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`List plans failed (${res.status})`);
  return res.json();
}

export async function createPlan(
  siteId: number,
  name: string
): Promise<DivePlanAPI> {
  const res = await fetch(`${BASE}/plans/`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ site_id: siteId, name }),
  });
  if (!res.ok) throw new Error(`Create plan failed (${res.status})`);
  return res.json();
}

export async function getPlan(planId: number): Promise<DivePlanDetailAPI> {
  const res = await fetch(`${BASE}/plans/${planId}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Get plan failed (${res.status})`);
  return res.json();
}

export async function deletePlan(planId: number): Promise<void> {
  const res = await fetch(`${BASE}/plans/${planId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Delete plan failed (${res.status})`);
}

export async function saveWaypoints(
  planId: number,
  waypoints: Array<{ seq: number; latitude: number; longitude: number; depth_m: number }>
): Promise<WaypointAPI[]> {
  const res = await fetch(`${BASE}/plans/${planId}/waypoints/`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({ waypoints }),
  });
  if (!res.ok) throw new Error(`Save waypoints failed (${res.status})`);
  return res.json();
}
