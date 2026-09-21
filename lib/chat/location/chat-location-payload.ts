import type { MessageType } from '@/components/chat/types';
import {
  GOOGLE_MAPS_MAP_ID,
  GOOGLE_MAPS_WEB_API_KEY,
  LOCATION_LIVE_PREFIX,
  LOCATION_TEXT_PREFIX,
} from '@/constants/chat';

export type PlaceSuggestion = {
  id: string;
  primary: string;
  secondary?: string | null;
};

export type PlaceResult = {
  id: string;
  name: string;
  address?: string | null;
  lat: number;
  lng: number;
};

export const buildMapsLink = (lat: number, lng: number) =>
  `https://maps.google.com/?q=${lat},${lng}`;

const parseCoordsFromMapsUrl = (url?: string | null) => {
  if (!url) return null;
  const match = url.match(/q=([-0-9.]+),([-0-9.]+)/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng };
};

export const getStaticMapUrl = (lat: number, lng: number) => {
  if (!GOOGLE_MAPS_WEB_API_KEY) return null;
  const base = 'https://maps.googleapis.com/maps/api/staticmap';
  const center = `${lat},${lng}`;
  const marker = `color:0x0ea5a0|${center}`;
  const mapId = GOOGLE_MAPS_MAP_ID ? `&map_id=${encodeURIComponent(GOOGLE_MAPS_MAP_ID)}` : '';
  return `${base}?center=${center}&zoom=15&size=640x360&scale=2&markers=${encodeURIComponent(marker)}&key=${GOOGLE_MAPS_WEB_API_KEY}${mapId}`;
};

const parseCoordsLine = (value?: string | null) => {
  if (!value) return null;
  const match = value.match(/(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng };
};

export const parseLocationMessage = (rawText: string): MessageType['location'] | null => {
  const lines = rawText.split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  const first = lines[0] ?? '';
  const isLive = first.startsWith(LOCATION_LIVE_PREFIX);
  const isPinned = first.startsWith(LOCATION_TEXT_PREFIX);
  if (!isLive && !isPinned) return null;

  let label = '';
  let address = '';
  let coordsLine = '';
  let mapLink = '';
  let expiresAt: Date | null = null;

  if (isLive) {
    const rawExpiry = first.slice(LOCATION_LIVE_PREFIX.length).trim();
    if (rawExpiry) {
      const parsed = new Date(rawExpiry);
      if (!Number.isNaN(parsed.getTime())) expiresAt = parsed;
    }
    coordsLine = lines[1] ?? '';
    label = lines[2] ?? '';
    address = lines[3] ?? '';
    mapLink = lines.find((line) => line.includes('maps.google.com') || line.startsWith('http')) ?? '';
  } else {
    label = first.replace(LOCATION_TEXT_PREFIX, '').trim();
    coordsLine = lines[1] ?? '';
    mapLink = lines.find((line) => line.includes('maps.google.com') || line.startsWith('http')) ?? '';
    if (lines.length > 2 && lines[2] !== mapLink) address = lines[2];
  }

  const coords = parseCoordsLine(coordsLine) ?? parseCoordsFromMapsUrl(mapLink);
  if (!coords) return null;
  const resolvedLabel = label || address || `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`;
  const mapUrl = getStaticMapUrl(coords.lat, coords.lng);
  return {
    lat: coords.lat,
    lng: coords.lng,
    label: resolvedLabel,
    address: address || undefined,
    mapUrl: mapUrl || undefined,
    mapLink: mapLink || buildMapsLink(coords.lat, coords.lng),
    live: isLive,
    expiresAt,
  };
};

export const buildLocationMessageText = ({
  lat,
  lng,
  label,
  address,
  live,
  expiresAt,
}: {
  lat: number;
  lng: number;
  label: string;
  address?: string | null;
  live?: boolean;
  expiresAt?: Date | null;
}) => {
  const safeLabel = label?.trim() || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  const mapLink = buildMapsLink(lat, lng);
  if (live && expiresAt) {
    return [
      `${LOCATION_LIVE_PREFIX}${expiresAt.toISOString()}`,
      `${lat},${lng}`,
      safeLabel,
      address?.trim() || '',
      mapLink,
    ].filter(Boolean).join('\n');
  }
  return [
    `${LOCATION_TEXT_PREFIX} ${safeLabel}`,
    `${lat},${lng}`,
    address?.trim() || '',
    mapLink,
  ].filter(Boolean).join('\n');
};
