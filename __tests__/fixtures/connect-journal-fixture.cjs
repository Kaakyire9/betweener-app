const id = n => `a0550000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function entry(n=1,patch={}) {
  return {call:{id:id(n+100),caller_profile_id:id(1),recipient_profile_id:id(2),media:'voice',authorization:'matched',state:'ENDED',version:5,
    created_at:'2026-11-05T10:00:00.000Z',accepted_at:'2026-11-05T10:00:02.000Z',connected_at:'2026-11-05T10:00:04.000Z',ended_at:'2026-11-05T10:12:28.000Z',deadline:null,reason:'provider_cleanup',duration_seconds:744,...patch},
    direction:'outgoing',peer:{profileId:id(2),userId:id(4),name:'Dufie',avatar:null,available:true,blocked:false,chatVisible:true},cleanup:'acknowledged',redialAllowed:true};
}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
module.exports={id,entry,deferred};
