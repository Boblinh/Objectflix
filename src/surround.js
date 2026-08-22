


























































export const SURROUND_MODES = Object.freeze({
  original: "original",
  stereo: "stereo",
  virtual: "virtual",
});

export const SURROUND_MODE_LABELS = Object.freeze({
  original: "Original",
  stereo: "Stereo",
  virtual: "Virtual 7.1 Headphones",
});




export const HRTF_PROFILES = Object.freeze([
  Object.freeze({
    id: "itu",
    label: "ITU 7.1 (Natural)",
    azimuths: Object.freeze({ FL: -30, FR: 30, C: 0, LFE: 0, BL: -135, BR: 135, SL: -90, SR: 90 }),
  }),
  Object.freeze({
    id: "cinema",
    label: "Cinema",
    azimuths: Object.freeze({ FL: -45, FR: 45, C: 0, LFE: 0, BL: -125, BR: 125, SL: -75, SR: 75 }),
  }),
  Object.freeze({
    id: "wide",
    label: "Wide",
    azimuths: Object.freeze({ FL: -40, FR: 40, C: 0, LFE: 0, BL: -150, BR: 150, SL: -105, SR: 105 }),
  }),
]);

export const HRTF_PROFILE_DEFAULT = "itu";


export const CHANNELS = Object.freeze(["FL", "FR", "C", "BL", "BR", "SL", "SR"]);



export const MONITOR_CHANNELS = Object.freeze(["FL", "FR", "C", "SL", "SR", "BL", "BR", "LFE"]);

const CROSSOVER_LOW_HZ = 120;    
const CROSSOVER_HIGH_HZ = 4500;  
const CENTER_MIX = 0.7;          
const FRONT_CENTER_REMOVE = 0.5; 





const SURROUND_MIX = 0.8;    
const SIDE_HIGH_MIX = 0.7;   
const SR_MID_MIX = 0.6;      
const SR_HIGH_MIX = 0.9;     
const REAR_MID_MIX = 0.45;   
const REAR_HIGH_MIX = 0.6;   
const BR_MID_MIX = 0.3;      
const BR_HIGH_MIX = 0.75;    
const REAR_DELAY_SECONDS = 0.012;
const REAR_DELAY_SECONDS_BR = 0.016;
const LFE_LEVEL = 0.3;           
const MASTER_TRIM = 0.5;
const LIMITER_THRESHOLD_DB = -1;
const LIMITER_RATIO = 20;
const LIMITER_ATTACK = 0.001;
const LIMITER_RELEASE = 0.12;







const DECORRELATE_CHAIN_HZ = Object.freeze({
  SL: [330, 910, 2100, 4500, 9000],
  SR: [430, 1250, 2600, 5600, 11000],
  BL: [560, 1500, 3200, 6500, 12000],
  BR: [690, 1800, 3600, 7200, 13000],
});
const CROSSFADE_SECONDS = 0.08;
const SMOOTH_SECONDS = 0.012;
const DEFAULT_PARAMS = Object.freeze({ surround: 1, center: 1, lfe: 1 });

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}




export function azimuthToPosition(degrees) {
  const radians = (degrees * Math.PI) / 180;
  return { x: Math.sin(radians), y: 0, z: -Math.cos(radians) };
}

export function createHrtfPanner(ctx) {
  const panner = ctx.createPanner();
  
  
  
  const accepted = ["HRTF", "hrtf"].find((value) => {
    try {
      panner.panningModel = value;
    } catch {
      return false;
    }
    return panner.panningModel === value;
  });
  if (!accepted) {
    throw new Error("HRTF panning is not supported by this browser.");
  }
  
  
  panner.distanceModel = "linear";
  panner.refDistance = 1;
  panner.maxDistance = 10;
  panner.rolloffFactor = 0;
  panner.coneInnerAngle = 360;
  panner.coneOuterAngle = 360;
  panner.coneOuterGain = 0;
  return panner;
}

function smoothGain(ctx, param, value, time, tc = SMOOTH_SECONDS) {
  if (!param.cancelScheduledValues) return;
  param.cancelScheduledValues(time);
  param.setValueAtTime(param.value, time);
  param.setTargetAtTime(value, time, tc);
}




function makeLr4Lowpass(ctx, frequency) {
  const a = ctx.createBiquadFilter();
  a.type = "lowpass";
  a.frequency.value = frequency;
  a.Q.value = 0.7071067811865476;
  const b = ctx.createBiquadFilter();
  b.type = "lowpass";
  b.frequency.value = frequency;
  b.Q.value = 0.7071067811865476;
  a.connect(b);
  return b;
}









function makeDecorrChain(ctx, frequencies) {
  let first = null;
  let previous = null;
  for (const frequency of frequencies) {
    const filter = ctx.createBiquadFilter();
    filter.type = "allpass";
    filter.frequency.value = frequency;
    filter.Q.value = 0.7071067811865476;
    if (previous) previous.connect(filter);
    else first = filter;
    previous = filter;
  }
  return { input: first, output: previous };
}





export function buildVirtualGraph(ctx, sourceNode) {
  const passthrough = ctx.createGain();
  passthrough.gain.value = 0;
  sourceNode.connect(passthrough);
  passthrough.connect(ctx.destination);

  const splitter = ctx.createChannelSplitter(2);
  sourceNode.connect(splitter);

  const panners = {};
  for (const channel of CHANNELS) {
    panners[channel] = createHrtfPanner(ctx);
  }

  
  const connectInverted = (source, target) => {
    const inv = ctx.createGain();
    inv.gain.value = -1;
    source.connect(inv);
    inv.connect(target);
  };

  
  
  const lowL = makeLr4Lowpass(ctx, CROSSOVER_LOW_HZ);
  const lowR = makeLr4Lowpass(ctx, CROSSOVER_LOW_HZ);
  const hiL = makeLr4Lowpass(ctx, CROSSOVER_HIGH_HZ);
  const hiR = makeLr4Lowpass(ctx, CROSSOVER_HIGH_HZ);
  splitter.connect(lowL, 0);
  splitter.connect(lowR, 1);
  splitter.connect(hiL, 0);
  splitter.connect(hiR, 1);

  const bands = {
    lowL,
    lowR,
    midL: ctx.createGain(),
    midR: ctx.createGain(),
    highL: ctx.createGain(),
    highR: ctx.createGain(),
  };
  bands.midL.gain.value = 1;
  bands.midR.gain.value = 1;
  bands.highL.gain.value = 1;
  bands.highR.gain.value = 1;
  hiL.connect(bands.midL);
  connectInverted(lowL, bands.midL);
  hiR.connect(bands.midR);
  connectInverted(lowR, bands.midR);
  splitter.connect(bands.highL, 0);
  connectInverted(hiL, bands.highL);
  splitter.connect(bands.highR, 1);
  connectInverted(hiR, bands.highR);

  
  const midSum = ctx.createGain();
  midSum.gain.value = 0.5;
  bands.midL.connect(midSum);
  bands.midR.connect(midSum);

  const midDiff = ctx.createGain();
  midDiff.gain.value = 0.5;
  bands.midL.connect(midDiff);
  connectInverted(bands.midR, midDiff);

  const highDiff = ctx.createGain();
  highDiff.gain.value = 0.5;
  bands.highL.connect(highDiff);
  connectInverted(bands.highR, highDiff);

  
  const centerFeed = ctx.createGain();
  midSum.connect(centerFeed);

  
  
  const g = {};
  g.FL = ctx.createGain();
  g.FR = ctx.createGain();
  splitter.connect(g.FL, 0);
  splitter.connect(g.FR, 1);
  const centerToFront = ctx.createGain();
  centerToFront.gain.value = -FRONT_CENTER_REMOVE;
  centerFeed.connect(centerToFront);
  centerToFront.connect(g.FL);
  centerToFront.connect(g.FR);

  g.FL.connect(panners.FL);
  g.FR.connect(panners.FR);
  centerFeed.connect(panners.C);

  
  
  
  const apSL = makeDecorrChain(ctx, DECORRELATE_CHAIN_HZ.SL);
  const apSR = makeDecorrChain(ctx, DECORRELATE_CHAIN_HZ.SR);
  g.SL_mid = ctx.createGain();
  g.SL_high = ctx.createGain();
  g.SR_mid = ctx.createGain();
  g.SR_high = ctx.createGain();
  midDiff.connect(g.SL_mid);
  highDiff.connect(g.SL_high);
  midDiff.connect(g.SR_mid);
  highDiff.connect(g.SR_high);
  g.SL_mid.connect(apSL.input);
  g.SL_high.connect(apSL.input);
  g.SR_mid.connect(apSR.input);
  g.SR_high.connect(apSR.input);
  apSL.output.connect(panners.SL);
  apSR.output.connect(panners.SR);

  
  
  
  
  const midDiffToRear = ctx.createGain();
  midDiffToRear.gain.value = 1;
  const delayBL = ctx.createDelay(0.1);
  delayBL.delayTime.value = REAR_DELAY_SECONDS;
  const delayBR = ctx.createDelay(0.1);
  delayBR.delayTime.value = REAR_DELAY_SECONDS_BR;
  const apBL = makeDecorrChain(ctx, DECORRELATE_CHAIN_HZ.BL);
  const apBR = makeDecorrChain(ctx, DECORRELATE_CHAIN_HZ.BR);
  midDiff.connect(midDiffToRear);
  midDiffToRear.connect(delayBL);
  midDiffToRear.connect(delayBR);
  g.BL_mid = ctx.createGain();
  g.BL_high = ctx.createGain();
  g.BR_mid = ctx.createGain();
  g.BR_high = ctx.createGain();
  delayBL.connect(g.BL_mid);
  highDiff.connect(g.BL_high);
  delayBR.connect(g.BR_mid);
  highDiff.connect(g.BR_high);
  g.BL_mid.connect(apBL.input);
  g.BL_high.connect(apBL.input);
  g.BR_mid.connect(apBR.input);
  g.BR_high.connect(apBR.input);
  apBL.output.connect(panners.BL);
  apBR.output.connect(panners.BR);

  
  
  
  
  
  const lfeSum = ctx.createGain();
  lfeSum.gain.value = 0.5;
  bands.lowL.connect(lfeSum);
  bands.lowR.connect(lfeSum);
  g.LFE = ctx.createGain();
  lfeSum.connect(g.LFE);

  
  
  
  const trim = ctx.createGain();
  trim.gain.value = MASTER_TRIM;
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = LIMITER_THRESHOLD_DB;
  compressor.knee.value = 0;
  compressor.ratio.value = LIMITER_RATIO;
  compressor.attack.value = LIMITER_ATTACK;
  compressor.release.value = LIMITER_RELEASE;
  const master = ctx.createGain();
  master.gain.value = 0;

  for (const channel of CHANNELS) {
    panners[channel].connect(trim);
  }
  g.LFE.connect(trim);
  trim.connect(compressor);
  compressor.connect(master);
  master.connect(ctx.destination);

  return {
    passthrough,
    master,
    trim,
    compressor,
    panners,
    gains: g,
    bands,
    centerFeed,
    lfeFilter: g.LFE,
    splitter,
    delays: { BL: delayBL, BR: delayBR },
    allpass: { SL: apSL.output, SR: apSR.output, BL: apBL.output, BR: apBR.output },
  };
}

export function applyUpmixParams(ctx, nodes, params) {
  const { surround, center, lfe } = params;
  const g = nodes.gains;
  const t = ctx.currentTime;
  const set = (node, value) => smoothGain(ctx, node.gain, value, t);

  
  
  set(g.FL, 1);
  set(g.FR, 1);
  set(nodes.centerFeed, CENTER_MIX * center);
  
  
  set(g.SL_mid, SURROUND_MIX * surround);
  set(g.SL_high, SIDE_HIGH_MIX * surround);
  set(g.SR_mid, SR_MID_MIX * surround);
  set(g.SR_high, SR_HIGH_MIX * surround);
  set(g.BL_mid, REAR_MID_MIX * surround);
  set(g.BL_high, REAR_HIGH_MIX * surround);
  set(g.BR_mid, BR_MID_MIX * surround);
  set(g.BR_high, BR_HIGH_MIX * surround);
  set(g.LFE, LFE_LEVEL * lfe);
}

export function applyHrtfProfile(ctx, nodes, profile) {
  const azimuths = profile.azimuths;
  for (const channel of CHANNELS) {
    const panner = nodes.panners[channel];
    const pos = azimuthToPosition(azimuths[channel]);
    panner.positionX.value = pos.x;
    panner.positionY.value = pos.y;
    panner.positionZ.value = pos.z;
  }
}



export function crossfadeBranches(ctx, nodes, toVirtual, volume) {
  const t = ctx.currentTime;
  const master = nodes.master.gain;
  const passthrough = nodes.passthrough.gain;
  const target = clamp(volume, 0, 1);

  master.cancelScheduledValues(t);
  passthrough.cancelScheduledValues(t);
  master.setValueAtTime(master.value, t);
  passthrough.setValueAtTime(passthrough.value, t);
  master.linearRampToValueAtTime(toVirtual ? target : 0, t + CROSSFADE_SECONDS);
  passthrough.linearRampToValueAtTime(toVirtual ? 0 : target, t + CROSSFADE_SECONDS);
}




export function setBranchVolume(ctx, nodes, virtualActive, volume) {
  const t = ctx.currentTime;
  const target = clamp(volume, 0, 1);
  if (virtualActive) {
    smoothGain(ctx, nodes.master.gain, target, t);
  } else {
    smoothGain(ctx, nodes.passthrough.gain, target, t);
  }
}





export class VirtualSurround {
  constructor(video) {
    this.video = video;
    this.context = null;
    this.source = null;
    this.nodes = null;
    this.mode = SURROUND_MODES.original;
    this.profileId = HRTF_PROFILE_DEFAULT;
    this.params = { ...DEFAULT_PARAMS };
    this.volume = 1;
    this.destroyed = false;
    this._initPromise = null;
    this.monitorTaps = null;
  }

  get active() {
    return this.context !== null;
  }

  get profile() {
    return HRTF_PROFILES.find((p) => p.id === this.profileId) || HRTF_PROFILES[0];
  }

  async setMode(mode) {
    if (this.destroyed) return;
    this.mode = mode;
    if (mode === SURROUND_MODES.virtual) {
      await this.ensureInit();
      if (this.context.state === "suspended") {
        await this.resume();
      }
      this.setBranch("virtual");
    } else if (this.active) {
      this.setBranch("passthrough");
    }
  }

  setVolume(volume) {
    this.volume = clamp(volume, 0, 1);
    if (!this.active || !this.nodes) return;
    const virtualActive = this.mode === SURROUND_MODES.virtual;
    setBranchVolume(this.context, this.nodes, virtualActive, this.volume);
  }

  setParams(partial) {
    Object.assign(this.params, partial);
    if (this.active && this.nodes) this.applyParams();
  }

  setProfile(profileId) {
    this.profileId = HRTF_PROFILES.some((p) => p.id === profileId) ? profileId : HRTF_PROFILE_DEFAULT;
    if (this.active && this.nodes) this.applyProfile();
  }

  async resume() {
    if (!this.context || this.context.state === "closed") return;
    if (this.context.state !== "running") {
      try {
        await this.context.resume();
      } catch {
        
      }
    }
  }

  async suspend() {
    if (!this.context || this.context.state === "closed") return;
    if (this.context.state === "running") {
      try {
        await this.context.suspend();
      } catch {
        
      }
    }
  }

  ensureInit() {
    if (this.active) return Promise.resolve();
    if (this._initPromise) return this._initPromise;
    this._initPromise = this._doInit().finally(() => {
      this._initPromise = null;
    });
    return this._initPromise;
  }

  async _doInit() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) throw new Error("Web Audio API is not supported by this browser.");

    const ctx = new Ctx();
    this.context = ctx;
    try {
      
      
      
      
      this._savedElementVolume = this.video.volume;
      this._savedElementMuted = this.video.muted;
      this.video.volume = 1;
      this.video.muted = false;

      this.buildGraph();
      this.applyParams();
      this.applyProfile();
    } catch (error) {
      this.video.volume = this._savedElementVolume;
      this.video.muted = this._savedElementMuted;
      try {
        await ctx.close();
      } catch {
        
      }
      this.context = null;
      this.source = null;
      this.nodes = null;
      throw error;
    }
  }

  buildGraph() {
    const source = this.context.createMediaElementSource(this.video);
    this.source = source;
    this.nodes = buildVirtualGraph(this.context, source);
  }

  applyParams() {
    if (!this.nodes) return;
    applyUpmixParams(this.context, this.nodes, this.params);
  }

  applyProfile() {
    if (!this.nodes) return;
    applyHrtfProfile(this.context, this.nodes, this.profile);
  }

  setBranch(branch) {
    if (!this.nodes) return;
    crossfadeBranches(this.context, this.nodes, branch === "virtual", this.volume);
  }

  
  
  
  
  
  
  
  

  getMonitorChannels() {
    if (!this.active || !this.nodes || !this.context) return null;
    if (this.monitorTaps) return this.monitorTaps;
    const ctx = this.context;
    const n = this.nodes;
    const analyser = (node) => {
      const a = ctx.createAnalyser();
      a.fftSize = 2048;
      node.connect(a);
      return a;
    };
    const channels = {
      
      FL: analyser(n.gains.FL),
      FR: analyser(n.gains.FR),
      C: analyser(n.centerFeed),
      SL: analyser(n.allpass.SL),
      SR: analyser(n.allpass.SR),
      BL: analyser(n.allpass.BL),
      BR: analyser(n.allpass.BR),
      
      
      LFE: analyser(n.gains.LFE),
    };
    const splitter = ctx.createChannelSplitter(2);
    n.master.connect(splitter);
    const masterL = ctx.createAnalyser();
    masterL.fftSize = 2048;
    const masterR = ctx.createAnalyser();
    masterR.fftSize = 2048;
    splitter.connect(masterL, 0, 0);
    splitter.connect(masterR, 1, 0);
    this.monitorTaps = { channels, masterL, masterR, splitter };
    return this.monitorTaps;
  }

  releaseMonitorChannels() {
    if (!this.monitorTaps || !this.nodes) return;
    const taps = this.monitorTaps;
    const n = this.nodes;
    const detach = (source, analyser) => {
      try {
        source.disconnect(analyser);
      } catch {
        
      }
    };
    detach(n.gains.FL, taps.channels.FL);
    detach(n.gains.FR, taps.channels.FR);
    detach(n.centerFeed, taps.channels.C);
    detach(n.allpass.SL, taps.channels.SL);
    detach(n.allpass.SR, taps.channels.SR);
    detach(n.allpass.BL, taps.channels.BL);
    detach(n.allpass.BR, taps.channels.BR);
    detach(n.gains.LFE, taps.channels.LFE);
    try {
      n.master.disconnect(taps.splitter);
    } catch {
      
    }
    this.monitorTaps = null;
  }

  
  
  
  
  
  

  runChannelTest(onStep) {
    if (!this.active || !this.nodes) {
      return Promise.reject(new Error("Virtual 7.1 must be active to run the channel test."));
    }
    const sequence = [
      { channel: "FL", freq: 440, label: "Front Left", azimuth: -50 },
      { channel: "C", freq: 523.25, label: "Center", azimuth: 0 },
      { channel: "FR", freq: 587.33, label: "Front Right", azimuth: 50 },
      { channel: "SL", freq: 659.25, label: "Side Left", azimuth: -90 },
      { channel: "SR", freq: 698.46, label: "Side Right", azimuth: 90 },
      { channel: "BL", freq: 783.99, label: "Back Left", azimuth: -140 },
      { channel: "BR", freq: 880, label: "Back Right", azimuth: 140 },
      { channel: "LFE", freq: 110, label: "Subwoofer", azimuth: null },
    ];

    
    
    
    
    
    const injectAt = {
      FL: this.nodes.gains.FL,
      FR: this.nodes.gains.FR,
      C: this.nodes.centerFeed,
      SL: this.nodes.allpass.SL,
      SR: this.nodes.allpass.SR,
      BL: this.nodes.allpass.BL,
      BR: this.nodes.allpass.BR,
      LFE: this.nodes.gains.LFE,
    };

    const ctx = this.context;
    const stepSeconds = 0.7;
    const gapSeconds = 0.15;
    const t0 = ctx.currentTime + 0.05;
    const totalSeconds = stepSeconds * sequence.length + gapSeconds * (sequence.length - 1);

    sequence.forEach((step, index) => {
      const start = t0 + index * (stepSeconds + gapSeconds);
      if (step.azimuth !== null) {
        const panner = this.nodes.panners[step.channel];
        const pos = azimuthToPosition(step.azimuth);
        panner.positionX.setValueAtTime(pos.x, start);
        panner.positionY.setValueAtTime(pos.y, start);
        panner.positionZ.setValueAtTime(pos.z, start);
      }

      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = step.freq;
      const gain = ctx.createGain();
      const end = start + stepSeconds - 0.02;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.6, start + 0.03);
      gain.gain.setValueAtTime(0.6, end);
      gain.gain.linearRampToValueAtTime(0.0001, end + 0.02);
      osc.connect(gain);
      gain.connect(injectAt[step.channel] || this.nodes.panners[step.channel]);
      osc.start(start);
      osc.stop(start + stepSeconds);

      const delayMs = Math.max(0, (start - ctx.currentTime) * 1000);
      window.setTimeout(() => {
        if (onStep) onStep(step, index, sequence.length);
      }, delayMs);
    });

    
    window.setTimeout(() => {
      if (!this.destroyed && this.active && this.nodes) {
        this.applyProfile();
      }
    }, (t0 - ctx.currentTime + totalSeconds) * 1000 + 200);

    return Promise.resolve();
  }

  async destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.active) {
      this.releaseMonitorChannels();
      try {
        await this.context.close();
      } catch {
        
      }
    }
    this.context = null;
    this.source = null;
    this.nodes = null;
    this._initPromise = null;
  }
}
