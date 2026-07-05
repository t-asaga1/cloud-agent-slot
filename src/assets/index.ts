/**
 * 素材の参照は必ずこのモジュールの ID 経由で行う(docs/ASSET_GUIDELINES.md 4. 参照)。
 * Vite の import で解決させるため、ビルド時にファイル欠落が検出できる。
 */
import cabinetFrameUrl from './images/cabinet/cabinet_frame.webp';
import cabinetLayout from './cabinet_layout.json';

export const ASSETS = {
  /** 筐体フレーム(液晶・リール窓部分は透過抜き済み) */
  cabinetFrame: cabinetFrameUrl,
} as const;

/** 筐体画像内の液晶エリア・リール窓のはめ込み座標(scripts/intake_cabinet.py が生成) */
export { cabinetLayout };

export interface LayoutRect {
  name: string;
  px: { x: number; y: number; width: number; height: number };
  ratio: { x: number; y: number; width: number; height: number };
}
