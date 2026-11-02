// Synthetic native port for product/SQL integration. No SDK/provider/hardware execution.
function nativePort(user, joined) {
  const handles=new Map();let selectedDeviceId='ear';
  return {
    handles,
    sdk:{
      createClient(){return{async disconnectUser(){},call(type,id){
        const state={callingState:'idle',microphoneStatus:'disabled',cameraStatus:'disabled',audioPublishing:false,videoPublishing:false,publisherPresent:false,subscriberPresent:false};
        const listeners=new Set(),media=new Set(),tracks=[];
        const emit=()=>{for(const fn of listeners)fn(state.callingState);};
        const handle={id,type,cid:`${type}:${id}`,state:()=>({...state}),tracks:()=>({microphone:tracks,camera:[],remote:[]}),
          observeState(fn){listeners.add(fn);return()=>listeners.delete(fn);},observeMedia(fn){media.add(fn);return()=>media.delete(fn);},
          async enableMicrophone(){state.microphoneStatus='enabled';state.audioPublishing=true;tracks.push({enabled:true,readyState:'live',stop(){this.readyState='ended';},release(){}});for(const fn of media)fn();},
          async disableMicrophone(){state.microphoneStatus='disabled';state.audioPublishing=false;},async disableCamera(){state.cameraStatus='disabled';},
          async disposePublisher(){state.publisherPresent=false;state.audioPublishing=false;},async disposeSubscriber(){state.subscriberPresent=false;},
          async join(){state.callingState='joined';state.publisherPresent=true;state.subscriberPresent=true;joined(id,user,true);emit();},
          async leave(){state.callingState='left';state.publisherPresent=false;state.subscriberPresent=false;joined(id,user,false);emit();},
        };handles.set(id,handle);return handle;
      }};},
      audio:()=>({configure(){},clearConfiguration(){},devices:async()=>({devices:[{id:'ear',type:'Earpiece'},{id:'speaker',type:'Speaker'}],selectedDeviceId}),
        select(id){selectedDeviceId=id;},observeDevices:()=>()=>{},observeInterruption:()=>()=>{}}),
    },
  };
}
module.exports={nativePort};
