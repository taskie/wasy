# TODO

Phase 1〜5 (examples 統合 / 自動テスト / oxlint / 構造改善 / ドキュメント) およびそれ以降の差分は `CHANGELOG.md` の `[Unreleased]` を参照。ここでは持ち越しの判断保留と、今後やりたい項目だけを残す。

**方針前提**: 音色・音質は**チップチューン** (oscillator + noise 合成) を前提とする。GM 互換は「演奏情報 (イベント / コントローラ) の解釈の正確さ」を目標とし、サンプルベースの音色リアリズムは追わない。

## 本質的課題

- **チップチューン表現力の深化 (SF2 / DLS 路線は採らない)**: 旧方針「GM 128 の表現には SoundFont (SF2) / DLS サポートが本筋」は撤回。oscillator + noise + 1 段フィルタの編成は制約ではなくアイデンティティとして扱い、チップ実機 (2A03 / GB / SID) 由来のイディオムで表現力を上げる。具体項目は「チップチューン表現力」セクションを参照。

- **Worker 境界のイベント重複ディスパッチを暗黙の規約で凌いでいる**: `Player` (Worker) は非 ChannelEvent を 16 ch すべてにブロードキャストし、`SmfPlayer` は「ch 0 のバケットだけを購読する」という暗黙ルールでデデュープしている (`smf-player.ts:175 / 203`)。Worker 側のロジックが変わると外部購読者に多重通知が漏れる。Worker 出力を `{ channelEvents: Event[][16], commonEvents: Event[] }` のように分けて返す設計に直し、main 側で改めて配信させる。構造化複製のコスト軽減も兼ねる。先行して `src/player/messages.ts` に `ClientMessage` / `WorkerMessage` の discriminated union を切り、`event.data.type` の string switch を型付けに置き換えるのが前提整備。

- **統合テストの不在 (`SynthEngine` / `Wasy` ラウンドトリップ)**: 単体テスト (NotePool / Timer / createPlayer / sustain / isDrumChannel / OneShot expired) は揃ったが、最大の故障点である「main ↔ Worker のメッセージング (init / read / seek / load / unload)」と「`SynthEngine.receiveEvent` の 16 ch ルーティング」は未検証。Worker stub + jsdom + 偽 AudioContext で `new Wasy(ctx, dest, smfBuffer).play()` から `onTimedEvent` までを通す `tests/wasy.test.ts` を立てる。Worker メッセージ型整備 (上記) 後の方が書きやすい。

- **`GainedOscillatorPatch` / `GainedNoisePatch` (ramp + !oneShot) の整理**: GM 128 melodic 既定パッチ (`gmPatches`) は全エントリ ADSR に移行したため、`compileTone` の `oscillator|noise + ramp + !oneShot` 経路は外部利用者が `ToneDefinition` で `ramp` 包絡を与えたときにしか到達しない。decayTime / sustainLevel への翻訳ができれば envelope の二重実装 (ramp 専用クラス vs ADSR) を解消できる。利用実績がほぼないため優先度低。

- **`NoisePatch` の `fixedFrequency` 非対応**: `compile.ts` で `noise + adsr` は `NoisePatch` に振られるが、同クラスはトラッキング (noteNumber+24) のみで `filterFrequency.fixed` を無視する。結果として「持続するノイズで固定の filter 周波数」は ramp 包絡 (`GainedNoisePatch`) を選ぶしか書けない。`NoisePatch` に `fixedFrequency` 引数を足して `GainedNoisePatch` と挙動を揃えれば、`ToneDefinition` の `noise + adsr + filterFrequency.fixed` を表現できるようになる。

- **`adsr + oneShot` の組み合わせ**: 現状 `compile.ts` は `throw` でガードしている。one-shot ADSR (NoteOff 不要のキュー型ボイス) を表現したくなったら、`OneShotOscillatorPatch` / `OneShotNoisePatch` 側に attack ramp + decay-to-sustain ramp + 自動 release を組み込む経路が必要。GM 128 / DrumKit 既定では使わないので保留。

- **CC 5 Portamento Time / CC 65 Portamento On-Off**: モノフォニックスライドの実装が大きいため別タスク。**チップチューン前提ではピッチスライドが中核イディオムのため優先度を上げる** (「チップチューン表現力」のピッチスライド項を参照)。

- **GM2 / XG の SysEx (Reverb Type / Chorus Type / Time / Depth など) で IR / LFO 設定を切り替える経路**: `SynthEngine` の Reverb / Chorus は固定パラメータのみ。SysEx で IR / LFO 設定を差し替えるには engine 側にプリセットテーブルを持たせる。チップチューン前提では空間系の使用は控えめなので優先度低。

- **GS / XG パート設定 (Use For Rhythm Part など) の SysEx**: GS/XG リセットの認識は入ったが、part-mode 切替などの本格的設定は未対応。

## チップチューン表現力

(方針: サンプル再生ではなく、チップ実機イディオムのプリミティブを足して GM 音色の説得力を上げる)

- **パルス幅 (duty cycle) 指定**: Web Audio の `square` は 50% 固定。`PeriodicWave` をフーリエ係数から生成して 12.5% / 25% / 75% を追加し、`OscillatorSource` に `duty?: number` を足す。2A03 の音色差の根幹で、GM 128 の弾き分け (リード / ブラス系 25%、フルート系 50% など) が一段広がる。実装コスト小・効果大の筆頭。
- **LFSR ノイズ (short mode)**: 現状の `Math.random()` ホワイトノイズに加え、NES の 93-step short mode 相当の短周期 LFSR をループ `AudioBuffer` で生成し、`NoiseSource` に `mode?: "white" | "short"` を足す。金属的なパーカッション (カウベル / アゴゴ / ティンバレス系) の説得力が上がる。
- **ウェーブテーブル音源 (GB CH3 風)**: 32 サンプル 4-bit 波形を `PeriodicWave` 化する `ToneSource` の新種別。矩形波 / 三角波の中間音色 (オルガン / ベース系) を表現できる。
- **ディレイドビブラート**: チップ系リードの定番アーティキュレーション。`Instrument` の LFO 経路に開始遅延を足し、CC 78 (Vibrato Delay) と `ToneDefinition` の両方から指定可能にする (MIDI 互換性セクションの CC 76/77/78 と同一実装で賄う)。
- **ピッチスライド (ポルタメント)**: CC 5 / 65 / 84 として実装 (本質的課題セクション参照)。チップチューンの中核イディオム。
- **デチューンユニゾン**: 2 オシレータの微小デチューン重ね (疑似コーラス、SID/FC 音源の定番)。`ToneDefinition` の複数レイヤ対応 (patch-editor 残機能の「複数レイヤ」) と CC 94 (Celeste) の双方の土台になる。
- **ローファイ化 (opt-in)**: 4-bit DAC 風の量子化を `WaveShaperNode` で master / channel に挿す飾り。「チップ感」は上がるが必須ではないので優先度低。example のトグルから始めるのが妥当。
- **`gmPatches` / `gmDrumKit` の磨き込み (継続データ作業)**: 上記プリミティブ (duty / LFSR / wavetable / delayed vibrato / detune) が入るたびに 128 音色 + ドラムキットへ反映する。

## 内部構造リファクタリング

(本質的課題の前に、コードベース整理として実施したい段階的タスク)

- **Phase 1 — 即時クリーンアップ**:
    - `player-worker.ts:43-45` の dead な `case "resolution"` と `smf-player.ts:154-161` の対応する受信ハンドラを削除 (現在の main 側は `songInfo` 経由で resolution を受け取るため未使用)
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

以下は GM Level 1 / GM2 準拠において現時点で未実装の項目。

### Channel Voice Messages（GM1 必須）

- **CC 123 All Notes Off**: `instrument.receiveEvent` の switch に case がなく `patch.receiveEvent` へ fall-through（patch 側でも無視）。GM1 必須。CC 120 (All Sound Off) と異なり release tail は残したまま発音を終了させる — `patch.onNoteOff` を全ノートに適用し sustain 保留もクリアするのが正しい意味論。
- **Channel Pressure (Channel Aftertouch)**: `ChannelPressureEvent` クラスは存在し `instrument.receiveEvent` の else 節で `patch.receiveEvent` に転送されるが、patch 側でも無視される。GM1 では「Channel Pressure はビブラートまたは brightness を駆動する」と規定。最低限 CC 1 (Modulation) と同じ LFO depth 経路に接続するか、`_filter.frequency` を圧力で変調する実装が必要。
- **Polyphonic Key Pressure (Poly Aftertouch)**: 同上。`PolyphonicKeyPressureEvent` が patch に到達しても無視。GM1 は poly aftertouch を受信することを必須としている。個別ノートの gain パラメータを変調するには `NotePool` 上の各 `Monophony` への参照が必要で実装コストは高い。実曲 SMF での使用頻度も低く、優先度低。

### Channel Mode Messages

- **CC 122 Local Control** / **CC 123 All Notes Off** / **CC 124 Omni Off** / **CC 125 Omni On** / **CC 126 Mono On** / **CC 127 Poly On**: これらはすべて fall-through で無視される。GM1 / GM2 では CC 123–127 を受信した際に暗黙の All Notes Off を発行することを求めている。CC 122 はソフトシンセでは no-op で許容されるが、残りは `notePool.unregisterAll()` + sustain クリアを呼ぶべき。Mono / Poly モード切り替えは polyphony ロジックに影響するため実装コストが高い。

### Sound Controllers（GM2）

- **CC 72 Release Time / CC 73 Attack Time**: `Patch` の `releaseTime` / `attackTime` に対する相対オフセット (0=最短, 64=変化なし, 127=最長)。チャンネルごとに `attackOffset` / `releaseOffset` を保持し、次の NoteOn から適用する。GM2 必須。
- **CC 75 Decay Time**: `decayTime` の相対調整。CC 72/73 と同じ枠組みで追加可能。
- **CC 76 Vibrato Rate / CC 77 Vibrato Depth / CC 78 Vibrato Delay**: それぞれ `_modLfo` の frequency (固定 5 Hz)・`_modDepth.gain` の上限・LFO 開始遅延を制御。CC 1 (Mod Wheel) は振幅だけを変えるが CC 77 は絶対深度として独立。Vibrato Delay は DelayNode の追加が必要。GM2 必須。**ディレイドビブラートはチップチューンの定番表現のため優先度高** (チップチューン表現力セクション参照)。
- **CC 84 Portamento Control**: CC 65 (Portamento On-Off) の前提となるメッセージ; per-note のポルタメント開始ピッチを指定する。CC 5/65 の実装 (本質的課題セクション) と合わせて対応。
- **CC 94 Celeste (Detune) Depth**: 微妙なデチューンによるコーラス感の付加。`_detuneOffset` に対し ±セント範囲を重畳する形で実装可能。GM2 必須。デチューンユニゾン (チップチューン表現力セクション) の MIDI 側入口になるため優先度中。

### RPN（GM2）

- **RPN 5 Modulation Depth Range**: CC 1 の最大ビブラート深度を設定 (MSB = semitones / LSB = cents, GM2 既定 0.5 半音 = 50 cents)。現状の固定 ±50 cents は GM2 既定値と一致しているが、RPN 5 で変更できない。`_maxModDepthCents` フィールドを `Instrument` に追加し `setModulation` 内で参照すれば対応できる。

### SysEx

- **GM System On `F0 7E 7F 09 01 F7` / GM2 System On `F0 7E 7F 09 03 F7`**: Universal Non-Real-Time SysEx の Sub-ID1=`09`, Sub-ID2=`01`(GM1) / `03`(GM2)。`synth-engine.ts` は GS Reset (`F0 41 ...`) と XG System On (`F0 43 ...`) を検出して全 Instrument に `applyReset` を呼ぶが、GM1/GM2 System On は未検出。同じ経路に `isGm1Reset` / `isGm2Reset` matcher を追加するだけで対応できる。
- **Universal Real-Time SysEx — Device Level Messages** (`F0 7F 7F 04 ...`): channel=`7F` (broadcast) で全チャンネルに影響するエンジンレベルの制御。未実装:
    - Master Volume `04 01 ll mm` → `SynthEngine.gain.gain` に書き込む (0x0000=0, 0x3FFF=1)
    - Master Pan `04 02 00 mm` → master 段の `StereoPannerNode` が必要 (現状 `gain` の後段に panner がない)
    - Master Fine Tuning `04 03 ll mm` / Master Coarse Tuning `04 04 00 mm` → `SynthEngine` に engine-wide tuning offset を持たせ、各 `Instrument._detuneOffset` にバイアスとして加算する

### GM2 パーカッションマップ

- **複数ドラムキット (Bank LSB 別)**: GM2 は Bank MSB=`0x78` (rhythm part) のうち LSB で Standard Kit (0) / Room Kit (8) / Power Kit (16) / Electronic Kit (24) / Analog Kit (25) / Jazz Kit (32) / Brush Kit (40) / Orchestra Kit (48) / Sound FX Kit (56) を区別する。現状は LSB に関係なく Standard Kit (`gmDrumKit`) が使われる。「Bank ごとの音色マップ」(下記) の枠組みで `rhythmBankPatches: Map<lsb, DrumKitDefinition>` を整備すれば対応できる。Electronic Kit (24) / Analog Kit (25) はチップチューン合成と相性が良く、データ追加の価値が高い。

### Bank ごとの音色マップ（既出、再掲）

- **Bank ごとの音色マップ**: `isDrumChannel` で drum/melody の切り替えは入った。次は `generatePatch(instrument, program, isDrum, bankMSB, bankLSB)` を bank-aware にし、SC-55 (MSB=0x00) / XG (MSB=0x40) / GM2 (MSB=0x79) などの variation を別音色で鳴らせるように。`gmPatches` を `bankPatches: Map<bankKey, ToneDefinition[]>` のように一段ネストして、データ追加だけで派生バンクを差し込める形に拡張する経路。優先度低だが、チップチューン前提では「バンク = アレンジ違い (duty / detune / エンベロープ違い)」として再解釈でき、実機エミュレーション的な忠実度を目指す必要はない。
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
    - SMF 内 Track Name の頭出し選択。`SequenceTrackNameMetaEvent` を `<select>` 化し選択で `seek(tick)`。Marker は Transport / Seek パネルに実装済み。
    - ループ再生 / 区間リピート。終端到達時に `seek(0)`、もしくは loopStart/loopEnd 区間で繰り返し。

- **`patch-editor` 残機能**:
    - duty / LFSR ノイズ / ウェーブテーブルなど新ソース種別の編集 UI (チップチューン表現力セクションの各項目が入り次第追従)。
    - ADSR エンベロープの波形プレビュー (`<canvas>` で Attack / Hold / Decay / Sustain / Fade / Release のシェイプを描く)。
    - フィルタタイプ選択 (`lowpass` / `highpass` / `bandpass` など)。現状 `NoisePatch` は固定 lowpass。
    - デチューン (オシレータ fine-tune / コースチューン) パラメータの編集 UI。
    - `gmPatches[i]` のプリセット読み込み。プログラム番号を選択して既存 GM 音色を出発点として編集する。
    - 複数レイヤ (ユニゾン / コード) のスタック定義。現状 `ToneDefinition` は単一ソース。

## リリース

- **`version: 0.0.0` のセマンティックバージョン化**: 公開意図があるならタグ + GitHub Release を切る。`peerDependencies` の有無も README に明記 (現状なし)。ユーザ判断。
- **`dist/` の git 管理**: `.gitignore` で除外済み。`git rm -r --cached dist/` の実施はユーザ確認待ち (既存履歴に残る dist/ への影響を確認したい)。
