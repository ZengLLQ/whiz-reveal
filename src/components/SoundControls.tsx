import { useEffect, useRef, useState } from 'react';
import { SlidersHorizontal, Volume2, VolumeX, X, Play } from 'lucide-react';
import type { DrawSoundControls } from '../hooks/useDrawSound';
import '../sound-controls.css';
export function SoundControls({sound,drawing=false}:{sound:DrawSoundControls;drawing?:boolean}){
  const [open,setOpen]=useState(false);const dialog=useRef<HTMLDialogElement>(null);const trigger=useRef<HTMLButtonElement>(null);
  useEffect(()=>{if(open)dialog.current?.showModal();else dialog.current?.close();},[open]);
  function close(){setOpen(false);trigger.current?.focus();}
  return <div className="sound-controls">
    <button className="secondary-button sound-button" onClick={sound.toggle} aria-pressed={sound.enabled} aria-label={sound.enabled?'Mute draw sounds':'Enable draw sounds'}>{sound.enabled?<Volume2 size={16}/>:<VolumeX size={16}/>}<span>Sound {sound.enabled?'on':'off'}</span></button>
    <button ref={trigger} className="sound-settings-trigger" aria-label="Sound settings" title="Sound settings" onClick={()=>setOpen(true)}><SlidersHorizontal size={15}/></button>
    <dialog ref={dialog} className="sound-dialog" aria-labelledby="sound-dialog-title" onCancel={close} onClose={()=>setOpen(false)}>
      <div className="sound-dialog-heading"><div><p>Set the atmosphere</p><h2 id="sound-dialog-title">Sound settings</h2></div><button aria-label="Close sound settings" onClick={close}><X size={18}/></button></div>
      <label htmlFor="music-volume">Music <output>{Math.round(sound.musicVolume*100)}%</output></label>
      <input id="music-volume" type="range" min="0" max="1" step=".05" value={sound.musicVolume} onChange={e=>sound.setMusicVolume(Number(e.target.value))}/>
      <p>Ambient layers and the opening score.</p>
      <label htmlFor="effects-volume">Effects <output>{Math.round(sound.effectsVolume*100)}%</output></label>
      <input id="effects-volume" type="range" min="0" max="1" step=".05" value={sound.effectsVolume} onChange={e=>sound.setEffectsVolume(Number(e.target.value))}/>
      <p>Draw tension and the final reveal.</p>
      <div className="sound-dialog-actions"><button className="secondary-button" onClick={sound.toggle}>{sound.enabled?'Mute all':'Enable sound'}</button><button className="primary-button" disabled={!sound.enabled||drawing} onClick={sound.test}><Play size={14}/>Test sound</button></div>
      <p className="sound-output-note">Plays through this computer’s selected audio output.</p>
    </dialog>
  </div>;
}
