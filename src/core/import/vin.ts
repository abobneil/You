// Vehicle details from a VIN, using the US government's free decoder (NHTSA vPIC).
// No account or key. It's the only import that goes over the network, so the app asks first.
import { tidyCase } from './parse';

export const VIN_SERVICE = 'NHTSA (vpic.nhtsa.dot.gov)';

export interface VinInfo { year: string; make: string; model: string; trim: string; fuel: string }

/** Turns vPIC's DecodeVinValues answer into vehicle details. */
export function readVinResponse(json: any): VinInfo | null {
  const r = json?.Results?.[0];
  if (!r || !r.Make || !r.Model || !/^\d{4}$/.test(String(r.ModelYear)) || (r.ErrorCode && !/^0(?:,|$)/.test(String(r.ErrorCode)))) return null;
  const electrified = String(r.ElectrificationLevel ?? '');
  const fuelPrimary = String(r.FuelTypePrimary ?? '');
  const fuel = /PHEV|plug-in/i.test(electrified) ? 'Plug-in hybrid'
    : /BEV|battery electric/i.test(electrified) || /^electric/i.test(fuelPrimary) ? 'Electric'
    : /HEV|hybrid/i.test(electrified) ? 'Hybrid'
    : /diesel/i.test(fuelPrimary) ? 'Diesel'
    : /gasoline/i.test(fuelPrimary) ? 'Gas' : '';
  return { year: String(r.ModelYear ?? ''), make: tidyCase(String(r.Make)), model: String(r.Model ?? ''), trim: String(r.Trim ?? r.Series ?? ''), fuel };
}

export async function lookupVin(vin: string): Promise<VinInfo | null> {
  if (!/^[A-HJ-NPR-Z0-9]{17}$/i.test(vin)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`, { signal: controller.signal });
    if (!res.ok) throw new Error('lookup failed');
    return readVinResponse(await res.json());
  } finally { clearTimeout(timer); }
}
