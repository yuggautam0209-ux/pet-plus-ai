import { NextResponse } from "next/server";
import { getClientIp, isRateLimited } from "@/lib/security/rateLimit";
import { roundLocationForPrivacy } from "@/lib/security/privacy";

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const r = 6371;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s1 = Math.sin(dLat / 2) ** 2;
  const s2 = Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(s1 + s2));
}

export async function GET(request: Request) {
  const ip = getClientIp(request);
  const limit = isRateLimited(`nearby-vets:${ip}`, 25, 60_000);
  if (limit.limited) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many location requests. Please retry shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
    );
  }
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json({ error: "invalid_location", message: "Provide valid lat/lng query params." }, { status: 400 });
  }

  const mapsKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!mapsKey) {
    return NextResponse.json(
      {
        error: "not_configured",
        message: "Add GOOGLE_MAPS_API_KEY to .env.local for nearby vet store lookup.",
      },
      { status: 503 }
    );
  }

  const safeLat = roundLocationForPrivacy(lat, 3);
  const safeLng = roundLocationForPrivacy(lng, 3);

  const url = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json");
  url.searchParams.set("key", mapsKey);
  // Use coarse coordinates to reduce precise-location exposure to third-party APIs.
  url.searchParams.set("location", `${safeLat},${safeLng}`);
  url.searchParams.set("radius", "7000");
  url.searchParams.set("keyword", "veterinary clinic");
  url.searchParams.set("type", "veterinary_care");

  let upstream: Response;
  try {
    upstream = await fetch(url.toString(), { next: { revalidate: 0 } });
  } catch {
    return NextResponse.json({ error: "network_error", message: "Google Maps request failed." }, { status: 502 });
  }

  if (!upstream.ok) {
    return NextResponse.json({ error: "google_maps_api_error", status: upstream.status }, { status: 502 });
  }

  const data = (await upstream.json()) as {
    results?: {
      name?: string;
      vicinity?: string;
      rating?: number;
      geometry?: { location?: { lat?: number; lng?: number } };
    }[];
  };

  const items = (data.results ?? []).slice(0, 12).map((item) => {
    const pLat = Number(item.geometry?.location?.lat);
    const pLng = Number(item.geometry?.location?.lng);
    const distanceKm =
      Number.isFinite(pLat) && Number.isFinite(pLng) ? haversineKm(safeLat, safeLng, pLat, pLng) : undefined;
    return {
      name: String(item.name ?? "Vet clinic"),
      address: String(item.vicinity ?? "Address not available"),
      rating: typeof item.rating === "number" ? item.rating : undefined,
      distanceKm,
    };
  });

  return NextResponse.json({ items });
}

