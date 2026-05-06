# Architecture

Web Audio API を音源に、Standard MIDI File (SMF) と Web MIDI 入力を演奏するシンセサイザライブラリ。

## モジュールマップ

```
src/
├─ index.ts               公開エントリ。Wasy / SmfPlayer / SynthEngine + wasy / midiIn / midi 名前空間
├─ wasy.ts                Wasy: SmfPlayer + SynthEngine を束ねる薄いファサード
├─ smf-player.ts          SmfPlayer: Timer + Worker + tempo 反映、TimedEvent を emit
├─ synth-engine.ts        SynthEngine: 16 ch instrument + per-ch user-gain (channelGains) + master gain + dynamicsCompressor + 受信ルーティング
├─ signal.ts              ミニマムなイベントエミッタ (on / off / offAll / emit)
│
├─ player.ts              createPlayer: SMF 全 Track を tick 単位で先読みし、チャネル別イベント列を返す
├─ smf.ts                 SMF パーサ: parseSong / parseHeader / parseTrack (interface のみ、状態を持たない関数群)
├─ smf-analyze.ts         smf.Song → SongInfo (header + duration + paired notes + text metadata) のプレーンデータ抽出
├─ xiff.ts                IFF/RIFF/SMF 共通のチャンクローダ: parseChunks + Chunk interface + configs
├─ binary/data-view-util  DataView ヘルパ (可変長整数・部分 DataView・ASCII 文字列)
│
├─ midi/
│  ├─ event.ts            MIDI イベント階層 (Event → ChannelEvent / FxEvent → 各種)
│  ├─ instrument.ts       Instrument: 1 チャネル分の音源。NotePool でポリフォニ管理
│  └─ gm.ts               GM 楽器名 / GM パーカッションキー名
│
├─ player/
│  ├─ timer.ts            Timer + TimeStamp。AudioContext.currentTime + setInterval ベース
│  ├─ tuning.ts           EqualTemperamentTuning (12 平均律)
│  └─ player-worker.ts    Player を別スレッドで動かす Web Worker (module worker)
│
├─ synth/
│  └─ patch.ts            Patch / Monophony 基底クラス (NoteOn/Off/Expired/PitchBend ライフサイクル)
├─ synth.ts               Patch 具象実装 + DrumKitPatch + generatePatch
│
└─ webmidi/midi-in.ts     createWebMidiInput (Web MIDI API) / createWebMidiLinkInput (postMessage) → Signal<midi.Event>
```

## 主要クラス間の関係

```
Wasy (façade)
 ├─ SmfPlayer
 │   ├─ Timer (AudioContext)        Timer.onTiming → SmfPlayer.timingListener → worker.postMessage("read")
 │   └─ Worker (player-worker.js)   worker.onmessage → SmfPlayer._playerWorkerMessageListener
 │       └─ createPlayer → Song → Track*  SMF パース + cursor 管理 (worker 内)
 └─ SynthEngine
     ├─ generatePatch (関数)
     └─ Instrument[16]
         ├─ NotePool<Monophony>     polyphony=16 の LRU 強制発音停止
         ├─ Patch<Monophony>        program change で差し替わる
         │   └─ Monophony (= managedNodes / detunableNodes / parentPatch)
         └─ AudioGraph: panner → filter → gain → SynthEngine.channelGains[i] → SynthEngine.gain
                                                          ├─ reverbSend → SynthEngine.reverb
                                                          └─ chorusSend → SynthEngine.chorus
```

`SmfPlayer.onTimedEvent` で発行された `TimedEvent` は `Wasy` が受信し、`SynthEngine.receiveEvent` へ転送 + 外部リスナへ再 emit する。

`SynthEngine.receiveEvent` は `ChannelEvent` をその channel の `Instrument` に送り、`SystemExclusiveEvent` のうち GS Reset (`F0 41 10 42 12 40 00 7F 00 41 F7`) / XG System On (`F0 43 10 4C 00 00 7E 00 F7`) を `matchSysEx` で検出して全 Instrument に `applyReset(time)` を呼ぶ (engine 側で 1 度だけ判定するため、Worker による 16 ch 複製で 16 倍の reset が走らない)。それ以外の SysEx / MetaEvent は従来どおり全 Instrument に broadcast。`matchSysEx` は SMF (`[varlen-length, ...body]`) と Web MIDI (`[...body]`) の両形式を offset 0 と 1 で試して受け入れる。

`Patch` 基底クラスは ADSR エンベロープ (`attackTime` / `decayTime` / `sustainLevel` / `releaseTime`、既定 5 ms / 0 / 1 / 50 ms) と `applyAttack(gainParam, peakGain, time)` / `applyRelease(gainParam, time)` ヘルパを持つ。`SimpleOscillatorPatch` / `NoisePatch` の `onNoteOn` は `applyAttack`、`onNoteOff` は `applyRelease` + `oscillator.stop(time + releaseTime)` の順で release tail を残してから止める。`applyRelease` は `cancelAndHoldAtTime(time)` でリリース開始値を予約 NoteOff 時点で固定する (フォールバックは `setValueAtTime(.value, time)`)。`GainedOscillatorPatch` / `GainedNoisePatch` 系 (ピアノ系の減衰 envelope と打楽器 one-shot) は自前の gain ramp を `cancelScheduledValues(time)` で重ねる方式を維持し、`baseGain` は `velocityToGain(event.velocity)` から直接計算する (基底の `applyAttack` が future schedule を組むため `.value` 読みは default 0 を返す)。

`Patch` の継承:

```
Patch<Monophony>
├─ SimpleOscillatorPatch    (square/sine/triangle/sawtooth)
│   └─ GainedOscillatorPatch
│       └─ OneShotOscillatorPatch
├─ NoisePatch               (2 秒のホワイトノイズバッファをループ + BiquadFilter)
│   └─ GainedNoisePatch
│       └─ OneShotNoisePatch
└─ DrumKitPatch             (note 番号ごとに OneShot 系を保持。ハイハットは相互 expire)
```

`Event` の継承:

```
Event
├─ ChannelEvent
│   ├─ NoteOff / NoteOn / PolyphonicKeyPressure
│   ├─ ControlChange / ProgramChange / ChannelPressure / PitchBend
└─ FxEvent
    ├─ SystemExclusiveEvent
    └─ MetaEvent
        ├─ TextMetaEvent              (typeIndex 0x01)
        ├─ CopyrightMetaEvent         (0x02)
        ├─ SequenceTrackNameMetaEvent (0x03)
        ├─ InstrumentNameMetaEvent    (0x04)
        ├─ LyricMetaEvent             (0x05)
        ├─ MarkerMetaEvent            (0x06)
        ├─ CuePointMetaEvent          (0x07)
        ├─ TempoMetaEvent             (0x51)
        └─ TimeSignatureMetaEvent     (0x58)
```

text 系 Meta event は `MetaEvent.text(encoding?)` でデコードできる。`encoding` 省略時は UTF-8 を strict モードで試し、不正バイトがあれば Shift_JIS にフォールバックする (SMF は UTF-8 以前の規格で、日本語 SMF は Shift_JIS が一般的)。

## ランタイムフロー

### 起動 (SMF 再生時)

1. `new Wasy(audioContext, destination, buffer)` (もしくは既存インスタンスへの `wasy.load(buffer)`)
    - module worker を生成し、`{type: "init", buffer}` を transfer 渡し
    - `load(buffer)` は `Promise<void>` を返し、worker の `songInfo` 応答 (= パース + 解析完了) で resolve する
2. Worker は `Player` を構築し SMF をパース、続けて `buildSongInfo(player.song)` で `SongInfo` (header + duration + 全 note の閉区間ペア + text metadata) を組み立て、`{type: "songInfo", songInfo}` を返却
3. メインスレッドは `_songInfo` に保存し `timer.resolution = songInfo.resolution` を更新、`_workerReady = true` でタイマからの `read` postMessage をゲート開放。`SmfPlayer.songInfo` getter で UI からプレーンデータとしてアクセスできる (主スレッドで `smf.parseSong` を 2 度走らせなくて済む)
4. アプリは `await wasy.load(buffer)` (もしくは `await wasy.ready`) してから `play()` するのが推奨。これを怠ると tick=0 のイベントが過去の audio time にスケジュールされ、Web Audio が `start(timeInPast) → 即発火` する仕様により再生開始時にドラム等が先行発音する

### 演奏ループ ("Two Clocks" スケジューラ)

1. `wasy.play()` → `Timer.start()` で `setInterval(durationInSeconds*1000)` を開始 (既定 25ms)
2. 毎 fire:
    - `Timer.timing()` が `tick += ticksPerSecond * (audioContext.currentTime - this.currentTime)` で実経過の audio time に基づいて tick を進める。`currentTime` は now にアンカーし直す。`TimeStamp` を発火
    - `SmfPlayer.timingListener` が `worker.postMessage({type: "read", timeStamp})`
3. Worker:
    - `Player.read(tick)` でカーソル位置から当該 tick までのイベントをチャネル別に集約
    - `{type: "read", newEventsStore, timeStamp}` で返信
4. メインスレッド (`SmfPlayer._playerWorkerMessageListener`):
    - `TimeStamp` のプロトタイプを復元 (`Object.setPrototypeOf`)
    - 各 `Event` を `Event.create()` で再構築 (構造化複製で型情報が落ちるため)
    - `_emitter` 経由で `Wasy` および外部購読者に `TimedEvent` を 1 イベント=1 emit で通知 (非 ChannelEvent は worker 側で 16 ch に複製されているため channel 0 バケット経由で代表化)
    - `TempoMetaEvent` を見たら `timer.secondsPerBeat` を更新
5. `Wasy` は `TimedEvent` を受けて `engine.receiveEvent(midiEvent, accurateTime)` で発音を Web Audio に予約。`accurateTime` = `currentTime + delayInSeconds (=200ms lookahead) + (eventTick - oldTick) / ticksPerSecond`。

### seek

1. `wasy.seek(tick)` → `engine.pause()` で発音中の音を停止 → `player.seek(tick)`
2. `SmfPlayer.seek` は timer を invalidate し `tick = oldTick = newTick` にアンカー。`{type: "seek", tick}` を worker に送信、再生中だった場合は timer を resume
3. Worker は `cursors[*] = 0` にリセット → `read(tick)` で 0..tick の全イベントを読み出し → `{type: "seek", newEventsStore, tick}` で返信
4. メインスレッドは seek reply 受信時、`NoteOnEvent` / `NoteOffEvent` を除外し、状態系イベント (ProgramChange / ControlChange / PitchBend / Tempo / SysEx) のみを replay → engine 状態を tick 時点まで巻き戻し
5. Worker FIFO により seek reply は次の read reply より先に届くため、状態は note より先に適用される

### Instrument 内部

- `ControlChange` は以下を直接処理し、それ以外は `patch.receiveEvent` へ委譲:
    - `0/32` Bank Select MSB/LSB → `bankMSB`/`bankLSB` を保持 (次の ProgramChange で参照される)
    - `7/10/11` Volume/Panpot/Expression
    - `1` Modulation Wheel → `setModulation(value, time)` (per-ch 5 Hz LFO depth、0..127 → 0..50 cents)
    - `71` Filter Resonance → `setFilterResonance(value, time)` (per-ch BiquadFilter Q を 0.5..12 で対数マッピング)
    - `74` Brightness / Filter Cutoff → `setFilterCutoff(value, time)` (per-ch BiquadFilter frequency を 750 Hz..16 kHz で指数マッピング)
    - `91` Reverb Send → `setReverbSend(value, time)` (per-ch wet send gain)
    - `93` Chorus Send → `setChorusSend(value, time)` (per-ch wet send gain)
    - `64` Sustain (Damper) Pedal → `setSustain(value, time)`
    - `6/38` Data Entry MSB/LSB → `_dispatchDataEntry()` が `_lastParamType` を見て `receiveRPN` か `receiveNRPN` に振り分け
    - `98/99` NRPN LSB/MSB → `nrpn` を 14bit で構成、`_lastParamType = "nrpn"`
    - `100/101` RPN LSB/MSB → `rpn` を 14bit で構成、`_lastParamType = "rpn"`
    - `120` AllSoundOff、`121` ResetAllControl (`applyReset(time)` 経由で全コントローラ状態 + audio param を GM デフォルトに ramp 復帰)
- RPN/NRPN 初期値は `0x3FFF` (null)。選択前の Data Entry は無視
- Sustain Pedal が押下中 (`sustain === true`) の間、`NoteOff` は `_sustainedNoteOffs: Map<noteNumber, NoteOffEvent>` に保留され `patch.receiveEvent` には届かない。`NoteOn` が来たら同じ noteNumber の保留を破棄 (再打鍵が解放を上書き)。ペダル off で全保留 NoteOff を解放時刻で一括 dispatch。AllSoundOff / ResetAllControl / pause / destroy は dispatch せずクリア
- `ProgramChange` は外部に発火 → `SynthEngine` 側で `isDrumChannel(channel, instrument.bankMSB)` を再評価し、`generatePatch` で `instrument.patch` を差し替え。`isDrumChannel` は GM2 規約に従い、`bankMSB === 0x78` → drum / `0x79` → melody / それ以外は `channel === 9`
- **Channel filter** (`_filter: BiquadFilterNode`): `_panner` と `_gain` の間に挟まる lowpass。既定は cutoff 12 kHz / Q=1 と near-bypass で、CC 74 (Brightness) と CC 71 (Resonance) に応じて `frequency` / `Q` が 8 ms ramp で変化する。1 ch につき 1 つしか持たないので polyphony が増えてもコストは一定
- **Channel send buses** (`_reverbSend`, `_chorusSend`: `GainNode`): `SynthEngine` が `channelGains[ch]` の出力を `instrument.reverbSend` (および `chorusSend`) に `connect`、その出力を engine 側の `Reverb` / `Chorus` の入力に流す。CC 91 / 93 で send gain (0..1) を ramp 制御する。channelGain (= user-gain 層) の後段でタップしているため、mute / solo / fader と CC 7/11 の volume / expression が wet にも効く
- **Channel modulation LFO** (`_modLfo: OscillatorNode` 5 Hz sine + `_modDepth: GainNode` cents): CC 1 で `_modDepth.gain` を 0..50 cents に ramp。`_modDepth` の出力は `attachChannelDetune` で `_detuneOffset` と並んで各ノートの `detune` AudioParam に `connect` され、AudioParam 入力で加算合成 (DC = pitch bend + tune、AC = vibrato)
- **Channel detune bus** (`_detuneOffset: ConstantSourceNode`): pitch bend / fine tune (RPN 1) / coarse tune (RPN 2) を発音中ノートに即時反映するためのチャネル単位 DC バス。コンストラクタで `_detuneOffset.start()` され、`offset.value` (cents) は `pitchBend + fineTune + coarseTune × 100`。`PitchBendEvent` 受信および `receiveRPN` の RPN 0/1/2 ケース、`CC 121` ResetAllControl で `_updateDetuneOffset(time)` が呼ばれ、`cancelScheduledValues → setValueAtTime → linearRampToValueAtTime` の 8 ms ramp で `offset` を更新する (volume / panpot と同じ anti-zipper パターン)。各 `Patch` は NoteOn 時に `attachChannelDetune(monophony, source)` を呼び、`monophony.detunableNodes` (例: `oscillator` / `BiquadFilter`) の `detune` AudioParam に `_detuneOffset` を `connect` する。AudioParam は接続元の値を加算入力するため、ノード自身の `detune.value` は 0 のままバス側が pitch offset を運ぶ。`source.addEventListener("ended", ...)` で disconnect 後始末。`destroy()` で `_detuneOffset.stop()` + `disconnect()`
- `Patch.receiveEvent` は `NoteOn → onNoteOn → registerNote`、`NoteOff → onNoteOff` をディスパッチ。`PitchBend` は `Instrument` 側で吸収され、後述の channel detune bus を経由するため `Patch` には届かない
- `NotePool.register` は同一 noteNumber の上書き時と polyphony 超過時に `expired` を発火 → `Wasy` 経由で `parentPatch.onExpired` を呼びノードを破棄

### 外部 MIDI 入力

- `WebMIDIIn` は `navigator.requestMIDIAccess()` で全入力ポートを購読
- `WebMidiLinkIn` は `window.message` を購読し WebMidiLink 文字列 (`"midi,90,3c,40"` 形式) をデコード
- どちらも `midi.Event` を発火 → 利用側で `Wasy.receiveExternalMidiEvent(event)` を呼ぶと `audioContext.currentTime` で即時発音

## オーディオグラフ

```
note ごとの patch.onNoteOn が作るノード群
   │
   ▼
Patch.destination (= instrument.source = instrument._panner)
   │
   ▼
instrument._panner (StereoPannerNode, pan = (panpot - 64) / 64)
   │
   ▼
instrument._filter (BiquadFilter lowpass — MIDI CC 74 cutoff / CC 71 Q)
   │
   ▼
instrument._gain (volume × expression — MIDI CC 7 / 11 由来)
   │
   ▼
SynthEngine.channelGains[ch] (per-ch user-gain bus, 既定 1.0)
   │                          ── アプリ側でミュート / ソロ / 個別ボリュームを書く層
   │
   ├──► instrument._reverbSend (CC 91) ──► SynthEngine._reverb.input ──► ConvolverNode (1.5s IR) ──► .output ─┐
   ├──► instrument._chorusSend (CC 93) ──► SynthEngine._chorus.input ──► DelayNode + LFO + feedback ──► .output ─┤
   ▼                                                                                                          │
SynthEngine.gain (master gain, default 0.1) ◄─────────────────────────────────────────────────────────────────┘
   │
   ▼
SynthEngine.dynamicsCompressor
   │
   ▼
audioContext.destination (もしくはコンストラクタで渡された任意の AudioNode)
```

`channelGains[ch]` は `instrument._gain` (CC 7/11) と直交した user-gain 層。MIDI 由来の音量制御を壊さずに「mute=0 / solo フィルタ / フェーダ」を実装するためのフックとして設けてある (例: `examples/seekable-player` の `MixerView`)。

`DrumKitPatch` は内部に独自 `gain` と左右用 `StereoPannerNode` (pan -0.5 / +0.5) を追加で挟むため、ドラム発音は `monophony nodes → leftPanpot/rightPanpot → DrumKitPatch.gain → instrument._panner → ...` という経路を通る。

## スレッドモデル

- **メインスレッド**: `Wasy` / `Timer` / `Instrument` / `Patch` / Web Audio ノード操作
- **Player Worker**: `Player` (SMF パース・カーソル進行)。tick の進行はメインスレッドが管理し、Worker は問い合わせ駆動
- やり取りされるメッセージ型: `init` / `read` / `songInfo` / `seek` (旧 `resolution` は `songInfo` に統合)
- `init` を受けた worker は SMF をパースした直後に `buildSongInfo(song)` (`src/smf-analyze.ts`) で `SongInfo` を生成し `{type: "songInfo", songInfo}` を返す。`SongInfo` は `Note[]` / `SongMetadata` / `format` / `numberOfTracks` / `resolution` / `durationTicks` / `tempoMap: TempoChange[]` / `timeSignatureMap: TimeSignatureChange[]` のみを持つプレーンデータで、class instance を含まないため構造化複製で型落ちしない (`tests/smf-analyze.test.ts` の `structuredClone` 往復テストでガード)。tick→秒変換は `smfAnalyze.tickToSeconds(tick, tempoMap, resolution)` (テンポ区間ごとに `(segmentTicks * µsPerQuarter) / (resolution * 1e6)` を積分)、tick→小節:拍変換は `smfAnalyze.tickToBarBeat(tick, timeSignatureMap, resolution)` (TS 変更点で常に新しい小節を開始) で計算する
- `Event` インスタンスは `postMessage` の構造化複製で生のオブジェクトに退化するため、メインスレッド側で `Event.create()` により型情報を復元している

## ビルド

- TypeScript 5.x の `tsc` のみ。bundler は使用しない
- `module: NodeNext` のため import は `.js` 拡張子付き
- `dist/` には `.js` / `.d.ts` / `.js.map` / `.d.ts.map` が配置される
- Worker は `new Worker(new URL("./player/player-worker.js", import.meta.url), { type: "module" })` パターン。ブラウザネイティブ ESM か、URL を解決できるバンドラ (Vite/webpack5/esbuild) のどちらでも動く
