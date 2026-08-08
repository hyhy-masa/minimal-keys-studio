/**
 * 長押し設定の項目名を日本語にする。
 *
 * ファームウェアが返してくるのは device tree のノード名（`layer_tap` 等の英字）
 * そのままで、顧客には「どのキーの設定なのか」が分からない。実際に、どれが
 * スクロールの設定か画面から特定できなかった。
 *
 * ここで日本語に置き換える。**知らない名前はそのまま英字で出す**ので、
 * ファームウェアだけ先に新しくなって項目が増えても、画面が空にならない。
 *
 * 対応表の根拠は config/minimal-keys.keymap（minimal-keys-farmware-private）の
 * 実際の割り当て。キーマップを変えたらここも直す。
 */

export interface HoldTapLabel {
  /** 画面に出す名前 */
  name: string;
  /** どのキーに効くかの説明。未知の項目には付かない */
  description?: string;
  /**
   * 画面に出さない。
   *
   * ファームウェアの device tree にはあるが、キーマップのどこからも使われて
   * いない項目に付ける。触っても何も起きないつまみを顧客に見せないため。
   *
   * ★ファームウェア側から定義を消すのではなく、ここで隠す理由:
   * 設定の保存キーが ht/dN ＝ device tree の並び順の番号なので、定義を消すと
   * 番号が繰り上がり、顧客が保存済みの値が別の項目に当たる。隠すだけなら
   * 番号は動かない。
   */
  hidden?: boolean;
}

const LABELS: Record<string, HoldTapLabel> = {
  // &lt 1 SPACE / &lt 1 DEL
  // ※ &lt 3 ENTER（スクロール）は lt_scroll として分離済みの前提。
  //    分離前のファームウェアではスクロールもこの項目に含まれる。
  layer_tap: {
    name: "スペース / Delete",
    description: "スペースと Delete を長押ししたときのレイヤー切り替え",
  },
  // &mt LEFT_COMMAND LANG2 / &mt LEFT_SHIFT ASTRK
  mod_tap: {
    name: "⌘ / Shift",
    description: "⌘（英数かな）と Shift（*）を長押ししたときの切り替え",
  },
  // &lt_rep 2 BACKSPACE
  lt_rep: {
    name: "BackSpace",
    description: "BackSpace を長押ししたときのレイヤー切り替え",
  },
  // &lt_scroll 3 ENTER
  lt_scroll: {
    name: "スクロール",
    description: "Enter を長押ししてスクロールに切り替わるまでの時間",
  },
  // 定義だけあってキーマップのどこからも参照されていない（&lt_to_layer_0 の
  // 参照は 0 件）。触っても何も起きないつまみなので画面には出さない。
  // 消さずに隠すのは hidden の説明のとおり（番号がずれるため）。
  lt_to_layer_0: {
    name: "（未使用）",
    description: "今のキー配列では使われていません",
    hidden: true,
  },
};

/** 画面に出す項目か。ファームウェアにあっても使われていないものは出さない */
export function isHoldTapVisible(nodeName: string): boolean {
  return !holdTapLabel(nodeName).hidden;
}

/**
 * ファームウェアが返したノード名から、画面に出す名前を引く。
 * 対応表に無ければノード名をそのまま返す。
 */
export function holdTapLabel(nodeName: string): HoldTapLabel {
  return LABELS[nodeName] ?? { name: nodeName };
}
