import { kindOf } from './areas';
import type { Card } from './types';
export function sensitiveDetail(c: Card, id: string): boolean {
 return !!kindOf(c.area, c.kind).fields?.find(f => f.id === id)?.sensitive || (!!kindOf(c.area, c.kind).sensitive && /number|account|member|policy|vin|ssn|password|passport|(^|[^a-z])id($|[^a-z])/i.test(id));
}
