import type {HwpDocument} from '../../development/core/rhwp.js';
import {checkedExternalSibling,hasCheckedExternalOpen} from '../core-runtime.js';
import type {HostOpenGate} from './open.js';

// No origin can opt into native admission without an actually loaded,
// source-reviewed, hash-bound B gate. There is no ordinary parser fallback.
export function configuredHostOpenGate(source:HwpDocument):HostOpenGate|undefined{
 if(!['127.0.0.1','localhost','[::1]'].includes(location.hostname)||!hasCheckedExternalOpen(source))return;
 return {
  formats:['hwp','hwpx'],
  async inspect(current,bytes,format){return {format,document:checkedExternalSibling(current,new Uint8Array(bytes),format)}},
 };
}
