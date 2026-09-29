import type { Snapshot } from './types';

/** A restored result never emits a new reveal cue. */
export class DrawSoundTracker {
  private active: string | null = null;
  update(snapshot: Snapshot): 'shuffle' | 'reveal' | 'stop' {
    const key = snapshot.activeDraw ? `${snapshot.sessionId}/${snapshot.activeDraw.draw.id}` : null;
    const previous = this.active; this.active = key;
    if (key) return 'shuffle';
    return previous && snapshot.history.some(draw => `${snapshot.sessionId}/${draw.id}` === previous) ? 'reveal' : 'stop';
  }
}
export interface SoundPreferences { enabled: boolean; music: number; effects: number }
const clamp=(n:number)=>Number.isFinite(n)?Math.min(1,Math.max(0,n)):0.5;
export function readSoundPreferences():SoundPreferences {
  try {
    const saved=JSON.parse(localStorage.getItem('whizreveal.sound-mix')??'{}');
    return {enabled:localStorage.getItem('whizreveal.sound-enabled')!=='false',music:typeof saved.music==='number'?clamp(saved.music):.35,effects:typeof saved.effects==='number'?clamp(saved.effects):.65};
  } catch {return {enabled:true,music:.35,effects:.65};}
}
export function saveSoundPreferences(p:SoundPreferences) {
  try {localStorage.setItem('whizreveal.sound-enabled',String(p.enabled));localStorage.setItem('whizreveal.sound-mix',JSON.stringify({music:clamp(p.music),effects:clamp(p.effects)}));}catch{/* Optional storage. */}
}

/** Original layered score, synthesized offline. One engine is shared by welcome and controller. */
export class DrawSound {
  private context:AudioContext|null=null;
  private master:GainNode|null=null;
  private music:GainNode|null=null;
  private effects:GainNode|null=null;
  private reverb:ConvolverNode|null=null;
  private voices=new Map<AudioScheduledSourceNode, 'music'|'effects'>();
  private timer:ReturnType<typeof setInterval>|null=null;
  private ambience:ReturnType<typeof setInterval>|null=null;
  private generation=0;
  private drawKey='';
  private musicLevel=.35;
  private effectsLevel=.65;

  unlock() {
    try {
      if(!this.context){
        const ctx=new AudioContext();this.context=ctx;
        this.master=ctx.createGain();this.master.gain.value=.7;
        const limiter=ctx.createDynamicsCompressor();limiter.threshold.value=-15;limiter.knee.value=20;limiter.ratio.value=6;limiter.attack.value=.004;limiter.release.value=.25;
        this.master.connect(limiter);limiter.connect(ctx.destination);
        this.music=ctx.createGain();this.effects=ctx.createGain();this.music.connect(this.master);this.effects.connect(this.master);
        this.reverb=ctx.createConvolver();const impulse=ctx.createBuffer(2,Math.floor(ctx.sampleRate*2.8),ctx.sampleRate);
        // Deterministic stereo room, generated locally once per audio context.
        let seed=719;
        for(let channel=0;channel<2;channel++){const data=impulse.getChannelData(channel);for(let i=0;i<data.length;i++){seed=(seed*16807)%2147483647;data[i]=(seed/2147483647*2-1)*Math.pow(1-i/data.length,3);}}
        this.music.connect(this.reverb);this.effects.connect(this.reverb);
        this.reverb.buffer=impulse;const wet=ctx.createGain();wet.gain.value=.19;this.reverb.connect(wet);wet.connect(this.master);
      }
      this.master!.gain.setTargetAtTime(.7,this.context.currentTime,.04);
      this.setVolumes(this.musicLevel,this.effectsLevel);
      void this.context.resume().catch(()=>{});
    }catch{this.dispose();}
  }
  setVolumes(music:number,effects:number){this.musicLevel=clamp(music);this.effectsLevel=clamp(effects);const t=this.context?.currentTime??0;this.music?.gain.setTargetAtTime(this.musicLevel,t,.05);this.effects?.gain.setTargetAtTime(this.effectsLevel,t,.05);}
  private tone(frequency:number,duration:number,volume:number,delay=0,bus:'music'|'effects'='effects',wave:OscillatorType='sine',attack=.015,detune=0){
    const ctx=this.context;if(!ctx||ctx.state!=='running')return;
    const source=ctx.createOscillator(),gain=ctx.createGain(),filter=ctx.createBiquadFilter();
    const start=ctx.currentTime+delay;source.type=wave;source.frequency.setValueAtTime(frequency,start);source.detune.value=detune;
    filter.type='lowpass';filter.frequency.value=bus==='music'?950:2200;
    gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(volume,start+Math.min(attack,duration*.4));gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
    source.connect(filter);filter.connect(gain);gain.connect(bus==='music'?this.music!:this.effects!);
    this.voices.set(source,bus);
    source.onended=()=>{this.voices.delete(source);source.disconnect();filter.disconnect();gain.disconnect();};
    source.start(start);source.stop(start+duration+.03);
  }
  private pad(duration=5,delay=0){[73.416,110,146.832,174.614].forEach((f,i)=>this.tone(f,duration,.032,delay+i*.045,'music','triangle',.7,i%2?4:-4));}
  private afterUnlock(callback:()=>void){this.unlock();const generation=this.generation;void this.context?.resume().then(()=>{if(generation===this.generation)callback();}).catch(()=>{});}
  intro(){this.afterUnlock(()=>{this.pad(5.5);this.tone(55,2.6,.12,0,'effects','sine',.1);[293.665,349.228,440,587.33].forEach((f,i)=>this.tone(f,3.8,.055,.5+i*.2,'effects','triangle',.3));this.startAmbience();});}
  startAmbience(){if(this.ambience||!this.context||this.context.state!=='running')return;this.pad();this.ambience=setInterval(()=>this.pad(),4200);}
  click(){this.afterUnlock(()=>{this.tone(440,.14,.09);this.tone(73.416,.45,.11);this.startAmbience();});}
  shuffle(startedAt:number,duration:number){
    const key=`${startedAt}/${duration}`;if(this.drawKey===key&&this.timer)return;
    this.clearDraw();this.drawKey=key;let lastBeat=-1,lastPad=-1;
    const tick=()=>{
      const elapsed=Date.now()-startedAt,progress=Math.max(0,elapsed/duration);
      if(progress>=1){this.clearDraw();return;}
      // Reserve a short breath immediately before the actual reveal.
      if(duration-elapsed<Math.min(240,duration*.12))return;
      const beat=Math.floor(elapsed/(330-progress*150));
      if(beat!==lastBeat){lastBeat=beat;this.tone(146.832*(beat%4===3?1.5:1),.23,.045+progress*.035,0,'effects','triangle');this.tone(55+progress*18,.18,.045);}
      const pad=Math.floor(elapsed/3000);if(pad!==lastPad){lastPad=pad;this.tone(220+progress*73.665,Math.min(3,(duration-elapsed)/1000),.035,0,'effects','triangle',.35);}
    };
    tick();this.timer=setInterval(tick,70);
  }
  reveal(){
    this.clearDraw();this.stopVoices('effects');
    this.tone(49,1.9,.22,0,'effects','sine',.008);
    [146.832,220,293.665,369.994,440,587.33].forEach((f,i)=>this.tone(f,2.7,.06,i*.035,'effects',i<2?'sine':'triangle',.025));
  }
  test(){this.afterUnlock(()=>{this.reveal();this.pad(3);});}
  private clearDraw(){if(this.timer)clearInterval(this.timer);this.timer=null;this.drawKey='';}
  private stopVoices(bus?:'music'|'effects'){for(const [voice,type] of this.voices){if(!bus||bus===type){try{voice.stop();}catch{/* Already ended. */}this.voices.delete(voice);}}}
  stop(){this.generation++;this.clearDraw();if(this.ambience)clearInterval(this.ambience);this.ambience=null;this.stopVoices();if(this.master&&this.context)this.master.gain.setValueAtTime(0,this.context.currentTime);}
  dispose(){this.stop();void this.context?.close().catch(()=>{});this.context=null;this.master=null;this.music=null;this.effects=null;this.reverb=null;}
}
let shared:DrawSound|null=null;
export function getDrawSound(){return shared??=new DrawSound();}
export function beginWelcomeAudio(enabled:boolean){const prefs={...readSoundPreferences(),enabled};saveSoundPreferences(prefs);const sound=getDrawSound();sound.stop();sound.setVolumes(prefs.music,prefs.effects);if(enabled)sound.intro();}
