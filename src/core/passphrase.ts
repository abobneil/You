/** Local guidance, without storing or sending the phrase. */
export function passphraseStrength(value: string): 'Weak' | 'Good' | 'Strong' {
 const v = value.toLowerCase();
 if (value.length < 10 || /^(password|letmein|welcome|qwerty|admin|123456|iloveyou|abc123)/.test(v) || /(.)\1{4}/.test(v) || /^(?:0123456789|1234567890|abcdefghijklmnopqrstuvwxyz)/.test(v) || new Set(v).size < 5) return 'Weak';
 const variety = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-z0-9]/i].filter(r => r.test(value)).length;
 return value.length >= 20 || (value.length >= 15 && variety >= 2) ? 'Strong' : 'Good';
}
