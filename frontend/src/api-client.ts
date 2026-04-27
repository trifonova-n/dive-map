const BASE = "/api";
const AUTH = "/auth";

let token: string | null = null;

export interface UserAPI {
  id: number;
  email: string;
  is_admin: boolean;
}

let currentUser: UserAPI | null = null;

export function getCurrentUser(): UserAPI | null {
  return currentUser;
}

export function isAdmin(): boolean {
  return !!currentUser?.is_admin;
}

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

async function extractError(res: Response, fallback: string): Promise<string> {
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    return fallback;
  }
  const detail = body?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0];
    const loc = Array.isArray(first?.loc) ? first.loc : [];
    const field = loc[loc.length - 1];
    const msg = typeof first?.msg === "string" ? first.msg : "is invalid";
    if (field === "email") return "Please enter a valid email address.";
    if (field === "password") return `Password ${msg}.`;
    return field ? `${field}: ${msg}` : msg;
  }
  return fallback;
}

export async function register(
  email: string,
  password: string
): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${AUTH}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    throw new Error("Can't reach the server. Check your connection and try again.");
  }
  if (!res.ok) {
    if (res.status === 409) {
      throw new Error(
        "An account with this email already exists. Try logging in instead."
      );
    }
    throw new Error(
      await extractError(res, `Registration failed (${res.status}).`)
    );
  }
  const data = await res.json();
  setToken(data.access_token);
  await fetchMe().catch(() => undefined);
  return data.access_token;
}

export async function login(
  email: string,
  password: string
): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${AUTH}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    throw new Error("Can't reach the server. Check your connection and try again.");
  }
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("Incorrect email or password.");
    }
    throw new Error(await extractError(res, `Login failed (${res.status}).`));
  }
  const data = await res.json();
  setToken(data.access_token);
  await fetchMe().catch(() => undefined);
  return data.access_token;
}

export function logout(): void {
  setToken(null);
  currentUser = null;
}

export async function fetchMe(): Promise<UserAPI | null> {
  if (!getToken()) {
    currentUser = null;
    return null;
  }
  const res = await fetch(`${AUTH}/me`, { headers: authHeaders() });
  if (res.status === 401 || res.status === 403) {
    setToken(null);
    currentUser = null;
    return null;
  }
  if (!res.ok) throw new Error(`Fetch user failed (${res.status})`);
  currentUser = (await res.json()) as UserAPI;
  return currentUser;
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

// --- Landmarks ---

export interface LandmarkAPI {
  id: number;
  site_id: number;
  user_id: number | null;
  name: string;
  latitude: number;
  longitude: number;
  depth_m: number | null;
  description: string | null;
  image_url: string | null;
}

export interface LandmarkCreateBody {
  name: string;
  latitude: number;
  longitude: number;
  depth_m: number | null;
  description?: string | null;
  image_url?: string | null;
}

export interface LandmarkUpdateBody {
  name?: string;
  description?: string | null;
  image_url?: string | null;
}

export async function getLandmarks(siteId: number): Promise<LandmarkAPI[]> {
  const res = await fetch(`${BASE}/sites/${siteId}/landmarks`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Landmarks failed (${res.status})`);
  return res.json();
}

export async function createLandmark(
  siteId: number,
  body: LandmarkCreateBody
): Promise<LandmarkAPI> {
  const res = await fetch(`${BASE}/sites/${siteId}/landmarks`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await extractError(res, `Create landmark failed (${res.status}).`));
  }
  return res.json();
}

export async function updateLandmark(
  landmarkId: number,
  body: LandmarkUpdateBody
): Promise<LandmarkAPI> {
  const res = await fetch(`${BASE}/landmarks/${landmarkId}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await extractError(res, `Update landmark failed (${res.status}).`));
  }
  return res.json();
}

export async function deleteLandmark(landmarkId: number): Promise<void> {
  const res = await fetch(`${BASE}/landmarks/${landmarkId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(await extractError(res, `Delete landmark failed (${res.status}).`));
  }
}

// Multipart upload — does NOT use authHeaders() because the browser must set
// the Content-Type (with boundary) itself.
export async function uploadLandmarkImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const headers: Record<string, string> = {};
  const t = getToken();
  if (t) headers["Authorization"] = `Bearer ${t}`;
  const res = await fetch(`${BASE}/uploads/landmark-image`, {
    method: "POST",
    headers,
    body: fd,
  });
  if (!res.ok) {
    throw new Error(await extractError(res, `Image upload failed (${res.status}).`));
  }
  const data = await res.json();
  return data.url as string;
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
