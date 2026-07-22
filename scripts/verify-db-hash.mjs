#!/usr/bin/env node
const encoder = new TextEncoder();
const utf8 = v => encoder.encode(v);
const b64 = b => { let s=''; for(const x of b) { s+=String.fromCodePoint(x); } return btoa(s); };
const b64ToBytes = v => { const s=atob(v); const b=new Uint8Array(s.length); for(let i=0;i<s.length;i++) { b[i]=s.codePointAt(i)??0; } return b; };

async function derive(pwd, salt, pep='') {
  const k = await crypto.subtle.importKey('raw', utf8(`${pwd}\u0000${pep}`), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2', hash:'SHA-256', salt, iterations:100000}, k, 256));
}

const dbHash = 'pbkdf2-sha256$100000$x798XmxiUfIFW+3Di0zJAA==$vJcZ1g0oCRiTGGHEqmj2MqmBkMR3KpKjBN8MlrWHHrQ=';
const parts = dbHash.split('$');

console.log('DB hash parts:');
console.log('  Format:', parts[0]);
console.log('  Iterations:', parts[1]);
console.log('  Salt:', parts[2]);
console.log('  Expected hash:', parts[3]);

const actual = await derive('Ledjer123', b64ToBytes(parts[2]), '');
const actualB64 = b64(actual);
console.log('  Derived hash: ', actualB64);
console.log('  Match:', actualB64 === parts[3] ? '✅ PASS' : '❌ FAIL');

// Test with various pepper values
for (const pep of ['', undefined, 'test-pepper']) {
  const a = await derive('Ledjer123', b64ToBytes(parts[2]), pep ?? '');
  console.log(`  With pepper "${pep}": ${b64(a) === parts[3] ? '✅' : '❌'}`);
}
