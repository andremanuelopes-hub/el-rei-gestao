'use client';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Session } from '@supabase/supabase-js';

type Categoria = { id:number; tipo:'venda'|'despesa'; nome:string; ordem:number };
type Movimento = { id:string; categoria_id:number; valor:number; descricao:string|null };
type Resumo = { data:string; total_vendas:number; total_despesas:number; saldo:number };
const hoje = () => new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
const euro = (n:number) => new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR'}).format(n);
function mensagemErro(e:unknown) { return e instanceof Error ? e.message : String(e); }
export default function Home() {
 const [session,setSession]=useState<Session|null>(null);
 const [ready,setReady]=useState(false),[autorizado,setAutorizado]=useState(false);
 const [email,setEmail]=useState(''),[password,setPassword]=useState('');
 const [data,setData]=useState(hoje()),[categorias,setCategorias]=useState<Categoria[]>([]);
 const [valores,setValores]=useState<Record<number,string>>({}),[descricoes,setDescricoes]=useState<Record<number,string>>({});
 const [resumos,setResumos]=useState<Resumo[]>([]),[estado,setEstado]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{supabase.auth.getSession().then(({data})=>{setSession(data.session);setReady(true)}); const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,s)=>setSession(s));return ()=>subscription.unsubscribe()},[]);
 useEffect(()=>{if(!session){setAutorizado(false);return}let active=true;supabase.from('administradores').select('user_id').eq('user_id',session.user.id).maybeSingle().then(({data,error})=>{if(active){setAutorizado(!!data&&!error);if(error)setEstado(error.message)}});return ()=>{active=false}},[session]);
 useEffect(()=>{if(!session||!autorizado)return;void carregarCategorias();void carregarDia();void carregarResumos()},[session,autorizado]);
 useEffect(()=>{if(session&&autorizado)void carregarDia()},[data]);
 async function carregarCategorias(){const {data,error}=await supabase.from('categorias').select('id,tipo,nome,ordem').eq('ativa',true).order('tipo',{ascending:false}).order('ordem');if(error)setEstado(error.message);else setCategorias(data as Categoria[])}
 async function carregarDia(){setEstado('');const {data:diario,error}=await supabase.from('diario_bordo').select('id').eq('data',data).maybeSingle();if(error){setEstado(error.message);return}if(!diario){setValores({});setDescricoes({});return}const {data:movs,error:me}=await supabase.from('movimentos').select('id,categoria_id,valor,descricao').eq('diario_id',diario.id);if(me){setEstado(me.message);return}const next:Record<number,string>={},notas:Record<number,string>={};for(const m of (movs||[]) as Movimento[]){next[m.categoria_id]=String(m.valor);notas[m.categoria_id]=m.descricao||''}setValores(next);setDescricoes(notas)}
 async function carregarResumos(){const {data,error}=await supabase.from('resumo_diario').select('data,total_vendas,total_despesas,saldo').order('data',{ascending:false}).limit(30);if(error)setEstado(error.message);else setResumos(data as Resumo[])}
 const totais=useMemo(()=>categorias.reduce((a,c)=>{const v=Number(valores[c.id]||0);if(Number.isFinite(v))a[c.tipo]+=v;return a},{venda:0,despesa:0}),[categorias,valores]);
 async function entrar(e:React.FormEvent){e.preventDefault();setBusy(true);setEstado('');const {error}=await supabase.auth.signInWithPassword({email,password});if(error)setEstado('Não foi possível entrar: '+error.message);setBusy(false)}
 async function guardar(){if(!session)return;setBusy(true);setEstado('A guardar...');try{
  const {data:existing,error:ee}=await supabase.from('diario_bordo').select('id').eq('data',data).maybeSingle();if(ee)throw ee;
  let diarioId=existing?.id;
  if(!diarioId){const {data:created,error:ce}=await supabase.from('diario_bordo').insert({data}).select('id').single();if(ce)throw ce;diarioId=created.id}
  const {data:old,error:oe}=await supabase.from('movimentos').select('id,categoria_id').eq('diario_id',diarioId);if(oe)throw oe;
  const existentes=new Map((old||[]).map(x=>[x.categoria_id,x.id]));
  for(const c of categorias){const raw=valores[c.id]?.trim();if(raw===undefined||raw==='')continue;const valor=Number(raw.replace(',','.'));if(!Number.isFinite(valor)||valor<0)throw new Error('Valor inválido em '+c.nome);
   const payload={valor,descricao:descricoes[c.id]||null};const id=existentes.get(c.id);
   if(id){const {error}=await supabase.from('movimentos').update(payload).eq('id',id);if(error)throw error}
   else {const {error}=await supabase.from('movimentos').insert({diario_id:diarioId,categoria_id:c.id,...payload});if(error)throw error}
  }
  setEstado('Registos guardados com sucesso.');await carregarResumos();await carregarDia();
 }catch(e){setEstado('Erro ao guardar: '+mensagemErro(e))}finally{setBusy(false)}}
 if(!ready)return <main className="center">A carregar...</main>;
 if(!session)return <main className="login"><section className="panel"><div className="brand">EL REI <small>GESTÃO · DESDE 1992</small></div><h1>Entrar na gestão</h1><form onSubmit={entrar}><label>Email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Palavra-passe<input type="password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><button disabled={busy}>Entrar</button></form><p className="status">{estado}</p></section></main>;
 if(!autorizado)return <main className="center"><section className="panel"><h2>Acesso restrito</h2><p>Esta conta não está autorizada como administrador.</p><p>{estado}</p><button onClick={()=>supabase.auth.signOut()}>Sair</button></section></main>;
 return <><header><div className="brand">EL REI <small>GESTÃO · DESDE 1992</small></div><div className="user"><span>{session.user.email}</span><button className="ghost" onClick={()=>supabase.auth.signOut()}>Sair</button></div></header><main className="content"><h1>Diário de Bordo</h1><p className="sub">Registo diário de vendas e despesas</p><div className="toolbar"><label>Data <input type="date" value={data} onChange={e=>setData(e.target.value)}/></label><button disabled={busy} onClick={guardar}>{busy?'A guardar...':'Guardar dia'}</button></div><div className="cards"><div className="metric"><span>Vendas</span><strong>{euro(totais.venda)}</strong></div><div className="metric"><span>Despesas</span><strong>{euro(totais.despesa)}</strong></div><div className="metric"><span>Saldo</span><strong>{euro(totais.venda-totais.despesa)}</strong></div></div><p className="status" role="status">{estado}</p><div className="columns">{(['venda','despesa'] as const).map(tipo=><section className="panel" key={tipo}><h2>{tipo==='venda'?'Vendas':'Despesas'}</h2>{categorias.filter(c=>c.tipo===tipo).map(c=><div className="field" key={c.id}><label htmlFor={'v'+c.id}>{c.nome}</label><input id={'v'+c.id} type="number" min="0" step="0.01" placeholder="0,00" value={valores[c.id]??''} onChange={e=>setValores(v=>({...v,[c.id]:e.target.value}))}/></div>)}</section>)}</div><section className="panel"><h2>Últimos 30 dias registados</h2><div className="tablewrap"><table><thead><tr><th>Data</th><th>Vendas</th><th>Despesas</th><th>Saldo</th></tr></thead><tbody>{resumos.map(r=><tr key={r.data}><td><button className="link" onClick={()=>setData(r.data)}>{r.data}</button></td><td>{euro(Number(r.total_vendas))}</td><td>{euro(Number(r.total_despesas))}</td><td>{euro(Number(r.saldo))}</td></tr>)}</tbody></table></div></section></main></>;
}
