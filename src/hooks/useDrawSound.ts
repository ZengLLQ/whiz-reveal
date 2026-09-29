import { useCallback, useEffect, useRef, useState } from 'react';
import { getDrawSound, DrawSoundTracker, readSoundPreferences, saveSoundPreferences } from '../lib/draw-sound';
import type { Snapshot } from '../lib/types';
export function useDrawSound(snapshot:Snapshot){
  const [preferences,setPreferences]=useState(readSoundPreferences);
  const tracker=useRef(new DrawSoundTracker());
  const session=useRef(snapshot.sessionId);
  const engine=getDrawSound();
  useEffect(()=>{
    const cue=tracker.current.update(snapshot);
    if(session.current!==snapshot.sessionId){engine.stop();session.current=snapshot.sessionId;}
    if(!preferences.enabled){engine.stop();return;}
    engine.setVolumes(preferences.music,preferences.effects);
    if(cue==='shuffle'&&snapshot.activeDraw)engine.shuffle(snapshot.activeDraw.startedAt,snapshot.activeDraw.durationMs);
    else if(cue==='reveal')engine.reveal();
  },[snapshot,preferences,engine]);
  const click=useCallback(()=>{if(preferences.enabled)engine.click();},[preferences.enabled,engine]);
  function update(p:typeof preferences){setPreferences(p);saveSoundPreferences(p);engine.setVolumes(p.music,p.effects);}
  function toggle(){const enabled=!preferences.enabled;update({...preferences,enabled});if(enabled)engine.unlock();else engine.stop();}
  return {enabled:preferences.enabled,toggle,click,musicVolume:preferences.music,effectsVolume:preferences.effects,
    setMusicVolume:(music:number)=>update({...preferences,music}),setEffectsVolume:(effects:number)=>update({...preferences,effects}),
    test:()=>{if(preferences.enabled)engine.test();}};
}
export type DrawSoundControls=ReturnType<typeof useDrawSound>;
