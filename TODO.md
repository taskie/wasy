# TODO

Phase 1〜5 (examples 統合 / 自動テスト / oxlint / 構造改善 / ドキュメント) およびそれ以降の差分は `CHANGELOG.md` の `[Unreleased]` を参照。ここでは持ち越しの判断保留と、今後やりたい項目だけを残す。

## 本質的課題

- **音色が oscillator + 1 段フィルタのみ**: GM 128 を表現するには根本的に表現力不足。`SimpleOscillatorPatch` / `NoisePatch` を増やしても限界がある。本筋は SoundFont (SF2) / DLS サポート。`AudioBuffer` でのサンプル再生 + SF2 ジェネレータ (LFO / バイクワッドフィルタ / ボリュームエンベロープ) を解釈する `SoundFontPatch` を追加する。実装コスト大だが GM 互換シンセを名乗るには避けて通れない。

- **Worker 境界のイベント重複ディスパッチを暗黙の規約で凌いでいる**: `Player` (Worker) は非 ChannelEvent を 16 ch すべてにブロードキャストし、`SmfPlayer` は「ch 0 のバケットだけを購読する」という暗黙ルールでデデュープしている (`smf-player.ts:175 / 203`)。Worker 側のロジックが変わると外部購読者に多重通知が漏れる。Worker 出力を `{ channelEvents: Event[][16], commonEvents: Event[] }` のように分けて返す設計に直し、main 側で改めて配信させる。構造化複製のコスト軽減も兼ねる。先行して `src/player/messages.ts` に `ClientMessage` / `WorkerMessage` の discriminated union を切り、`event.data.type` の string switch を型付けに置き換えるのが前提整備。

- **統合テストの不在 (`SynthEngine` / `Wasy` ラウンドトリップ)**: 単体テスト (NotePool / Timer / createPlayer / sustain / isDrumChannel / OneShot expired) は揃ったが、最大の故障点である「main ↔ Worker のメッセージング (init / read / seek / load / unload)」と「`SynthEngine.receiveEvent` の 16 ch ルーティング」は未検証。Worker stub + jsdom + 偽 AudioContext で `new Wasy(ctx, dest, smfBuffer).play()` から `onTimedEvent` までを通す `tests/wasy.test.ts` を立てる。Worker メッセージ型整備 (上記) 後の方が書きやすい。

- **`GainedOscillatorPatch` / `GainedNoisePatch` (ramp + !oneShot) の整理**: GM 128 melodic 既定パッチ (`gmPatches`) は全エントリ ADSR に移行したため、`compileTone` の `oscillator|noise + ramp + !oneShot` 経路は外部利用者が `ToneDefinition` で `ramp` 包絡を与えたときにしか到達しない。decayTime / sustainLevel への翻訳ができれば envelope の二重実装 (ramp 専用クラス vs ADSR) を解消できる。利用実績がほぼないため優先度低。

- **`NoisePatch` の `fixedFrequency` 非対応**: `compile.ts` で `noise + adsr` は `NoisePatch` に振られるが、同クラスはトラッキング (noteNumber+24) のみで `filterFrequency.fixed` を無視する。結果として「持続するノイズで固定の filter 周波数」は ramp 包絡 (`GainedNoisePatch`) を選ぶしか書けない。`NoisePatch` に `fixedFrequency` 引数を足して `GainedNoisePatch` と挙動を揃えれば、`ToneDefinition` の `noise + adsr + filterFrequency.fixed` を表現できるようになる。

- **`adsr + oneShot` の組み合わせ**: 現状 `compile.ts` は `throw` でガードしている。one-shot ADSR (NoteOff 不要のキュー型ボイス) を表現したくなったら、`OneShotOscillatorPatch` / `OneShotNoisePatch` 側に attack ramp + decay-to-sustain ramp + 自動 release を組み込む経路が必要。GM 128 / DrumKit 既定では使わないので保留。

- **CC 5 Portamento Time / CC 65 Portamento On-Off**: モノフォニックスライドの実装が大きいため別タスクとして据え置き。

- **GM2 / XG の SysEx (Reverb Type / Chorus Type / Time / Depth など) で IR / LFO 設定を切り替える経路**: `SynthEngine` の Reverb / Chorus は固定パラメータのみ。SysEx で IR / LFO 設定を差し替えるには engine 側にプリセットテーブルを持たせる。

- **GS / XG パート設定 (Use For Rhythm Part など) の SysEx**: GS/XG リセットの認識は入ったが、part-mode 切替などの本格的設定は未対応。

## 内部構造リファクタリング

(本質的課題の前に、コードベース整理として実施したい段階的タスク)

- **Phase 1 — 即時クリーンアップ**:
    - `player-worker.ts:43-45` の dead な `case "resolution"` と `smf-player.ts:154-161` の対応する受信ハンドラを削除 (現在の main 側は `songInfo` 経由で resolution を受け取るため未使用)
    - `cancelAndHoldAtTime` フォールバックパターン (現状 `synth/patch.ts:71-76` / `synth.ts:185-191` / `synth.ts:254-260` の 3 箇所コピペ) を `Patch` 静的ヘルパに集約
- **Phase 2 — `synth.ts` 分割の残作業**: データ駆動化の流れで `synth/generate-patch.ts` / `synth/types.ts` / `synth/compile.ts` / `synth/patches/*` は分離済み。残るはクラス階層 (`SimpleOscillatorPatch` / `GainedOscillatorPatch` / `OneShotOscillatorPatch` / `NoisePatch` / `GainedNoisePatch` / `OneShotNoisePatch` / `DrumKitPatch`) を `synth/oscillator-patch.ts` / `synth/noise-patch.ts` / `synth/drum-kit.ts` に切り出すこと。`synth.ts` は re-export のみで公開 API 維持。
- **Phase 3 — `smf-analyze.ts` (289 行) 分割**: `smf-analyze/{notes,metadata,tempo,time-signature,format,song-info}.ts` に分け、`smf-analyze.ts` は re-export
- **Phase 7 候補 — `Instrument` (583 行) の分割**: `ChannelControllers` (CC dispatch + RPN/NRPN state machine) と `SustainPedalState` (deferred NoteOffs) を抽出。最もテスト網のかかったクラスのため、分割の利益とコストを天秤にかけてから判断する。要保留。

## 公開 API / ライブラリ境界

ライブラリとして公開すべき API サーフェスと、アプリケーション側が踏み込みすぎている内部状態の整理。`examples/seekable-player` を `SmfPlayer + SynthEngine` の直接組み合わせの参照実装と位置付けているため、その境界を明文化することが重要。

- **`package.json` の `exports` フィールド追加**: 現状は `tsc` 出力の全ファイルが直接 `import` 可能で、`dist/player/timer.js` 等の内部モジュールへのアクセスを防げない。`"exports": { ".": "./dist/index.js" }` を追加することで外部は `"wasy"` エントリポイント経由のみに限定できる。前提として `Timer` / `TimeStamp` 等、現在 `index.ts` 未経由でしか到達できない型を整理する必要がある (seekable-player が `player.timer` 経由で `Timer` に直接触れているため)。リリース方針 (セクション末尾) が決まった段階で合わせて整備する。

- **`SmfPlayer.timer` の隠蔽 — `currentTick` getter の追加**: `timer: Timer` が public なため `player.timer.tick` でタイマー内部状態に直接触れられる。`SmfPlayer.currentTick: number` (read-only getter、`this.timer.tick` の委譲) を追加し `timer` を `private` 化する方向。`Wasy` も `get timer()` で再 expose しているため、同様に `Wasy.currentTick` まで引き上げれば両方を隠せる。`seekable-player` の `tick()` ループが `player.timer.tick` を読んでいる箇所が移行対象。`delayInSeconds` 等の設定値も `SmfPlayer` レベルで整理する。

- **`SmfPlayer.paused` の readonly 化**: `paused: boolean` が public mutable でアプリ側から直接書き込める。`private _paused` + `get paused()` の read-only getter にして遷移は `play()` / `pause()` / `resume()` 経由のみとする。`Wasy.paused` も同様。

- **`TimeStamp` クラスのプレーンデータ化**: Worker → Main の `postMessage` で `TimeStamp` インスタンスがプレーンオブジェクトに退化するため、`smf-player.ts` で `Object.setPrototypeOf(ts, TimeStamp.prototype)` によるプロトタイプ復元を行っている。`TimeStamp` を class から `interface TimeStamp { tick; oldTick; currentTime; delayInSeconds; ticksPerSecond }` + `accurateTime(ts, tick): number` standalone 関数に変えればこのハックを解消できる。Worker メッセージ型の discriminated union 整備 (本質的課題セクション) と合わせて実施すると一貫した変換レイヤーが得られる。`TimedEvent.timeStamp` の型が変わるため外部向け breaking change になる。

- **`SynthEngine.instruments` / `channelGains` の配列直アクセスの整理**: アプリ側が `engine.instruments[ch]` / `engine.channelGains[ch]` を 0-indexed 配列で直接読む。`instrument(ch: number)` / `channelGain(ch: number)` メソッドに換えて配列を `private` 化すると境界が明確になる。`Wasy` に `channelGains` getter が存在しないため seekable-player は `wasy.engine.channelGains` と engine に直接触れている。`Wasy.channelGain(ch: number): GainNode` を追加すれば `Wasy` ファサード内に収められる。

- **`SmfPlayer + SynthEngine` 直接使い時の協調操作の契約明文化**: pause / stop 時の `synth.pause() → player.pause()` の順序依存や、seek 前の `synth.pause()` 呼び出しが seekable-player の実装の暗黙知になっている。ARCHITECTURE.md に「`SmfPlayer` と `SynthEngine` を直接組み合わせる場合の契約」節を追加するのが最小対応。将来的には `SmfPlayer` コンストラクタが `SynthEngine` を受け取るオプション引数を持ち、協調ロジックを内部化することも検討できる。ただし `Wasy` ファサードとの役割重複になるため、先に `Wasy` の位置付けを整理してから判断する。

## MIDI 互換性

- **Bank ごとの音色マップ**: `isDrumChannel` で drum/melody の切り替えは入った。次は `generatePatch(instrument, program, isDrum, bankMSB, bankLSB)` を bank-aware にし、SC-55 (MSB=0x00) / XG (MSB=0x40) / GM2 (MSB=0x79) などの variation を別音色で鳴らせるように。`gmPatches` を `bankPatches: Map<bankKey, ToneDefinition[]>` のように一段ネストして、データ追加だけで派生バンクを差し込める形に拡張する経路。優先度低 (Web Audio 合成では音色差を表現しきれない)。
- **Soft Pedal (CC 67) / Sostenuto (CC 66)**: Sustain (CC 64) は実装済み。Soft はゲイン軽減、Sostenuto は「踏まれた瞬間に鳴っていた音だけ保留」と意味が異なるので別実装が必要。優先度低。

## スケジューラ精度

- **AudioWorklet ベースのスケジューラ**: 現状は `setInterval` + Two Clocks で実用十分だが、`AudioWorkletProcessor` をメトロノームとして使えば `currentFrame` / `currentTime` 基準でオーディオレンダリングスレッドからタイミングを発火でき、`setInterval` のジッターを排除できる。実装方針は `AudioWorkletProcessor.port.postMessage({ currentTime })` を 1 ブロック (128 サンプル) ごとに送り、`SmfPlayer` 側で `setInterval` の代わりに受け取る形。実現すればルックアヘッド (現 200ms) を短縮できる。worker (SMF パース) と worklet (タイミング) の二重スレッドになるため、`audioContext.audioWorklet.addModule(url)` の非同期ロードステップと `worker ↔ main ↔ worklet` のメッセージ設計を要再検討。SharedArrayBuffer (COOP/COEP 必要) でさらに低レイテンシも狙えるが優先度は低い。

## テスト / 計測

- **Patch 系の AudioContext モックの本格化**: `tests/synth-oneshot-expired.test.ts` で recording-param + 偽 AudioContext のスケルトンを確立済み。これを `SimpleOscillatorPatch` / `NoisePatch` / `GainedOscillatorPatch` / `GainedNoisePatch` の attack / release / detune 反映までカバレッジ拡大。Wasy 統合テスト (Worker stub) は本質的課題セクションを参照。

## ツール / ビルド

- **本体ライブラリのバンドラー判断**: 現状 `tsc` 単独。CJS が必要になったら **tsup** (esbuild ベース) を第一候補、後に **Rolldown** (oxc 系列) に乗り換える経路。Rolldown の 1.0 待ち。
- **フォーマッタ**: oxfmt 導入済み (`npm run fmt` / `fmt:check`、`scripts/hooks/pre-commit` でゲート)。Biome は oxc 路線と別系統になるので採用しない。
- **`Patch` 階層・`Event` 階層・`Instrument`・`Wasy` を class のまま保持**: 関数化はせず継承で動作差分を被せる現状維持を方針として明文化済み。今後新規クラスを足す際の判断基準にする。

## Examples

- **`seekable-player` 残機能**:
    - Tempo Map のグラフ化。同テーブルの可視化。
    - SMF 内 Track Name / Marker の頭出し選択 (現在は表示のみ)。`MarkerMetaEvent` / `SequenceTrackNameMetaEvent` を集めて `<select>` 化し、選択で `seek(tick)`。
    - ループ再生 / 区間リピート。終端到達時に `seek(0)`、もしくは loopStart/loopEnd 区間で繰り返し。

## リリース

- **`version: 0.0.0` のセマンティックバージョン化**: 公開意図があるならタグ + GitHub Release を切る。`peerDependencies` の有無も README に明記 (現状なし)。ユーザ判断。
- **`dist/` の git 管理**: `.gitignore` で除外済み。`git rm -r --cached dist/` の実施はユーザ確認待ち (既存履歴に残る dist/ への影響を確認したい)。
