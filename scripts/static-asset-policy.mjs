// Only build-listed, content-verified versioned bytes get immutable caching.
// HTML, metadata, raw legacy module paths and documents remain no-store.
import {createHash} from 'node:crypto';
export function staticAssetPolicy(relative,bytes,manifest){
 if(!/^assets\/[a-f0-9]{64}[-.]/.test(relative)||!manifest?.files||!Object.hasOwn(manifest.files,relative))return'no-store';
 const expected=manifest.files[relative];
 if(!/^[a-f0-9]{64}$/.test(expected)||createHash('sha256').update(bytes).digest('hex')!==expected)throw Error('Versioned asset integrity mismatch');
 return'public, max-age=31536000, immutable';
}
export function parseAssetManifest(text){
 const manifest=JSON.parse(text);
 if(manifest.version!==1||!/^[a-f0-9]{64}$/.test(manifest.app)||!manifest.files||Array.isArray(manifest.files))throw Error('Invalid asset manifest');
 return manifest;
}
