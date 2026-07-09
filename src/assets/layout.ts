/**
 * 筐体画像(cabinet_frame.webp)内のはめ込み領域の座標定義。
 *
 * 座標は元画像(1596x2688 px)のピクセル値。入稿画像のマーカー矩形
 * (水色=液晶エリア、ピンク=リール窓)を scripts/import_cabinet.py で検出した値。
 * 筐体画像を差し替えたら同スクリプトを再実行して本ファイルを更新すること。
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 筐体画像の natural サイズ */
export const CABINET_SIZE = { w: 1596, h: 2688 } as const;

/** 液晶画面のはめ込み位置(水色マーカー) */
export const LCD_RECT: Rect = { x: 116, y: 80, w: 1369, h: 768 };

/** リール窓のはめ込み位置(ピンクマーカー)。左・中・右の順 */
export const REEL_WINDOW_RECTS: readonly [Rect, Rect, Rect] = [
  { x: 378, y: 961, w: 245, h: 367 },
  { x: 674, y: 969, w: 246, h: 358 },
  { x: 970, y: 969, w: 245, h: 359 },
];

/** CSS の % 配置用に矩形を筐体サイズ比へ変換する */
export function rectToPercent(rect: Rect): {
  left: string;
  top: string;
  width: string;
  height: string;
} {
  return {
    left: `${(rect.x / CABINET_SIZE.w) * 100}%`,
    top: `${(rect.y / CABINET_SIZE.h) * 100}%`,
    width: `${(rect.w / CABINET_SIZE.w) * 100}%`,
    height: `${(rect.h / CABINET_SIZE.h) * 100}%`,
  };
}
