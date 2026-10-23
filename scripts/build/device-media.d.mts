/* device-media.mjs의 타입(vite.config.ts · 시험이 불러 쓴다) */
import type { PluginCreator } from 'postcss';
export const REFERENCE: Record<'pc' | 'tablet-l' | 'tablet-p' | 'phone', [number, number]>;
export function splitQuery(params: string): { devices: string[]; rest: string } | null;
export function prefixSelector(sel: string, devices: string[]): string;
export function convertUnits(value: string): string;
declare const deviceMedia: PluginCreator<void>;
export default deviceMedia;
