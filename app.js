const $=x=>document.getElementById(x);
const state={ws:null,userId:localStorage.olow_uid||crypto.randomUUID(),userName:localStorage.olow_name||"Diego",server:null,members:[],stream:null,peers:new Map(),muted:false,camOff:false,screenStream:null};
localStorage.olow_uid=state.userId;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function toast(t){$("toast").textContent=t;$("toast").style.display="block";clearTimeout(window.tt);window.tt=setTimeout(()=>$("toast").style.display="none",2500)}
function send(x){if(state.ws?.readyState===1)state.ws.send(JSON.stringify(x))}
function connect(){state.ws=new WebSocket((location.protocol==="https:"?"wss://":"ws://")+location.host);state.ws.onopen=()=>send({type:"list"});state.ws.onmessage=e=>handle(JSON.parse(e.data));state.ws.onclose=()=>setTimeout(connect,1500)}
function handle(m){
 if(m.type==="server-list")renderServers(m.servers);
 if(m.type==="created"||m.type==="joined"){state.server=m.server;state.members=m.members||[];renderServer();renderMembers();$("modal").classList.add("hidden");$("createModal").classList.add("hidden");toast(m.type==="created"?"Servidor criado!":"Você entrou no servidor!")}
 if(m.type==="error")toast(m.message);
 if(m.type==="user-joined"){state.members.push(m.user);renderMembers();toast(m.user.name+" entrou");}
 if(m.type==="user-left"){state.members=state.members.filter(x=>x.id!==m.id);renderMembers();removePeer(m.id)}
 if(m.type==="chat")addMessage(m.name,m.text);
 if(m.type==="signal")onSignal(m.from,m.signal);
}
function renderServer(){$("serverName").textContent=state.server?.name||"0low Connect";$("serverInfo").textContent=state.server?`Código: ${state.server.code} • ${state.members.length} membro(s)`:"Escolha um servidor";$("input").disabled=!state.server;$("input").placeholder=state.server?"Mensagem em #geral":"Entre em um servidor primeiro"}
function renderMembers(){$("memberList").innerHTML=state.members.map(u=>`<div class="member"><div class="avatar">${esc(u.name[0]||"?")}</div><b>${esc(u.name)}</b></div>`).join("");renderServer()}
function renderServers(list){$("serverList").innerHTML=list.length?list.map(s=>`<div class="serverItem"><div><b>${esc(s.name)}</b><br><small>${s.members} membro(s) • ${s.code}</small></div><button data-code="${s.code}">Entrar</button></div>`).join(""):"<p style='color:#888'>Nenhum servidor online.</p>";$("serverList").querySelectorAll("button").forEach(x=>x.onclick=()=>join(x.dataset.code))}
function join(code){code=String(code||"").trim().toLowerCase();if(!code)return toast("Digite o código.");send({type:"join",code,userId:state.userId,userName:state.userName})}
function addMessage(name,text){document.querySelector(".welcome")?.remove();const d=document.createElement("div");d.className="member";d.innerHTML=`<div class="avatar">${esc(name[0]||"?")}</div><div><b>${esc(name)}</b><div>${esc(text)}</div></div>`;$("messages").appendChild(d);$("messages").scrollTop=$("messages").scrollHeight}
$("newServer").onclick=()=>{$("createModal").classList.remove("hidden");$("serverNameInput").focus()};
$("closeCreate").onclick=()=>$("createModal").classList.add("hidden");
$("create").onclick=()=>send({type:"create",name:$("serverNameInput").value.trim()||"Meu servidor",userId:state.userId,userName:state.userName});
$("discover").onclick=()=>{send({type:"list"});$("modal").classList.remove("hidden")};
$("close").onclick=()=>$("modal").classList.add("hidden");
$("joinCode").onclick=()=>join($("serverCode").value);
$("members").onclick=()=>$("memberPanel").classList.toggle("hidden");
$("invite").onclick=async()=>{if(!state.server)return toast("Entre em um servidor primeiro.");const link=location.origin+"/?server="+state.server.code;try{await navigator.clipboard.writeText(link);toast("Convite copiado!")}catch{prompt("Envie este link:",link)}};
$("chat").onsubmit=e=>{e.preventDefault();const v=$("input").value.trim();if(v&&state.server){send({type:"chat",text:v});$("input").value=""}};
$("closeCall").onclick=leaveCall;$("leave").onclick=leaveCall;$("mute").onclick=()=>{state.muted=!state.muted;if(state.stream)state.stream.getAudioTracks().forEach(t=>t.enabled=!state.muted);$("mute").textContent=state.muted?"🔇":"🎙️"};
$("camera").onclick=()=>{state.camOff=!state.camOff;if(state.stream)state.stream.getVideoTracks().forEach(t=>t.enabled=!state.camOff);$("camera").textContent=state.camOff?"🚫":"📷"};
$("screen").onclick=shareScreen;
$("callHint").textContent="Toque em 🎙️ ou 📷 para ativar. A tela depende do suporte do navegador.";
async function enterCall(){if(!state.server)return toast("Entre em um servidor primeiro.");$("call").classList.remove("hidden");try{state.stream=await navigator.mediaDevices.getUserMedia({audio:true,video:true});addVideo(state.userId,state.userName,state.stream,true);send({type:"call-state",kind:"join"});for(const u of state.members){if(u.id!==state.userId)await makeOffer(u.id)}}catch(e){toast("Permissão de câmera/microfone negada ou indisponível.");}}
function makePeer(id){if(state.peers.has(id))return state.peers.get(id);const pc=new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"},{urls:"stun:stun.cloudflare.com:3478"}]});if(state.stream)state.stream.getTracks().forEach(t=>pc.addTrack(t,state.stream));pc.onicecandidate=e=>{if(e.candidate)send({type:"signal",to:id,signal:{candidate:e.candidate}})};pc.ontrack=e=>addVideo(id,memberName(id),e.streams[0]);pc.onconnectionstatechange=()=>{if(["failed","closed","disconnected"].includes(pc.connectionState))removePeer(id)};state.peers.set(id,pc);return pc}
async function makeOffer(id){const pc=makePeer(id);const o=await pc.createOffer();await pc.setLocalDescription(o);send({type:"signal",to:id,signal:{sdp:pc.localDescription}})}
async function onSignal(from,s){const pc=makePeer(from);if(s.sdp){await pc.setRemoteDescription(s.sdp);if(s.sdp.type==="offer"){const a=await pc.createAnswer();await pc.setLocalDescription(a);send({type:"signal",to:from,signal:{sdp:pc.localDescription}})}}else if(s.candidate){try{await pc.addIceCandidate(s.candidate)}catch{} }}
function memberName(id){return state.members.find(x=>x.id===id)?.name||"Usuário"}
function addVideo(id,name,stream,local=false){let tile=$("v-"+id);if(!tile){tile=document.createElement("div");tile.className="videoTile";tile.id="v-"+id;tile.innerHTML=`<video ${local?"muted":""} autoplay playsinline></video><div class="videoName">${esc(name)}${local?" (você)":""}</div>`;$("videoGrid").appendChild(tile)}tile.querySelector("video").srcObject=stream}
function removePeer(id){state.peers.get(id)?.close();state.peers.delete(id);$("v-"+id)?.remove()}
async function shareScreen(){if(!navigator.mediaDevices?.getDisplayMedia)return toast("Compartilhamento de tela não é suportado neste navegador.");try{const s=await navigator.mediaDevices.getDisplayMedia({video:true,audio:false});state.screenStream=s;const track=s.getVideoTracks()[0];for(const pc of state.peers.values()){const sender=pc.getSenders().find(x=>x.track?.kind==="video");if(sender)await sender.replaceTrack(track)}track.onended=stopScreen;const tile=$("v-"+state.userId);if(tile)tile.querySelector("video").srcObject=s;toast("Compartilhamento de tela iniciado.")}catch{toast("Compartilhamento cancelado ou bloqueado pelo navegador.")}}
function stopScreen(){if(!state.screenStream)return;const track=state.stream?.getVideoTracks()[0];for(const pc of state.peers.values()){const sender=pc.getSenders().find(x=>x.track?.kind==="video");if(sender) sender.replaceTrack(track||null)}state.screenStream.getTracks().forEach(t=>t.stop());state.screenStream=null;if(state.stream){const tile=$("v-"+state.userId);if(tile)tile.querySelector("video").srcObject=state.stream}}
function leaveCall(){stopScreen();state.peers.forEach(p=>p.close());state.peers.clear();state.stream?.getTracks().forEach(t=>t.stop());state.stream=null;$("videoGrid").innerHTML="";$("call").classList.add("hidden");send({type:"call-state",kind:"leave"})}
const q=new URLSearchParams(location.search);if(q.get("server"))setTimeout(()=>join(q.get("server")),700);
connect();
document.addEventListener("click",e=>{if(e.target.closest("#serverName")||e.target.closest("#serverInfo"))return});
const callBtn=document.createElement("button");callBtn.textContent="🔊 Call";callBtn.style.cssText="position:fixed;right:16px;bottom:75px;background:#c83ddd;color:#fff;border:0;border-radius:12px;padding:13px 18px;z-index:10";document.body.appendChild(callBtn);callBtn.onclick=enterCall;