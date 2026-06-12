// Band-limited pulse (rectangular) waves with arbitrary duty cycle for
// chiptune-style timbres. Web Audio's built-in `"square"` OscillatorType
// is fixed at 50% duty; the NES-style 12.5% / 25% pulses that carry most
// of the 2A03 palette need a `PeriodicWave` built from the Fourier series
// of the rectangular wave (±1, duty `d`, DC removed):
//   real[n] = (2 / πn) · sin(2πnd)
//   imag[n] = (2 / πn) · (1 − cos(2πnd))
// At d = 0.5 this reduces to the classic square series (imag[n] = 4/πn
// for odd n); d and 1−d have identical magnitude spectra, so 75% sounds
// the same as 25% — both are accepted for authoring convenience.

// Partials fall off as 1/n, so partial 64 sits ~36 dB below the
// fundamental; the browser band-limits playback per oscillator rate.
const HARMONICS = 64;

export const pulseWaveCoefficients = (
    duty: number,
    harmonics: number = HARMONICS,
): { real: Float32Array; imag: Float32Array } => {
    const real = new Float32Array(harmonics + 1);
    const imag = new Float32Array(harmonics + 1);
    for (let n = 1; n <= harmonics; ++n) {
        real[n] = (2 / (Math.PI * n)) * Math.sin(2 * Math.PI * n * duty);
        imag[n] = (2 / (Math.PI * n)) * (1 - Math.cos(2 * Math.PI * n * duty));
    }
    return { real, imag };
};

// One wave per (context, duty); PeriodicWave instances are immutable and
// shareable across oscillators, so a song never builds more than a
// handful of them.
const pulseWaveCache = new WeakMap<BaseAudioContext, Map<number, PeriodicWave>>();

export const getPulseWave = (ctx: BaseAudioContext, duty: number): PeriodicWave => {
    let waves = pulseWaveCache.get(ctx);
    if (waves == null) {
        waves = new Map();
        pulseWaveCache.set(ctx, waves);
    }
    let wave = waves.get(duty);
    if (wave == null) {
        const { real, imag } = pulseWaveCoefficients(duty);
        wave = ctx.createPeriodicWave(real, imag);
        waves.set(duty, wave);
    }
    return wave;
};
