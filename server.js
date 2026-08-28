import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const app=express(), server=http.createServer(app), wss=new WebSocketServer({server}), rooms=new Map();
const id=()=>crypto.randomBytes(4).toString("hex");
const clean=(v,n)=>String(v??"").trim().slice(0,n);
const list=()=>[...rooms.values()].map(r=>({code:r.code,name:r.name,members:r.clients.size}));
const send=(ws,x)=>ws.readyState===1&&ws.send(JSON.stringify(x));
const broadcast=(r,x,except)=>r.clients.forEach(u=>u.id!==except&&send(u.ws,x));
app.use(express.static(__dirname));
app.get("/",(_,res)=>res.sendFile(path.join(__dirname,"index.html")));
app.get("/api/health",(_,res)=>res.json({ok:true,servers:rooms.size}));
wss.on("connection",ws=>{
 let room=null,user=null;
 ws.on("message",raw=>{
  let m;try{m=JSON.parse(raw.toString())}catch{return}
  if(m.type==="list")return send(ws,{type:"server-list",servers:list()});
  if(m.type==="create"){
   room={code:id(),name:clean(m.name,40)||"Meu servidor",clients:new Map()};
   rooms.set(room.code,room);
   user={id:clean(m.userId,80)||id(),name:clean(m.userName,24)||"Usuário",ws};
   room.clients.set(user.id,user);
   return send(ws,{type:"created",server:{code:room.code,name:room.name},members:[]});
  }
  if(m.type==="join"){
   const target=rooms.get(clean(m.code,32).toLowerCase());
   if(!target)return send(ws,{type:"error",message:"Servidor não encontrado ou está offline."});
   room=target;
   user={id:clean(m.userId,80)||id(),name:clean(m.userName,24)||"Usuário",ws};
   const members=[...room.clients.values()].map(u=>({id:u.id,name:u.name}));
   room.clients.set(user.id,user);
   send(ws,{type:"joined",server:{code:room.code,name:room.name},members});
   return broadcast(room,{type:"user-joined",user:{id:user.id,name:user.name}},user.id);
  }
  if(!room||!user)return;
  if(m.type==="chat")return broadcast(room,{type:"chat",id:user.id,name:user.name,text:clean(m.text,2000)});
  if(m.type==="signal"){
   const t=room.clients.get(clean(m.to,80));
   if(t)send(t.ws,{type:"signal",from:user.id,signal:m.signal});
  }
  if(m.type==="call-state")broadcast(room,{type:"call-state",id:user.id,kind:m.kind});
 });
 ws.on("close",()=>{
  if(!room||!user)return;
  room.clients.delete(user.id);
  broadcast(room,{type:"user-left",id:user.id},user.id);
  if(!room.clients.size)rooms.delete(room.code);
 });
});
const PORT=process.env.PORT||3000;
server.listen(PORT,"0.0.0.0",()=>console.log("0low Connect V4.1 online na porta "+PORT));