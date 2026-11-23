'use client';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import Mercadorias from './mercadorias';
import CalculoPrecos from './calculo-precos';
import HistoricoMensal from './historico-mensal';

type MovimentoCaixa = {id:string;conta:'banco'|'cofre';data:string;tipo:'entrada'|'saida';descricao:string;valor:number};
type Categoria = { id:number; tipo:'venda'|'despesa'; nome:string; ordem:number };
type Movimento = { id:string; categoria_id:number; valor:number; descricao:string|null };
type Resumo = { data:string; total_vendas:number; total_despesas:number; saldo:number };
type Fornecedor = { id:string; nome:string; nif:string|null; telefone:string|null; email:string|null; observacoes:string|null; ativo:boolean };
type MovimentoFornecedor = { id:string; fornecedor_id:string; data:string; tipo:'compra'|'pagamento'; valor:number; documento:string|null; descricao:string|null; vencimento?:string|null; origem_pagamento?:'banco'|null };
type GrupoSemanal = 'caixa_banco'|'venda_faturada'|'venda_outra'|'despesa_faturada'|'despesa_outra';
type DespesaSemContribuinte = {id:string;data:string;descricao:string;valor:number};
type DespesaGomas = {id:string;data:string;categoria:string;valor:number};
const categoriasGomas = ['Artquel','Agrovila','Fatima e Daniel','Gasoleo','Outros para bolos','Outros variado'] as const;
type ValorAcrescentadoCaixa = {id:string;data:string;valor:number};
type CategoriaFixa = {id:string;nome:string;ordem:number};
type ValorFixoMes = {categoria_id:string;mes:string;valor:number};
type FaturaFornecedorMes = {id:string;fornecedor_id:string;data:string;documento:string|null;valor:number};
type TipoFatura = 'fatura'|'habitual';
type FaturaInterna = {id:string; data:string; cliente:string; numero:string; valor:number; tipo_fatura:TipoFatura};
type LinhaSemanal = { data:string; categoria_id:number; valor:number };
type SemanaMensal = { faturas:number; caixa:number; outras:number; despesas:number };
type TotaisMensais = Record<GrupoSemanal,number>;
const totaisVazios = ():TotaisMensais => ({caixa_banco:0,venda_faturada:0,venda_outra:0,despesa_faturada:0,despesa_outra:0});
const hoje = () => new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
const euro = (n:number) => new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR'}).format(n);
// Aceita somas simples com virgula decimal, sem executar codigo introduzido pelo utilizador.
const somarValoresDiario=(texto:string):number|null=>{
 const valor=texto.trim();
 if(!valor||!/^\d+(?:[.,]\d+)?(?:\s*\+\s*\d+(?:[.,]\d+)?)*$/.test(valor))return null;
 const total=valor.split('+').reduce((s,parte)=>s+Number(parte.trim().replace(',','.')),0);
 return Number.isFinite(total)?Math.round((total+Number.EPSILON)*100)/100:null;
};

// Datas apresentadas em DD/MM/AAAA; Supabase continua a receber AAAA-MM-DD.
const dataPT=(iso:string|null|undefined)=>{if(!iso)return '—';const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);return m?`${m[3]}/${m[2]}/${m[1]}`:iso};
function DataPortugues({value,onChange,required,id,'aria-label':ariaLabel}:{value:string;onChange:(e:{target:{value:string}})=>void;required?:boolean;id?:string;'aria-label'?:string;type?:string;min?:string;max?:string;step?:string;placeholder?:string}){
 const [texto,setTexto]=useState(dataPT(value)==='—'?'':dataPT(value));
 useEffect(()=>{setTexto(dataPT(value)==='—'?'':dataPT(value))},[value]);
 const converter=(v:string)=>{const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);if(!m)return null;const iso=`${m[3]}-${m[2]}-${m[1]}`;const d=new Date(iso+'T12:00:00');return !Number.isNaN(d.getTime())&&d.getFullYear()===Number(m[3])&&d.getMonth()+1===Number(m[2])&&d.getDate()===Number(m[1])?iso:null};
 return <input id={id} aria-label={ariaLabel} type="text" inputMode="numeric" placeholder="DD/MM/AAAA" pattern="[0-9]{2}/[0-9]{2}/[0-9]{4}" title="Data no formato DD/MM/AAAA" required={required} value={texto} onChange={e=>{const t=e.target.value;setTexto(t);const iso=converter(t);if(iso)onChange({target:{value:iso}})}} onBlur={()=>{if(!converter(texto))setTexto(dataPT(value)==='—'?'':dataPT(value))}}/>;
}

function mensagemErro(e:unknown):string {
 if (e && typeof e === 'object') {const v=e as {message?:unknown;details?:unknown;hint?:unknown;code?:unknown}; return [v.message,v.details,v.hint,v.code].filter(x=>typeof x==='string'&&x).join(' | ')||JSON.stringify(e);}
 return String(e);
}
const inicioSemana = (iso:string) => {const d=new Date(iso+'T12:00:00');const dia=(d.getDay()+6)%7;d.setDate(d.getDate()-dia);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
const somarDias = (iso:string, dias:number) => {const d=new Date(iso+'T12:00:00');d.setDate(d.getDate()+dias);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
const categoriaMBW = (nome:string) => ['mbway','mbw','mb way'].includes(nome.trim().toLocaleLowerCase('pt-PT').replace(/\s+/g,' '));
const gruposSemanais:{value:GrupoSemanal;label:string}[]=[{value:'caixa_banco',label:'Caixa para banco'},{value:'venda_faturada',label:'Vendas faturadas'},{value:'venda_outra',label:'Outras vendas'},{value:'despesa_faturada',label:'Despesa com contribuinte'},{value:'despesa_outra',label:'Outras despesas'}];
const grupoInicial = (c:Categoria):GrupoSemanal => {if(c.tipo==='venda')return 'caixa_banco';return /panik|lays|lay.s|g[aá]s|h[eé]lder|helder|outro faturado/i.test(c.nome)?'despesa_faturada':'despesa_outra'};
const vazioFornecedor = {nome:'',nif:'',telefone:'',email:'',observacoes:''};
type TarefaAgenda = {id:string;data:string;hora:string|null;descricao:string;concluida:boolean};
const nomeDiaAgenda = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
function AgendaSemanal(){
 const [aberta,setAberta]=useState(false);
 const [vista,setVista]=useState<'semana'|'mes'>('semana');
 const [formLocal,setFormLocal]=useState('');
 const [mesAgenda,setMesAgenda]=useState(()=>hoje().slice(0,7));
 const [diaSelecionado,setDiaSelecionado]=useState(()=>hoje());
 const [inicio,setInicio]=useState(()=>inicioSemana(hoje()));
 const [tarefas,setTarefas]=useState<TarefaAgenda[]>([]);
 const [carregando,setCarregando]=useState(false);
 const [erro,setErro]=useState('');
 const [formAberto,setFormAberto]=useState(false);
 const [editando,setEditando]=useState<string|null>(null);
 const [form,setForm]=useState({data:hoje(),hora:'09:00',descricao:''});
 const [agora,setAgora]=useState(()=>new Date());
 const hojeIso=hoje();
 const formatarLongo=(iso:string)=>{const d=new Date(iso+'T12:00:00');return nomeDiaAgenda[d.getDay()]+' · '+dataPT(iso)};
 async function carregar(){
  setCarregando(true);setErro('');
  try{
   const todas:TarefaAgenda[]=[];
   for(let offset=0;;offset+=500){
    const {data,error}=await supabase.from('agenda_tarefas').select('id,data,hora,descricao,concluida').order('data').order('hora').range(offset,offset+499);
    if(error)throw error;
    todas.push(...((data||[]) as TarefaAgenda[]));
    if(!data||data.length<500)break;
   }
   setTarefas(todas);
  }catch(e){setErro('Não foi possível carregar a agenda: '+mensagemErro(e))}
  finally{setCarregando(false)}
 }
 useEffect(()=>{void carregar();const t=window.setInterval(()=>setAgora(new Date()),60000);return()=>window.clearInterval(t)},[]);
 const fim=somarDias(inicio,6);
 const primeiroMes=mesAgenda+'-01';
 const mesData=new Date(primeiroMes+'T12:00:00');
 const inicioGrelha=(mesData.getDay()+6)%7;
 const diasNoMes=new Date(mesData.getFullYear(),mesData.getMonth()+1,0).getDate();
 const nomeMes=mesData.toLocaleDateString('pt-PT',{month:'long',year:'numeric'});
 const tarefasDia=tarefas.filter(t=>t.data===diaSelecionado).sort((a,b)=>(a.hora||'').localeCompare(b.hora||''));
 const tarefasHoje=tarefas.filter(t=>t.data===hojeIso).sort((a,b)=>(a.hora||'').localeCompare(b.hora||''));
 const mudarMesAgenda=(deslocamento:number)=>{const d=new Date(mesData.getFullYear(),mesData.getMonth()+deslocamento,1);setMesAgenda(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);setDiaSelecionado(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`)};

 const proximas=tarefas.filter(t=>!t.concluida&&t.data>hojeIso).sort((a,b)=>a.data.localeCompare(b.data)||(a.hora||'').localeCompare(b.hora||''));
 const proxima=proximas[0];
 const abrirNova=(dia=hojeIso,local='geral')=>{setFormLocal(local);setEditando(null);setForm({data:dia,hora:'09:00',descricao:''});setFormAberto(true)};
 const abrirEditar=(t:TarefaAgenda,local='geral')=>{setFormLocal(local);setEditando(t.id);setForm({data:t.data,hora:t.hora?.slice(0,5)||'',descricao:t.descricao});setFormAberto(true)};
 async function guardarTarefa(e:FormEvent){
  e.preventDefault();if(!form.descricao.trim())return;
  setCarregando(true);setErro('');
  try{
   const payload={data:form.data,hora:form.hora||null,descricao:form.descricao.trim()};
   const {error}=editando?await supabase.from('agenda_tarefas').update(payload).eq('id',editando):await supabase.from('agenda_tarefas').insert(payload);
   if(error)throw error;
   setFormAberto(false);setEditando(null);await carregar();
  }catch(e){setErro('Erro ao guardar tarefa: '+mensagemErro(e));setCarregando(false)}
 }
 async function concluir(t:TarefaAgenda){
  const {error}=await supabase.from('agenda_tarefas').update({concluida:!t.concluida}).eq('id',t.id);
  if(error){setErro(mensagemErro(error));return}await carregar();
 }
 async function eliminar(t:TarefaAgenda){
  if(!window.confirm('Eliminar a tarefa "'+t.descricao+'"?'))return;
  const {error}=await supabase.from('agenda_tarefas').delete().eq('id',t.id);
  if(error){setErro(mensagemErro(error));return}await carregar();
 }
 const formulario=(local:string)=><>{formAberto&&formLocal===local&&<form className="agenda-form" onSubmit={e=>void guardarTarefa(e)}><h3>{editando?'Editar tarefa':'Adicionar tarefa'}</h3><div className="agenda-form-campos"><label>Data<DataPortugues required value={form.data} onChange={e=>setForm(v=>({...v,data:e.target.value}))}/></label><label>Hora (opcional)<input type="time" value={form.hora} onChange={e=>setForm(v=>({...v,hora:e.target.value}))}/></label><label>Descrição resumida<input required maxLength={300} placeholder="Ex.: Confirmar encomendas" value={form.descricao} onChange={e=>setForm(v=>({...v,descricao:e.target.value}))}/></label></div><div style={{display:'flex',gap:8,marginTop:12}}><button type="submit" disabled={carregando}>{editando?'Guardar alteração':'Guardar tarefa'}</button><button type="button" className="ghost" onClick={()=>setFormAberto(false)}>Cancelar</button></div></form>}</>;
 return <section className="agenda-elrei" aria-label="Agenda semanal">
  <style>{`.agenda-elrei{margin:0 0 18px}.agenda-barra{border:1px solid #ddcbd0;border-radius:14px;background:#fff;overflow:hidden}.agenda-barra>summary{cursor:pointer;list-style:none;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px;color:#641d32}.agenda-barra>summary::-webkit-details-marker{display:none}.agenda-barra>summary strong{display:block;font-size:17px}.agenda-barra>summary small{display:block;color:#67555b;margin-top:4px}.agenda-detalhe{padding:14px 18px;border-top:1px solid #e9dfe2}.agenda-nav{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:12px}.agenda-nav button,.agenda-acoes button{padding:7px 10px;font-size:13px} .agenda-elrei .agenda-nav button,.agenda-elrei .agenda-acoes button,.agenda-elrei .agenda-dia-titulo button{background:#fff7f1!important;color:#641d32!important;border:1px solid #a77886!important;opacity:1!important;font-weight:700!important;box-shadow:none!important;min-height:38px;white-space:normal}.agenda-elrei .agenda-nav button:hover,.agenda-elrei .agenda-acoes button:hover,.agenda-elrei .agenda-dia-titulo button:hover{background:#f3e2e5!important;color:#641d32!important}.agenda-elrei .agenda-detalhe>button,.agenda-elrei .agenda-form button[type=submit]{background:#641d32!important;color:#fff!important;border:1px solid #641d32!important;font-weight:700!important;opacity:1!important}.agenda-elrei .agenda-form button[type=button]{background:#fff7f1!important;color:#641d32!important;border:1px solid #a77886!important;font-weight:700!important}.agenda-elrei .agenda-dia-titulo span,.agenda-elrei .agenda-tarefa span{color:#641d32!important}.agenda-elrei .agenda-nav button:focus-visible,.agenda-elrei .agenda-dia button:focus-visible{outline:3px solid #d6a33e;outline-offset:2px}.agenda-dia{padding:12px 14px;border:1px solid #e6d9dd;border-radius:9px;margin-bottom:8px;background:#fff}.agenda-dia.agenda-hoje{border-color:#641d32;background:#fff9f2}.agenda-dia-titulo{display:flex;justify-content:space-between;gap:8px;align-items:center;font-weight:700;color:#641d32}.agenda-elrei .agenda-check{background:#fff!important;color:#641d32!important;border:2px solid #641d32!important;border-radius:8px!important;padding:8px 12px!important;font-size:13px!important;font-weight:800!important;min-height:38px!important;cursor:pointer!important;white-space:nowrap}.agenda-elrei .agenda-check.concluida{background:#e6f4e9!important;color:#196534!important;border-color:#31834d!important}.agenda-elrei .agenda-check:focus-visible{outline:3px solid #d6a33e;outline-offset:2px}.agenda-tarefa{display:flex;align-items:center;gap:8px;padding:7px 0;border-top:1px solid #f0e7ea;flex-wrap:wrap}.agenda-tarefa:first-of-type{margin-top:8px}.agenda-tarefa span{flex:1;min-width:140px}.agenda-tarefa.feita span{text-decoration:line-through;opacity:.65}.agenda-acoes{display:flex;gap:6px}.agenda-resumo{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}.agenda-cartao{padding:16px 18px;border-radius:12px;border:1px solid #e0d2d6;background:#fff;min-height:105px}.agenda-cartao.hoje{background:#641d32;color:#fff}.agenda-cartao small{font-weight:700;letter-spacing:.03em}.agenda-cartao strong{display:block;font-size:22px;margin:10px 0 4px}.agenda-form{padding:14px;margin-top:12px;background:#fff7ee;border:1px solid #d9c6c9;border-radius:10px}.agenda-form label{display:flex;flex-direction:column;gap:5px}.agenda-form input{color:#2d2527;background:#fff}.agenda-form-campos{display:flex;gap:12px;flex-wrap:wrap;align-items:end}.agenda-form-campos label:last-child{flex:1;min-width:200px}@media(max-width:580px){.agenda-resumo{grid-template-columns:1fr}.agenda-barra>summary{padding:13px}.agenda-detalhe{padding:12px}}.agenda-vistas-principais{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}.agenda-elrei .agenda-vistas-principais button{background:#fff!important;color:#641d32!important;border:1px solid #ddcbd0!important;border-radius:12px!important;padding:15px 18px!important;text-align:left!important;cursor:pointer!important;min-height:76px!important}.agenda-vistas-principais strong{display:block;font-size:16px;color:#641d32!important}.agenda-vistas-principais small{display:block;font-size:12px;margin-top:5px;color:#67555b!important;text-transform:capitalize}.agenda-elrei .agenda-vistas-principais button.ativa{background:#fff3ee!important;border:2px solid #641d32!important}.agenda-elrei .agenda-dia.dia-concluido .agenda-dia-titulo span{color:#16733c!important}.agenda-elrei .agenda-dia.dia-pendente .agenda-dia-titulo span{color:#ba2834!important}.agenda-elrei .agenda-dia.sem-tarefas .agenda-dia-titulo span{color:#222!important}.agenda-elrei .agenda-calendario button.dia-concluido>span:first-child{color:#16733c!important;font-weight:800!important}.agenda-elrei .agenda-calendario button.dia-pendente>span:first-child{color:#ba2834!important;font-weight:800!important}.agenda-elrei .agenda-calendario button.sem-tarefas>span:first-child{color:#1857a0!important;font-weight:800!important}.agenda-elrei .agenda-calendario button.selecionado{outline:2px solid #641d32!important;outline-offset:-2px}.agenda-elrei .agenda-form{scroll-margin-top:15px}.agenda-elrei .agenda-mes-nav button,.agenda-elrei .agenda-mes-tarefas button{color:#641d32!important;background:#fff7f1!important;border:1px solid #a77886!important}.agenda-elrei .agenda-mes-tarefas>button{background:#641d32!important;color:#fff!important}@media(max-width:580px){.agenda-vistas-principais{gap:7px}.agenda-elrei .agenda-vistas-principais button{padding:12px!important}}.agenda-mes-nav{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;flex-wrap:wrap}.agenda-mes-nav strong{text-transform:capitalize;color:#641d32;font-size:18px}.agenda-calendario{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px;margin:12px 0 18px}.agenda-calendario-cabeca{text-align:center;font-size:12px;font-weight:800;color:#641d32;padding:8px 2px}.agenda-calendario-vazio{min-height:62px}.agenda-elrei .agenda-calendario button{display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-start;gap:5px;min-height:72px;min-width:0;padding:8px!important;border:1px solid #e1d2d6!important;border-radius:8px!important;background:#fff!important;color:#292327!important;text-align:left!important;white-space:normal!important;overflow-wrap:anywhere;cursor:pointer}.agenda-elrei .agenda-calendario button.hoje{background:#fff3e5!important;border-color:#641d32!important}.agenda-elrei .agenda-calendario button.selecionado{background:#f6e9ed!important;border:2px solid #641d32!important}.agenda-contagem{font-size:10px;line-height:1.3;color:#641d32;font-weight:700}.agenda-mes-tarefas{border-top:1px solid #e8dce0;padding-top:14px}.agenda-mes-tarefas h3{color:#641d32}.agenda-cartao.hoje .agenda-tarefa span{color:#fff!important}.agenda-cartao.hoje .agenda-tarefa{border-top-color:#885164}.agenda-cartao.hoje .agenda-check{background:#fff!important;color:#641d32!important;border-color:#fff!important}.agenda-cartao.hoje .agenda-check.concluida{background:#e6f4e9!important;color:#196534!important}.agenda-cartao .agenda-tarefa span{min-width:90px}.agenda-cartao .agenda-acoes button{min-height:32px!important}.agenda-cartao.hoje .agenda-acoes button{background:#fff7f1!important;color:#641d32!important}.agenda-cartao .agenda-form{color:#30242a;text-align:left}.agenda-cartao .agenda-form h3{color:#641d32;margin:0 0 12px}.agenda-cartao .agenda-form label{color:#30242a}.agenda-elrei .agenda-nova-cartao{display:block;margin-top:14px;background:#641d32!important;color:#fff!important;border:1px solid #641d32!important;font-weight:800!important;padding:10px 14px!important;border-radius:8px!important}.agenda-cartao.hoje strong{font-size:20px}@media(max-width:580px){.agenda-calendario{gap:3px}.agenda-calendario-vazio{min-height:48px}.agenda-elrei .agenda-calendario button{min-height:57px;padding:5px!important;font-size:12px!important}.agenda-contagem{font-size:9px}.agenda-calendario-cabeca{font-size:10px}}
/* Estados de tarefas com alto contraste: cor + texto, nunca apenas cor */
.agenda-elrei .agenda-check:not(.concluida){background:#fff0ee!important;color:#9d1726!important;border:2px solid #bd2537!important;box-shadow:inset 4px 0 0 #bd2537!important}
.agenda-elrei .agenda-check.concluida{background:#d8f4df!important;color:#075c29!important;border:2px solid #14813f!important;box-shadow:inset 4px 0 0 #14813f!important}
.agenda-elrei .agenda-tarefa:not(.feita){background:#fff3f1;border-left:5px solid #c42b3b;border-radius:6px;padding:9px;margin:5px 0}
.agenda-elrei .agenda-tarefa.feita{background:#e4f7e9;border-left:5px solid #158044;border-radius:6px;padding:9px;margin:5px 0}
.agenda-elrei .agenda-tarefa.feita span{text-decoration:line-through;opacity:1!important;color:#075c29!important}
.agenda-elrei .agenda-tarefa:not(.feita) span{color:#8c1827!important;font-weight:700}
.agenda-elrei .agenda-dia.dia-concluido{border:2px solid #168044;background:#eaf8ee}
.agenda-elrei .agenda-dia.dia-pendente{border:2px solid #c42b3b;background:#fff1f0}
.agenda-elrei .agenda-calendario button.dia-concluido{background:#dff6e5!important;border:2px solid #158044!important}
.agenda-elrei .agenda-calendario button.dia-pendente{background:#ffe4e2!important;border:2px solid #bf2638!important}
.agenda-elrei .agenda-calendario button.sem-tarefas{background:#dcecff!important;border:2px solid #2873c8!important}
.agenda-elrei .agenda-calendario button.dia-concluido>span:first-child{color:#075c29!important}
.agenda-elrei .agenda-calendario button.dia-pendente>span:first-child{color:#9b1528!important}
.agenda-elrei .agenda-calendario .agenda-contagem{font-size:10px!important;font-weight:900!important;color:inherit!important}
.agenda-elrei .agenda-calendario button.dia-concluido .agenda-contagem{color:#075c29!important}
.agenda-elrei .agenda-calendario button.dia-pendente .agenda-contagem{color:#9b1528!important}
.agenda-elrei .agenda-cartao.hoje .agenda-tarefa:not(.feita){background:#fff0ee!important}
.agenda-elrei .agenda-cartao.hoje .agenda-tarefa.feita{background:#e4f7e9!important}
.agenda-elrei .agenda-cartao.hoje .agenda-tarefa span{color:#262126!important}
.agenda-elrei .agenda-cartao.hoje .agenda-tarefa.feita span{color:#075c29!important}
.agenda-elrei .agenda-cartao.hoje .agenda-tarefa:not(.feita) span{color:#8c1827!important}
.agenda-elrei .agenda-cartao.hoje .agenda-check:not(.concluida){background:#fff0ee!important;color:#9d1726!important;border-color:#bd2537!important}
.agenda-elrei .agenda-cartao.hoje .agenda-check.concluida{background:#d8f4df!important;color:#075c29!important;border-color:#14813f!important}
@media(max-width:580px){.agenda-elrei .agenda-calendario .agenda-contagem{font-size:8px!important}.agenda-elrei .agenda-check{white-space:normal!important}}
`}</style>
  <div className="agenda-vistas-principais" role="group" aria-label="Vistas da agenda">
   <button type="button" className={aberta&&vista==='semana'?'ativa':''} aria-expanded={aberta&&vista==='semana'} onClick={()=>{if(aberta&&vista==='semana')setAberta(false);else{setVista('semana');setAberta(true)}}}><strong>Vista Semanal</strong><small>{dataPT(inicio)} a {dataPT(fim)}</small></button>
   <button type="button" className={aberta&&vista==='mes'?'ativa':''} aria-expanded={aberta&&vista==='mes'} onClick={()=>{if(aberta&&vista==='mes')setAberta(false);else{setVista('mes');setAberta(true)}}}><strong>Vista Mensal</strong><small>{nomeMes}</small></button>
  </div>
  {aberta&&<div className="agenda-barra"><div className="agenda-detalhe">
    {vista==='semana'?<>
    <div className="agenda-nav"><button type="button" className="ghost" onClick={()=>setInicio(somarDias(inicio,-7))}>‹ Semana anterior</button><button type="button" className="ghost" onClick={()=>setInicio(inicioSemana(hoje()))}>Esta semana</button><button type="button" className="ghost" onClick={()=>setInicio(somarDias(inicio,7))}>Semana seguinte ›</button></div>
    {Array.from({length:7},(_,i)=>{const dia=somarDias(inicio,i);const itens=tarefas.filter(t=>t.data===dia);const estado=itens.length===0?'sem-tarefas':itens.every(t=>t.concluida)?'dia-concluido':'dia-pendente';return <div key={dia} className={'agenda-dia '+estado+(dia===hojeIso?' agenda-hoje':'')}>
     <div className="agenda-dia-titulo"><span>{formatarLongo(dia)} {dia===hojeIso?'· Hoje':''}</span><button type="button" className="ghost" onClick={()=>abrirNova(dia,'dia-'+dia)}>+ Tarefa</button></div>
     {formulario('dia-'+dia)}
     {itens.length===0?<p style={{margin:'7px 0 0',fontSize:13,color:'#74676b'}}>Sem tarefas agendadas</p>:itens.map(t=><div key={t.id} className={'agenda-tarefa'+(t.concluida?' feita':'')}><button type="button" className={"agenda-check"+(t.concluida?" concluida":"")} aria-label={(t.concluida?"Reabrir tarefa ":"Marcar tarefa como concluída ")+t.descricao} aria-pressed={t.concluida} title={t.concluida?"Reabrir tarefa":"Marcar como concluída"} onClick={()=>void concluir(t)}>{t.concluida?"✓ CONCLUÍDA":"○ POR CONCLUIR"}</button><span>{t.hora?t.hora.slice(0,5)+' — ':''}{t.descricao}</span><div className="agenda-acoes"><button type="button" className="ghost" onClick={()=>abrirEditar(t,'dia-'+dia)}>Editar</button><button type="button" className="ghost" onClick={()=>void eliminar(t)}>Eliminar</button></div></div>)}
    </div>})}
    <button type="button" onClick={()=>abrirNova(hojeIso,'semana-geral')}>+ Adicionar tarefa</button>
    {formulario('semana-geral')}
    </>:<div className="agenda-mes">
     <div className="agenda-mes-nav"><button type="button" onClick={()=>mudarMesAgenda(-1)}>‹ Anterior</button><strong>{nomeMes}</strong><button type="button" onClick={()=>mudarMesAgenda(1)}>Seguinte ›</button></div>
     <div className="agenda-calendario" role="group" aria-label={'Calendário de '+nomeMes}>
      {['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map(d=><div className="agenda-calendario-cabeca" key={d}>{d}</div>)}
      {Array.from({length:inicioGrelha},(_,i)=><div className="agenda-calendario-vazio" key={'v'+i}/>)}
      {Array.from({length:diasNoMes},(_,i)=>{const dia=mesAgenda+'-'+String(i+1).padStart(2,'0');const tarefasDoDia=tarefas.filter(t=>t.data===dia);const n=tarefasDoDia.length;const todasConcluidas=n>0&&tarefasDoDia.every(t=>t.concluida);const estado=n===0?'sem-tarefas':todasConcluidas?'dia-concluido':'dia-pendente';return <button key={dia} type="button" aria-pressed={diaSelecionado===dia} aria-label={dataPT(dia)+(n?' — '+n+' tarefas':' — sem tarefas')} className={(diaSelecionado===dia?'selecionado ':'')+estado+' '+(dia===hojeIso?'hoje':'')} onClick={()=>setDiaSelecionado(dia)}><span>{i+1}</span>{n>0&&<span className="agenda-contagem">{todasConcluidas?'✓ FEITO':'● PENDENTE'} · {n} tarefa{n===1?'':'s'}</span>}</button>})}
     </div>
     <div className="agenda-mes-tarefas"><h3>Tarefas de {dataPT(diaSelecionado)}</h3>
      {tarefasDia.length===0?<p>Sem tarefas agendadas para este dia.</p>:tarefasDia.map(t=><div key={t.id} className={'agenda-tarefa'+(t.concluida?' feita':'')}><button type="button" className={"agenda-check"+(t.concluida?" concluida":"")} aria-label={(t.concluida?"Reabrir tarefa ":"Marcar tarefa como concluída ")+t.descricao} aria-pressed={t.concluida} title={t.concluida?"Reabrir tarefa":"Marcar como concluída"} onClick={()=>void concluir(t)}>{t.concluida?"✓ CONCLUÍDA":"○ POR CONCLUIR"}</button><span>{t.hora?t.hora.slice(0,5)+' — ':''}{t.descricao}</span><div className="agenda-acoes"><button type="button" onClick={()=>abrirEditar(t,'mes-dia')}>Editar</button><button type="button" onClick={()=>void eliminar(t)}>Eliminar</button></div></div>)}
      <button type="button" style={{marginTop:12,background:'#641d32',color:'#fff',padding:'11px 16px',borderRadius:8,fontWeight:800}} onClick={()=>abrirNova(diaSelecionado,'mes-dia')}>+ Adicionar tarefa neste dia</button>
      {formulario('mes-dia')}
     </div>
    </div>}
  </div></div>}
   <div className="agenda-resumo">
    <div className="agenda-cartao hoje"><small>HOJE</small><strong>{new Date(hojeIso+'T12:00:00').getDate()} · {nomeDiaAgenda[new Date(hojeIso+'T12:00:00').getDay()]}</strong><span>{dataPT(hojeIso)}</span>
     <div style={{marginTop:14,fontSize:13,fontWeight:700}}>Tarefas de hoje ({tarefasHoje.length})</div>
     {tarefasHoje.length===0?<p style={{fontSize:13,marginBottom:0}}>Sem tarefas agendadas para hoje.</p>:tarefasHoje.map(t=><div key={t.id} className={'agenda-tarefa'+(t.concluida?' feita':'')}><button type="button" className={'agenda-check'+(t.concluida?' concluida':'')} aria-pressed={t.concluida} aria-label={(t.concluida?'Reabrir ':'Concluir ')+t.descricao} onClick={()=>void concluir(t)}>{t.concluida?'✓ CONCLUÍDA':'○ POR CONCLUIR'}</button><span>{t.hora?t.hora.slice(0,5)+' — ':''}{t.descricao}</span><div className="agenda-acoes"><button type="button" onClick={()=>abrirEditar(t,'cartao-hoje')}>Editar</button><button type="button" onClick={()=>void eliminar(t)}>Eliminar</button></div></div>)}
     {formulario('cartao-hoje')}
    </div>
    <div className="agenda-cartao"><small>PRÓXIMA TAREFA</small>{proxima?<><strong>{dataPT(proxima.data)}{proxima.hora?' · '+proxima.hora.slice(0,5):''}</strong><span>{proxima.descricao}</span></>:<><strong>Sem próximas tarefas agendadas</strong><span>Adiciona uma tarefa para amanhã ou uma data posterior.</span></>}
     <button type="button" className="agenda-nova-cartao" aria-expanded={formAberto&&formLocal==='cartao-proxima'} onClick={()=>{if(formAberto&&formLocal==='cartao-proxima'&&!editando)setFormAberto(false);else abrirNova(hojeIso,'cartao-proxima')}}>+ Nova tarefa</button>
     {formulario('cartao-proxima')}
    </div>
   </div>

  {erro&&<p role="alert" style={{color:'#9d243d'}}>{erro}</p>}{carregando&&<p style={{fontSize:12}}>A atualizar agenda...</p>}
 </section>;
}

export default function Home(){
 const [session,setSession]=useState<Session|null>(null);
 const [ready,setReady]=useState(false),[autorizado,setAutorizado]=useState(false);
 const [email,setEmail]=useState(''),[password,setPassword]=useState('');
 const [aba,setAba]=useState<'diario'|'mensal'|'fornecedores'|'conta'|'banco_cofre'|'mercadorias'|'calculo_precos'|'historico'>('diario');
 const [data,setData]=useState(()=>somarDias(hoje(),-1)),[categorias,setCategorias]=useState<Categoria[]>([]);
  const [novaCategoriaNome,setNovaCategoriaNome]=useState<Record<'venda'|'despesa',string>>({venda:'',despesa:''});
  const [mostrarNovaCategoria,setMostrarNovaCategoria]=useState<Record<'venda'|'despesa',boolean>>({venda:false,despesa:false});
 const [selecionadosDiario,setSelecionadosDiario]=useState<number[]>([]);
 const [ocultosDiario,setOcultosDiario]=useState<number[]>([]);
 const [escolhaDiario,setEscolhaDiario]=useState<Record<'venda'|'despesa',string>>({venda:'',despesa:''});
 const clientesDiariosFixos=['Caixa Registada','Caixa Fora','Mbway','Açougueiros'];
 const ordemClientes=['Caixa Registada','Caixa Fora','Mbway','Açougueiros','Doce momentos','Refugium','Estaçao','Penha Hotel','Dan jose','Mini mercado','Teixeira','Mercado Cepaes','Varziela','Costa','Outros'];
 const ordemDespesas=['Panique','Lays','Gas','Helder Agostinho','Helder Agostinho n faturado','Sr Antonio','Surpresas','Limpeza','Outros faturado','Outros Fora'];
 const normalizarCategoria=(nome:string)=>nome.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-PT').trim();
 const clienteFixo=(c:Categoria)=>c.tipo==='venda'&&clientesDiariosFixos.some(n=>normalizarCategoria(n)===normalizarCategoria(c.nome));
 const permiteSoma=(c:Categoria)=>c.tipo==='venda'&&['caixa fora','mbway','mbw'].includes(normalizarCategoria(c.nome));
 const ordenarCategorias=(a:Categoria,b:Categoria,tipo:'venda'|'despesa')=>{const ordem=tipo==='venda'?ordemClientes:ordemDespesas;const indice=(nome:string)=>{const i=ordem.findIndex(n=>normalizarCategoria(n)===normalizarCategoria(nome));return i<0?999:i};return indice(a.nome)-indice(b.nome)||a.ordem-b.ordem};
 const [valores,setValores]=useState<Record<number,string>>({}),[descricoes,setDescricoes]=useState<Record<number,string>>({});
 const [resumos,setResumos]=useState<Resumo[]>([]),[estado,setEstado]=useState(''),[busy,setBusy]=useState(false);
 const [fornecedores,setFornecedores]=useState<Fornecedor[]>([]),[movimentosFornecedor,setMovimentosFornecedor]=useState<MovimentoFornecedor[]>([]);
 const [resumoMovimentosFornecedores,setResumoMovimentosFornecedores]=useState<Pick<MovimentoFornecedor,'fornecedor_id'|'data'|'tipo'|'valor'>[]>([]);
 const [resumoFornecedoresCarregando,setResumoFornecedoresCarregando]=useState(false);
  const [movimentosCaixa,setMovimentosCaixa]=useState<MovimentoCaixa[]>([]);
  const [caixaLoading,setCaixaLoading]=useState(false);
  const [caixaErro,setCaixaErro]=useState('');
  const [caixaEditando,setCaixaEditando]=useState<string|null>(null);
  const [novoMovimentoCaixa,setNovoMovimentoCaixa]=useState({conta:'banco' as 'banco'|'cofre',data:hoje(),tipo:'entrada' as 'entrada'|'saida',descricao:'',valor:''});
 const [fornecedorSelecionado,setFornecedorSelecionado]=useState('');
 const [mostrarAdicionarFatura,setMostrarAdicionarFatura]=useState(false);
 const [faturaFornecedorNova,setFaturaFornecedorNova]=useState({fornecedor_id:'',data:hoje(),numero:'',valor:'',descricao:''});

 const [faturasInternas,setFaturasInternas]=useState<FaturaInterna[]>([]);
 const [faturaEditando,setFaturaEditando]=useState<string|null>(null);
 const [novaFatura,setNovaFatura]=useState({data:hoje(),cliente:'',numero:'',valor:'',tipo_fatura:'fatura' as TipoFatura});
 const [faturasLoading,setFaturasLoading]=useState(false);
 const [semana,setSemana]=useState(inicioSemana(hoje()));
 const [mes,setMes]=useState(hoje().slice(0,7));
 const [atalhoValoresCaixa,setAtalhoValoresCaixa]=useState(false);
 const [mesLoading,setMesLoading]=useState(false);
  const [linhasMes,setLinhasMes]=useState<LinhaSemanal[]>([]);
  const [faturasMes,setFaturasMes]=useState<FaturaInterna[]>([]);
  const [faturasFornecedoresMes,setFaturasFornecedoresMes]=useState<FaturaFornecedorMes[]>([]);
  const [despesasSemContribuinte,setDespesasSemContribuinte]=useState<DespesaSemContribuinte[]>([]);
  const [despesasGomas,setDespesasGomas]=useState<DespesaGomas[]>([]);
  const [novaDespesaGomas,setNovaDespesaGomas]=useState({data:hoje(),categoria:'Artquel',valor:''});
  const [gomasEditando,setGomasEditando]=useState<string|null>(null);
  const [valoresAcrescentados,setValoresAcrescentados]=useState<ValorAcrescentadoCaixa[]>([]);
  const [totalAcrescentadoSemana,setTotalAcrescentadoSemana]=useState(0);
  const [novoValorCaixa,setNovoValorCaixa]=useState({data:hoje(),valor:''});
  const [valorCaixaDiario,setValorCaixaDiario]=useState('');
  const [valorCaixaDiarioAdicionado,setValorCaixaDiarioAdicionado]=useState(false);
  const [caixaDiarioAConsultar,setCaixaDiarioAConsultar]=useState(true);
  const [caixaDiarioRecarregar,setCaixaDiarioRecarregar]=useState(0);
  const [totalCaixaDiario,setTotalCaixaDiario]=useState<number|null>(null);
  const [valorCaixaEditando,setValorCaixaEditando]=useState<string|null>(null);
 useEffect(()=>{if(aba==='mensal'&&atalhoValoresCaixa){document.getElementById('valores-acrescentados-caixa')?.scrollIntoView({behavior:'smooth',block:'start'});document.getElementById('valor-caixa-atalho')?.focus({preventScroll:true});setAtalhoValoresCaixa(false)}},[aba,atalhoValoresCaixa]);
  const [novaDespesaMensal,setNovaDespesaMensal]=useState({data:hoje(),descricao:'',valor:''});
  const [despesaEditando,setDespesaEditando]=useState<string|null>(null);
  const [erroMes,setErroMes]=useState<string|null>(null);
  const [categoriasFixas,setCategoriasFixas]=useState<CategoriaFixa[]>([]);
  const [valoresFixos,setValoresFixos]=useState<ValorFixoMes[]>([]);
  const [edicoesFixas,setEdicoesFixas]=useState<Record<string,string>>({});
  const [nomeCategoriaFixa,setNomeCategoriaFixa]=useState('');
  const [fixasLoading,setFixasLoading]=useState(false);
 const [linhasSemana,setLinhasSemana]=useState<LinhaSemanal[]>([]);
 const [grupos,setGrupos]=useState<Record<number,GrupoSemanal>>({});
 const [semanaLoading,setSemanaLoading]=useState(false);
 const [configLoading,setConfigLoading]=useState(false);
 const [novoFornecedor,setNovoFornecedor]=useState(vazioFornecedor);
 const [editandoFornecedor,setEditandoFornecedor]=useState<string|null>(null);
 const [novoMovimento,setNovoMovimento]=useState({data:hoje(),tipo:'compra' as 'compra'|'pagamento',valor:'',documento:'',descricao:'',origem_pagamento:'banco' as 'banco'});
 useEffect(()=>{void supabase.auth.getSession().then(({data})=>{setSession(data.session);setReady(true)});const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,s)=>setSession(s));return ()=>subscription.unsubscribe()},[]);
 useEffect(()=>{if(!session){setAutorizado(false);return}let active=true;void supabase.from('administradores').select('user_id').eq('user_id',session.user.id).maybeSingle().then(({data,error})=>{if(active){setAutorizado(!!data&&!error);if(error)setEstado(mensagemErro(error))}});return ()=>{active=false}},[session]);
 useEffect(()=>{if(!session||!autorizado)return;void carregarCategorias();void carregarDia();void carregarResumos();void carregarFornecedores()},[session,autorizado]);
 useEffect(()=>{if(session&&autorizado)void carregarDia()},[data]);
 useEffect(()=>{if(session&&autorizado){void carregarSemana();void carregarFaturas()}},[semana,session,autorizado]);
 useEffect(()=>{if(session&&autorizado&&categorias.length){void carregarGrupos()}},[categorias,session,autorizado]);
 useEffect(()=>{if(session&&autorizado&&aba==='mensal')void carregarMes()},[mes,aba,session,autorizado]);
  useEffect(()=>{if(session&&autorizado&&aba==='banco_cofre')void carregarMovimentosCaixa()},[aba,session,autorizado]);
 useEffect(()=>{if(session&&autorizado&&aba==='mensal')void carregarCategoriasFixas()},[aba,session,autorizado]);
  async function carregarMovimentosCaixa(){
    setCaixaLoading(true);setCaixaErro('');
    try{
      const all:MovimentoCaixa[]=[];
      for(let offset=0;;offset+=500){
        const {data,error}=await supabase.from('movimentos_banco_cofre').select('id,conta,data,tipo,descricao,valor').order('data',{ascending:false}).order('id',{ascending:false}).range(offset,offset+499);
        if(error)throw error;
        all.push(...((data||[]) as MovimentoCaixa[]));
        if(!data||data.length<500)break;
      }
      setMovimentosCaixa(all);
    }catch(e){setCaixaErro(mensagemErro(e));setMovimentosCaixa([])}finally{setCaixaLoading(false)}
  }
  async function guardarMovimentoCaixa(e:FormEvent,contaDestino:'banco'|'cofre'){
    e.preventDefault();
    const valor=Number(novoMovimentoCaixa.valor.replace(',','.'));
    if(!novoMovimentoCaixa.descricao.trim()||!Number.isFinite(valor)||valor<=0){setEstado('Preenche a descrição e um valor superior a zero.');return}
    setBusy(true);
    try{
      const payload={...novoMovimentoCaixa,conta:contaDestino,descricao:novoMovimentoCaixa.descricao.trim(),valor};
      const {error}=caixaEditando&&novoMovimentoCaixa.conta===contaDestino?await supabase.from('movimentos_banco_cofre').update(payload).eq('id',caixaEditando):await supabase.from('movimentos_banco_cofre').insert(payload);
      if(error)throw error;
      setCaixaEditando(null);setNovoMovimentoCaixa({...novoMovimentoCaixa,descricao:'',valor:''});
      await carregarMovimentosCaixa();setEstado('Movimento guardado com sucesso.');
    }catch(e){setEstado('Erro ao guardar movimento: '+mensagemErro(e))}finally{setBusy(false)}
  }
  function editarMovimentoCaixa(m:MovimentoCaixa){setCaixaEditando(m.id);setNovoMovimentoCaixa({conta:m.conta,data:m.data,tipo:m.tipo,descricao:m.descricao,valor:String(m.valor)});setEstado('A editar movimento.');}
  async function eliminarMovimentoCaixa(m:MovimentoCaixa){
    if(!window.confirm('Eliminar este movimento de '+euro(Number(m.valor))+'?'))return;
    setBusy(true);
    try{const {data,error}=await supabase.from('movimentos_banco_cofre').delete().eq('id',m.id).select('id');if(error)throw error;if(!data?.length)throw new Error('Eliminação não confirmada.');await carregarMovimentosCaixa();setEstado('Movimento eliminado.');}
    catch(e){setEstado('Erro ao eliminar: '+mensagemErro(e))}finally{setBusy(false)}
  }
  const totaisCaixa=useMemo(()=>{
    const r={banco:{entradas:0,saidas:0},cofre:{entradas:0,saidas:0}};
    for(const m of movimentosCaixa){if(m.tipo==='entrada')r[m.conta].entradas+=Number(m.valor);else r[m.conta].saidas+=Number(m.valor)}
    return r;
  },[movimentosCaixa]);
 async function carregarMes(){
  setMesLoading(true);
  setErroMes(null);
  try{
   const primeiro=mes+'-01';
   const ultimo=somarDias(mes+'-01',new Date(Number(mes.slice(0,4)),Number(mes.slice(5,7)),0).getDate()-1);
   const dias:{id:string;data:string}[]=[];
   for(let offset=0;;offset+=500){
    const {data:rows,error}=await supabase.from('diario_bordo').select('id,data').gte('data',primeiro).lte('data',ultimo).order('data').range(offset,offset+499);
    if(error)throw error;
    dias.push(...(rows||[]));
    if(!rows||rows.length<500)break;
   }
   const movimentos:LinhaSemanal[]=[];
   for(let i=0;i<dias.length;i+=100){
    const lote=dias.slice(i,i+100);
    const datas=new Map(lote.map(d=>[d.id,d.data]));
    for(let offset=0;;offset+=500){
     const {data:rows,error}=await supabase.from('movimentos').select('diario_id,categoria_id,valor').in('diario_id',lote.map(d=>d.id)).order('diario_id').order('categoria_id').range(offset,offset+499);
     if(error)throw error;
     movimentos.push(...(rows||[]).map(m=>({data:datas.get(m.diario_id)||primeiro,categoria_id:m.categoria_id,valor:Number(m.valor)})));
     if(!rows||rows.length<500)break;
    }
   }
   const faturas:FaturaInterna[]=[];
   for(let offset=0;;offset+=500){
    const {data:rows,error}=await supabase.from('faturas_emitidas_internas').select('id,data,cliente,numero,valor,tipo_fatura').gte('data',primeiro).lte('data',ultimo).order('data',{ascending:false}).range(offset,offset+499);
    if(error)throw error;
    faturas.push(...((rows||[]) as FaturaInterna[]));
    if(!rows||rows.length<500)break;
   }
   const despesas:DespesaSemContribuinte[]=[];
   for(let offset=0;;offset+=500){
    const {data:rows,error}=await supabase.from('despesas_mensais_sem_contribuinte').select('id,data,descricao,valor').gte('data',primeiro).lte('data',ultimo).order('data',{ascending:false}).order('id',{ascending:false}).range(offset,offset+499);
    if(error)throw error;
    despesas.push(...((rows||[]) as DespesaSemContribuinte[]));
    if(!rows||rows.length<500)break;
   }
   const gomas:DespesaGomas[]=[];
   for(let offset=0;;offset+=500){
    const {data:rows,error}=await supabase.from('despesas_caixa_gomas').select('id,data,categoria,valor').gte('data',primeiro).lte('data',ultimo).order('data',{ascending:false}).order('id',{ascending:false}).range(offset,offset+499);
    if(error)throw error;
    gomas.push(...((rows||[]) as DespesaGomas[]));
    if(!rows||rows.length<500)break;
   }
   setDespesasGomas(gomas);
   const acrescimos:ValorAcrescentadoCaixa[]=[];
   for(let offset=0;;offset+=500){
    const {data:rows,error}=await supabase.from('valores_acrescentados_caixa').select('id,data,valor').gte('data',primeiro).lte('data',ultimo).order('data',{ascending:false}).order('id',{ascending:false}).range(offset,offset+499);
    if(error)throw error;
    acrescimos.push(...((rows||[]) as ValorAcrescentadoCaixa[]));
    if(!rows||rows.length<500)break;
   }
   const comprasFornecedor:FaturaFornecedorMes[]=[];
   for(let offset=0;;offset+=500){
    const {data:rows,error}=await supabase.from('fornecedor_movimentos').select('id,fornecedor_id,data,documento,valor').eq('tipo','compra').gte('data',primeiro).lte('data',ultimo).order('data',{ascending:false}).order('id',{ascending:false}).range(offset,offset+499);
    if(error)throw error;
    comprasFornecedor.push(...((rows||[]) as FaturaFornecedorMes[]));
    if(!rows||rows.length<500)break;
   }
   setFaturasFornecedoresMes(comprasFornecedor);
   const valoresFixosMes:ValorFixoMes[]=[];
   for(let offset=0;;offset+=500){
    const {data:rows,error}=await supabase.from('despesas_fixas_valores').select('categoria_id,mes,valor').eq('mes',primeiro).range(offset,offset+499);
    if(error)throw error;
    valoresFixosMes.push(...((rows||[]) as ValorFixoMes[]));
    if(!rows||rows.length<500)break;
   }
   setValoresFixos(valoresFixosMes);
   setEdicoesFixas(Object.fromEntries(valoresFixosMes.map(v=>[v.categoria_id,String(v.valor)])));
   setValoresAcrescentados(acrescimos);
   setDespesasSemContribuinte(despesas);
   setLinhasMes(movimentos);
   setFaturasMes(faturas);
  }catch(e){
   setLinhasMes([]);setFaturasMes([]);setFaturasFornecedoresMes([]);setDespesasSemContribuinte([]);setDespesasGomas([]);setValoresAcrescentados([]);setValoresFixos([]);setEdicoesFixas({});
   const mensagem='Erro no resumo mensal: '+mensagemErro(e);
   setErroMes(mensagem);setEstado(mensagem);
  }finally{setMesLoading(false)}
 }
 const resumoMes=useMemo(()=>{
  const totais=totaisVazios();
  const detalhes:Record<number,number>={};
  let mbwMensal=0;
  const semanas:Record<string,SemanaMensal>={};
  const semanaDe=(data:string)=>{const chave=inicioSemana(data);if(!semanas[chave])semanas[chave]={faturas:0,caixa:0,outras:0,despesas:0};return semanas[chave]};
  for(const m of linhasMes){
   const categoria=categorias.find(c=>c.id===m.categoria_id);
   if(!categoria)continue;
   const grupo=grupos[categoria.id]||grupoInicial(categoria);
   if(categoriaMBW(categoria.nome)&&categoria.tipo==='venda'){mbwMensal+=m.valor;}else{totais[grupo]+=m.valor;}
   detalhes[categoria.id]=(detalhes[categoria.id]||0)+m.valor;
   const w=semanaDe(m.data);
   if(grupo==='caixa_banco')w.caixa+=m.valor;
   if(grupo==='venda_outra')w.outras+=m.valor;
   if(grupo==='despesa_faturada'||grupo==='despesa_outra')w.despesas+=m.valor;
  }
  const faturas=faturasMes.reduce((n,f)=>{semanaDe(f.data).faturas+=Number(f.valor);return n+Number(f.valor)},0);
   const faturasHabituais=faturasMes.filter(f=>f.tipo_fatura==='habitual').reduce((n,f)=>n+Number(f.valor),0);
   const faturasReais=faturas-faturasHabituais;
   const clientesVendas=Object.values((()=>{
    const mapa:Record<string,{cliente:string;diario:number;fatura:number}>={};
    const adicionar=(nomeOriginal:string,origem:'diario'|'fatura',valor:number)=>{
      const nome=nomeOriginal.trim();if(!nome)return;
      const chave=nome.toLocaleLowerCase('pt-PT');
      if(!mapa[chave])mapa[chave]={cliente:nome,diario:0,fatura:0};
      mapa[chave][origem]+=valor;
    };
    for(const c of categorias){
      if(c.tipo!=='venda'||categoriaMBW(c.nome)||(grupos[c.id]||grupoInicial(c))!=='venda_outra')continue;
      adicionar(c.nome,'diario',detalhes[c.id]||0);
    }
    for(const f of faturasMes){if(f.tipo_fatura==='fatura')adicionar(f.cliente,'fatura',Number(f.valor));}
    return mapa;
   })()).filter(c=>c.diario!==0||c.fatura!==0).sort((a,b)=>a.cliente.localeCompare(b.cliente,'pt-PT'));
   const totalVendasClientes=clientesVendas.reduce((n,c)=>n+c.diario+c.fatura,0);
  const totalRetirado=valoresAcrescentados.reduce((n,v)=>n+Number(v.valor),0);
   const outrasVendasCorrigidas=totais.venda_outra; // Valores acrescentados: apenas informativos, sem efeito no Global
   const vendas=faturasReais+totais.caixa_banco+outrasVendasCorrigidas+mbwMensal+200;
  const totalSemContribuinte=despesasSemContribuinte.reduce((n,d)=>n+Number(d.valor),0);
  const totalFaturasFornecedores=faturasFornecedoresMes.reduce((n,f)=>n+Number(f.valor),0);
   const totalDespesasFixas=valoresFixos.reduce((n,v)=>n+Number(v.valor),0);
   const despesas=totais.despesa_faturada+totais.despesa_outra+totalSemContribuinte+totalFaturasFornecedores+totalDespesasFixas;
  const vendasFaturacao=faturas+totais.caixa_banco+linhasMes.reduce((n,m)=>{const c=categorias.find(c=>c.id===m.categoria_id);return n+(c?.tipo==='venda'&&categoriaMBW(c.nome)&&(grupos[c.id]||grupoInicial(c))==='caixa_banco'?m.valor:0)},0);
  const despesasFaturacao=totais.despesa_faturada+totalFaturasFornecedores+totalDespesasFixas;
  return {totais,detalhes,semanas,mbwMensal,faturas,faturasHabituais,faturasReais,clientesVendas,totalVendasClientes,vendas,despesas,totalSemContribuinte,totalRetirado,outrasVendasCorrigidas,totalFaturasFornecedores,totalDespesasFixas,vendasFaturacao,despesasFaturacao,saldoFaturacao:vendasFaturacao-despesasFaturacao,saldo:vendas-despesas};
 },[linhasMes,faturasMes,faturasFornecedoresMes,despesasSemContribuinte,valoresAcrescentados,valoresFixos,categorias,grupos]);
 async function carregarCategoriasFixas(){
  setFixasLoading(true);
  const {data:rows,error}=await supabase.from('despesas_fixas_categorias').select('id,nome,ordem').order('ordem').order('nome');
  if(error)setEstado('Erro nas categorias fixas: '+mensagemErro(error));
  else setCategoriasFixas((rows||[]) as CategoriaFixa[]);
  setFixasLoading(false);
 }
 async function adicionarCategoriaFixa(e:FormEvent){
  e.preventDefault();const nome=nomeCategoriaFixa.trim();if(!nome)return;
  setBusy(true);
  try{const {error}=await supabase.from('despesas_fixas_categorias').insert({nome,ordem:categoriasFixas.reduce((m,c)=>Math.max(m,c.ordem),0)+1});if(error)throw error;
   setNomeCategoriaFixa('');await carregarCategoriasFixas();setEstado('Categoria de despesa fixa adicionada.');
  }catch(e){setEstado('Erro ao adicionar categoria: '+mensagemErro(e))}finally{setBusy(false)}
 }
 async function renomearCategoriaFixa(c:CategoriaFixa){
  const nome=window.prompt('Novo nome da despesa fixa:',c.nome)?.trim();if(!nome||nome===c.nome)return;
  setBusy(true);
  try{const {error}=await supabase.from('despesas_fixas_categorias').update({nome}).eq('id',c.id);if(error)throw error;
   await carregarCategoriasFixas();setEstado('Categoria alterada.');
  }catch(e){setEstado('Erro ao alterar categoria: '+mensagemErro(e))}finally{setBusy(false)}
 }
 async function eliminarCategoriaFixa(c:CategoriaFixa){
  if(!window.confirm('Eliminar a categoria '+c.nome+' e TODOS os seus valores de todos os meses?'))return;
  setBusy(true);
  try{const {data:rows,error}=await supabase.from('despesas_fixas_categorias').delete().eq('id',c.id).select('id');if(error)throw error;if(!rows?.length)throw new Error('Eliminação não confirmada.');
   await carregarCategoriasFixas();await carregarMes();setEstado('Categoria eliminada.');
  }catch(e){setEstado('Erro ao eliminar categoria: '+mensagemErro(e))}finally{setBusy(false)}
 }
 async function guardarDespesaFixa(c:CategoriaFixa){
  const raw=(edicoesFixas[c.id]||'').trim();const valor=raw===''?0:Number(raw.replace(',','.'));
  if(!Number.isFinite(valor)||valor<0){setEstado('Indica um valor válido, igual ou superior a zero.');return}
  setBusy(true);
  try{
   const {error}=await supabase.from('despesas_fixas_valores').upsert({categoria_id:c.id,mes:mes+'-01',valor},{onConflict:'categoria_id,mes'});
   if(error)throw error;await carregarMes();setEstado('Despesa fixa '+c.nome+' guardada para '+mes+'.');
  }catch(e){setEstado('Erro ao guardar despesa fixa: '+mensagemErro(e))}finally{setBusy(false)}
 }
 async function guardarDespesaMensal(e:FormEvent){
  e.preventDefault();
  if(novaDespesaMensal.data.slice(0,7)!==mes){setEstado('A data da despesa deve pertencer ao mês selecionado.');return}
  const valor=Number(novaDespesaMensal.valor.replace(',','.'));
  if(!novaDespesaMensal.descricao.trim()||!Number.isFinite(valor)||valor<=0){setEstado('Indica uma descrição e um valor positivo.');return}
  setBusy(true);
  try{
   const payload={data:novaDespesaMensal.data,descricao:novaDespesaMensal.descricao.trim(),valor};
   const {error}=despesaEditando?await supabase.from('despesas_mensais_sem_contribuinte').update(payload).eq('id',despesaEditando):await supabase.from('despesas_mensais_sem_contribuinte').insert(payload);
   if(error)throw error;
   setDespesaEditando(null);setNovaDespesaMensal({data:mes+'-01',descricao:'',valor:''});
   await carregarMes();setEstado('Despesa sem contribuinte guardada no Resumo Mensal.');
  }catch(e){setEstado('Erro ao guardar despesa mensal: '+mensagemErro(e))}finally{setBusy(false)}
 }
 function editarDespesaMensal(d:DespesaSemContribuinte){setDespesaEditando(d.id);setNovaDespesaMensal({data:d.data,descricao:d.descricao,valor:String(d.valor)});setEstado('A editar despesa mensal.');}
 async function eliminarDespesaMensal(d:DespesaSemContribuinte){
  if(!window.confirm('Eliminar esta despesa sem contribuinte de '+euro(Number(d.valor))+'?'))return;
  setBusy(true);
  try{const {data,error}=await supabase.from('despesas_mensais_sem_contribuinte').delete().eq('id',d.id).select('id');if(error)throw error;if(!data?.length)throw new Error('Eliminação não confirmada.');await carregarMes();setEstado('Despesa mensal eliminada.');}
  catch(e){setEstado('Erro ao eliminar despesa mensal: '+mensagemErro(e))}finally{setBusy(false)}
 }
  async function guardarDespesaGomas(e:FormEvent){
   e.preventDefault();
   if(novaDespesaGomas.data.slice(0,7)!==mes){setEstado('A data deve pertencer ao mês selecionado.');return}
   const valor=Number(novaDespesaGomas.valor.replace(',','.'));
   if(!categoriasGomas.some(c=>c===novaDespesaGomas.categoria)||!Number.isFinite(valor)||valor<=0){setEstado('Seleciona uma categoria e indica um valor positivo.');return}
   setBusy(true);
   try{
    const payload={data:novaDespesaGomas.data,categoria:novaDespesaGomas.categoria,valor};
    const {error}=gomasEditando?await supabase.from('despesas_caixa_gomas').update(payload).eq('id',gomasEditando):await supabase.from('despesas_caixa_gomas').insert(payload);
    if(error)throw error;
    setGomasEditando(null);setNovaDespesaGomas({data:mes+'-01',categoria:'Artquel',valor:''});
    await carregarMes();setEstado('Despesa da caixa de gomas guardada.');
   }catch(e){setEstado('Erro ao guardar despesa da caixa de gomas: '+mensagemErro(e))}finally{setBusy(false)}
  }
  function editarDespesaGomas(d:DespesaGomas){setGomasEditando(d.id);setNovaDespesaGomas({data:d.data,categoria:d.categoria,valor:String(d.valor)});setEstado('A editar despesa da caixa de gomas.');}
  async function eliminarDespesaGomas(d:DespesaGomas){
   if(!window.confirm('Eliminar despesa de '+euro(Number(d.valor))+' da caixa de gomas?'))return;
   setBusy(true);
   try{const {data,error}=await supabase.from('despesas_caixa_gomas').delete().eq('id',d.id).select('id');if(error)throw error;if(!data?.length)throw new Error('Eliminação não confirmada.');await carregarMes();setEstado('Despesa da caixa de gomas eliminada.');}
   catch(e){setEstado('Erro ao eliminar despesa da caixa de gomas: '+mensagemErro(e))}finally{setBusy(false)}
  }
  // Recupera os valores efetivamente guardados para o dia, também após reabrir a página.
  useEffect(()=>{
   let ativo=true;
   setCaixaDiarioAConsultar(true);
   setValorCaixaDiario('');
   setValorCaixaDiarioAdicionado(false);
   async function carregarCaixaDoDia(){
    const {data:registos,error}=await supabase.from('valores_acrescentados_caixa')
     .select('valor').eq('data',data);
    if(!ativo)return;
    if(error){setEstado('Erro ao consultar valores acrescentados à caixa: '+mensagemErro(error));setCaixaDiarioAConsultar(false);return}
    const valoresDoDia=registos||[];
    if(valoresDoDia.length){
     const total=valoresDoDia.reduce((s,r)=>s+Number(r.valor||0),0);
     setValorCaixaDiario(String(Number(total.toFixed(2))));
     setValorCaixaDiarioAdicionado(true);
    }
    setCaixaDiarioAConsultar(false);
   }
   if(session&&autorizado)void carregarCaixaDoDia();
   else setCaixaDiarioAConsultar(false);
   return ()=>{ativo=false};
  },[data,session,autorizado,caixaDiarioRecarregar]);
  useEffect(()=>{
   let ativo=true;
   const inicio=data.slice(0,7)+'-01';
   const fim=data.slice(0,7)+'-31';
   async function carregarTotalCaixaDiario(){
    const {data:rows,error}=await supabase.from('valores_acrescentados_caixa').select('valor').gte('data',inicio).lte('data',fim);
    if(ativo)setTotalCaixaDiario(error?null:(rows||[]).reduce((s,r)=>s+Number(r.valor||0),0));
   }
   if(session&&autorizado)void carregarTotalCaixaDiario();
   return ()=>{ativo=false};
  },[data,session,autorizado]);
  async function guardarValorCaixaDiario(){
   const valor=Number(valorCaixaDiario.trim().replace(',','.'));
   if(!valorCaixaDiario.trim()||!Number.isFinite(valor)||valor<=0){setEstado('Indica um valor positivo para acrescentar à caixa.');return}
   if(caixaDiarioAConsultar||valorCaixaDiarioAdicionado)return;
   setBusy(true);
   try{
    const {error}=await supabase.from('valores_acrescentados_caixa').insert({data,valor});
    if(error)throw error;
    setValorCaixaDiarioAdicionado(true);
    setCaixaDiarioRecarregar(v=>v+1);
    await carregarSemana();
    const {data:rows,error:erroTotal}=await supabase.from('valores_acrescentados_caixa').select('valor').gte('data',data.slice(0,7)+'-01').lte('data',data.slice(0,7)+'-31');
    setTotalCaixaDiario(erroTotal?null:(rows||[]).reduce((s,r)=>s+Number(r.valor||0),0));
    if(mes===data.slice(0,7))await carregarMes();
    setEstado('Valor acrescentado à caixa guardado no Resumo Mensal.');
   }catch(e){setEstado('Erro ao guardar valor acrescentado: '+mensagemErro(e))}
   finally{setBusy(false)}
  }
   async function guardarValorCaixa(e:FormEvent){
   e.preventDefault();
   if(novoValorCaixa.data.slice(0,7)!==mes){setEstado('A data deve pertencer ao mês selecionado.');return}
   const valor=Number(novoValorCaixa.valor.replace(',','.'));
   if(!Number.isFinite(valor)||valor<=0){setEstado('Indica um valor positivo.');return}
   setBusy(true);
   try{
    const payload={data:novoValorCaixa.data,valor};
    const {error}=valorCaixaEditando?await supabase.from('valores_acrescentados_caixa').update(payload).eq('id',valorCaixaEditando):await supabase.from('valores_acrescentados_caixa').insert(payload);
    if(error)throw error;
    setValorCaixaEditando(null);setNovoValorCaixa({data:mes+'-01',valor:''});
    await carregarMes();setEstado('Valor acrescentado à caixa guardado.');
   }catch(e){setEstado('Erro ao guardar valor acrescentado: '+mensagemErro(e))}finally{setBusy(false)}
  }
  function editarValorCaixa(v:ValorAcrescentadoCaixa){setValorCaixaEditando(v.id);setNovoValorCaixa({data:v.data,valor:String(v.valor)});setEstado('A editar valor acrescentado à caixa.');}
  async function eliminarValorCaixa(v:ValorAcrescentadoCaixa){
   if(!window.confirm('Eliminar o valor de '+euro(Number(v.valor))+'?'))return;
   setBusy(true);
   try{const {data,error}=await supabase.from('valores_acrescentados_caixa').delete().eq('id',v.id).select('id');if(error)throw error;if(!data?.length)throw new Error('Eliminação não confirmada.');await carregarMes();setEstado('Valor eliminado.');}
   catch(e){setEstado('Erro ao eliminar valor: '+mensagemErro(e))}finally{setBusy(false)}
  }
async function carregarFaturas(){setFaturasLoading(true);const {data:rows,error}=await supabase.from('faturas_emitidas_internas').select('id,data,cliente,numero,valor,tipo_fatura').gte('data',semana).lte('data',somarDias(semana,6)).order('data',{ascending:false});if(error)setEstado('Faturas emitidas: '+mensagemErro(error));else setFaturasInternas((rows||[]) as FaturaInterna[]);setFaturasLoading(false)}
 async function guardarFatura(e:FormEvent){e.preventDefault();const valor=Number(novaFatura.valor.replace(',','.'));if(!novaFatura.cliente.trim()||!novaFatura.numero.trim()||!Number.isFinite(valor)||valor<=0){setEstado('Preenche cliente, número e valor positivo.');return}setBusy(true);try{const payload={data:novaFatura.data,cliente:novaFatura.cliente.trim(),numero:novaFatura.numero.trim(),valor,tipo_fatura:novaFatura.tipo_fatura};const {error}=faturaEditando?await supabase.from('faturas_emitidas_internas').update(payload).eq('id',faturaEditando):await supabase.from('faturas_emitidas_internas').insert(payload);if(error)throw error;setFaturaEditando(null);setNovaFatura({data:hoje(),cliente:'',numero:'',valor:'',tipo_fatura:'fatura'});await carregarFaturas();await carregarMes();setEstado('Fatura registada para controlo interno.')}catch(e){setEstado('Erro na fatura: '+mensagemErro(e))}finally{setBusy(false)}}
 function editarFatura(f:FaturaInterna){setFaturaEditando(f.id);setNovaFatura({data:f.data,cliente:f.cliente,numero:f.numero,valor:String(f.valor),tipo_fatura:f.tipo_fatura||'fatura'});setEstado('A editar fatura '+f.numero)}
 async function eliminarFatura(f:FaturaInterna){if(!window.confirm('Eliminar o registo interno da fatura '+f.numero+'?'))return;setBusy(true);try{const {error}=await supabase.from('faturas_emitidas_internas').delete().eq('id',f.id);if(error)throw error;await carregarFaturas();await carregarMes();setEstado('Registo interno eliminado.')}catch(e){setEstado('Erro ao eliminar fatura: '+mensagemErro(e))}finally{setBusy(false)}}
 async function carregarGrupos(){setConfigLoading(true);const {data,error}=await supabase.from('categoria_grupo_semanal').select('categoria_id,grupo');if(error){setEstado('Configuração semanal: '+mensagemErro(error));setConfigLoading(false);return}const next:Record<number,GrupoSemanal>={};for(const c of categorias)next[c.id]=grupoInicial(c);for(const x of data||[])next[x.categoria_id]=x.grupo as GrupoSemanal;setGrupos(next);setConfigLoading(false)}
 async function guardarGrupo(c:Categoria,grupo:GrupoSemanal){setConfigLoading(true);const {error}=await supabase.from('categoria_grupo_semanal').upsert({categoria_id:c.id,grupo},{onConflict:'categoria_id'});if(error)setEstado('Erro na classificação: '+mensagemErro(error));else{setGrupos(prev=>({...prev,[c.id]:grupo}));setEstado('Classificação guardada para os dois administradores.')}setConfigLoading(false)}
 async function carregarSemana(){
  setSemanaLoading(true);
  try{
   const fim=somarDias(semana,6);
   const {data:acrescimos,error:erroAcrescimos}=await supabase.from('valores_acrescentados_caixa').select('valor').gte('data',semana).lte('data',fim);
   if(erroAcrescimos)throw erroAcrescimos;
   setTotalAcrescentadoSemana((acrescimos||[]).reduce((n,v)=>n+Number(v.valor),0));
   const {data:dias,error:de}=await supabase.from('diario_bordo').select('id,data').gte('data',semana).lte('data',fim).order('data');
   if(de)throw de;
   if(!dias?.length){setLinhasSemana([]);return}
   const datas=new Map(dias.map(d=>[d.id,d.data]));
   const {data:movs,error:me}=await supabase.from('movimentos').select('diario_id,categoria_id,valor').in('diario_id',dias.map(d=>d.id));
   if(me)throw me;
   setLinhasSemana((movs||[]).map(m=>({data:datas.get(m.diario_id)||semana,categoria_id:m.categoria_id,valor:Number(m.valor)})));
  }catch(e){setEstado('Erro no resumo semanal: '+mensagemErro(e))}finally{setSemanaLoading(false)}
 }
 const resumoSemana=useMemo(()=>{
  const totais:{caixa_banco:number;venda_faturada:number;venda_outra:number;despesa_faturada:number;despesa_outra:number}={caixa_banco:0,venda_faturada:0,venda_outra:0,despesa_faturada:0,despesa_outra:0};
  const detalhes:Record<number,number>={};let mbw=0;
  for(const m of linhasSemana){const c=categorias.find(c=>c.id===m.categoria_id);if(!c)continue;const grupo=grupos[c.id]||grupoInicial(c);if(c.tipo==='venda'&&categoriaMBW(c.nome))mbw+=m.valor;else totais[grupo]+=m.valor;detalhes[c.id]=(detalhes[c.id]||0)+m.valor}
  return {totais,detalhes,mbw};
 },[linhasSemana,categorias,grupos]);
 async function adicionarCategoriaDiario(e:FormEvent,tipo:'venda'|'despesa'){
  e.preventDefault();
  const nome=novaCategoriaNome[tipo].trim();
  if(!nome)return;
  if(categorias.some(c=>c.tipo===tipo&&c.nome.toLocaleLowerCase('pt-PT')===nome.toLocaleLowerCase('pt-PT'))){setEstado('Este nome já existe nas '+(tipo==='venda'?'vendas.':'despesas.'));return}
  setBusy(true);
  try{
   const ordem=categorias.filter(c=>c.tipo===tipo).reduce((max,c)=>Math.max(max,Number(c.ordem)||0),0)+1;
   const {data:criada,error}=await supabase.from('categorias').insert({tipo,nome,ordem,ativa:true}).select('id').single();
   if(error)throw error;
   const grupo:GrupoSemanal=tipo==='venda'?'venda_outra':'despesa_outra';
   const {error:erroGrupo}=await supabase.from('categoria_grupo_semanal').upsert({categoria_id:criada.id,grupo},{onConflict:'categoria_id'});
   if(erroGrupo){await carregarCategorias();throw new Error('A categoria foi criada, mas não foi possível classificá-la como '+(tipo==='venda'?'Outras vendas':'Outras despesas')+'. Abre Classificação das categorias e confirma o grupo. '+mensagemErro(erroGrupo))}
   await carregarCategorias();
   setSelecionadosDiario(prev=>[...prev,criada.id]);
   setGrupos(prev=>({...prev,[criada.id]:grupo}));
   setNovaCategoriaNome(prev=>({...prev,[tipo]:''}));
   setMostrarNovaCategoria(prev=>({...prev,[tipo]:false}));
   setEstado((tipo==='venda'?'Cliente':'Despesa')+' adicionado com sucesso.');
  }catch(err){setEstado('Erro ao adicionar: '+mensagemErro(err))}finally{setBusy(false)}
 }
 async function apagarCliente(c:Categoria){
  if(c.tipo!=='venda'||busy)return;
  if(!window.confirm('Retirar o cliente "'+c.nome+'" da lista? Só é permitido se não tiver movimentos registados.'))return;
  setBusy(true);
  try{
   const {data:movimentos,error:erroMovimentos}=await supabase.from('movimentos').select('id').eq('categoria_id',c.id).limit(1);
   if(erroMovimentos)throw erroMovimentos;
   if(movimentos?.length)throw new Error('Este cliente tem vendas no histórico. Para preservar os totais e os registos anteriores, não pode ser apagado por esta opção.');
   const {data:alteradas,error}=await supabase.from('categorias').update({ativa:false}).eq('id',c.id).eq('tipo','venda').select('id');
   if(error)throw error;
   if(!alteradas?.length)throw new Error('Não foi possível confirmar a remoção do cliente.');
   setCategorias(prev=>prev.filter(x=>x.id!==c.id));
   setSelecionadosDiario(prev=>prev.filter(id=>id!==c.id));
   setOcultosDiario(prev=>prev.filter(id=>id!==c.id));
   setValores(prev=>{const next={...prev};delete next[c.id];return next});
   setDescricoes(prev=>{const next={...prev};delete next[c.id];return next});
   setEstado('Cliente retirado da lista com sucesso.');
  }catch(e){setEstado('Não foi possível apagar o cliente: '+mensagemErro(e))}finally{setBusy(false)}
 }
 async function carregarCategorias(){const {data,error}=await supabase.from('categorias').select('id,tipo,nome,ordem').eq('ativa',true).order('tipo',{ascending:false}).order('ordem');if(error)setEstado(mensagemErro(error));else setCategorias(data as Categoria[])}
 async function carregarDia(){const {data:diario,error}=await supabase.from('diario_bordo').select('id').eq('data',data).maybeSingle();if(error){setEstado(mensagemErro(error));return}if(!diario){setValores({});setDescricoes({});setSelecionadosDiario([]);return}const {data:movs,error:me}=await supabase.from('movimentos').select('id,categoria_id,valor,descricao').eq('diario_id',diario.id);if(me){setEstado(mensagemErro(me));return}const next:Record<number,string>={},notas:Record<number,string>={};for(const m of (movs||[]) as Movimento[]){next[m.categoria_id]=String(m.valor);notas[m.categoria_id]=m.descricao||''}setValores(next);setDescricoes(notas);setSelecionadosDiario((movs||[]).filter(m=>Number(m.valor)!==0).map(m=>m.categoria_id))}
 async function carregarResumos(){const {data,error}=await supabase.from('resumo_diario').select('data,total_vendas,total_despesas,saldo').order('data',{ascending:false}).limit(30);if(error)setEstado(mensagemErro(error));else setResumos(data as Resumo[])}
 async function carregarResumoFornecedores(){
  setResumoFornecedoresCarregando(true);
  try{
   const todos:Pick<MovimentoFornecedor,'fornecedor_id'|'data'|'tipo'|'valor'>[]=[];
   for(let offset=0;;offset+=1000){
    const {data,error}=await supabase.from('fornecedor_movimentos').select('fornecedor_id,data,tipo,valor').order('data',{ascending:true}).range(offset,offset+999);
    if(error)throw error;
    const lote=(data||[]) as Pick<MovimentoFornecedor,'fornecedor_id'|'data'|'tipo'|'valor'>[];
    todos.push(...lote);
    if(lote.length<1000)break;
   }
   setResumoMovimentosFornecedores(todos);
  }catch(e){setEstado('Erro ao carregar valores mensais dos fornecedores: '+mensagemErro(e))}
  finally{setResumoFornecedoresCarregando(false)}
 }
 const periodoFornecedores=useMemo(()=>{
  const agora=new Date();
  const atual=`${agora.getFullYear()}-${String(agora.getMonth()+1).padStart(2,'0')}`;
  const anteriorData=new Date(agora.getFullYear(),agora.getMonth()-1,1);
  const anterior=`${anteriorData.getFullYear()}-${String(anteriorData.getMonth()+1).padStart(2,'0')}`;
  return {atual,anterior,rotuloAtual:new Intl.DateTimeFormat('pt-PT',{month:'long',year:'numeric'}).format(agora),rotuloAnterior:new Intl.DateTimeFormat('pt-PT',{month:'long',year:'numeric'}).format(anteriorData)};
 },[]);
 const resumoPorFornecedor=useMemo(()=>{
  const mapa=new Map<string,{anterior:number;atual:number;comprasAteAnterior:number;pagamentos:number}>();
  for(const m of resumoMovimentosFornecedores){
   const reg=mapa.get(m.fornecedor_id)||{anterior:0,atual:0,comprasAteAnterior:0,pagamentos:0};
   const valor=Number(m.valor)||0;
   const mes=m.data.slice(0,7);
   if(m.tipo==='compra'){
    if(mes===periodoFornecedores.anterior)reg.anterior+=valor;
    if(mes===periodoFornecedores.atual)reg.atual+=valor;
    if(mes<=periodoFornecedores.anterior)reg.comprasAteAnterior+=valor;
   }else if(m.tipo==='pagamento')reg.pagamentos+=valor;
   mapa.set(m.fornecedor_id,reg);
  }
  return mapa;
 },[resumoMovimentosFornecedores,periodoFornecedores]);
 async function carregarFornecedores(){const {data,error}=await supabase.from('fornecedores').select('id,nome,nif,telefone,email,observacoes,ativo').order('nome');if(error){setEstado('Fornecedores: '+mensagemErro(error));return}setFornecedores((data||[]) as Fornecedor[])}
 async function carregarMovimentosFornecedor(id:string){if(!id){setMovimentosFornecedor([]);return}const {data,error}=await supabase.from('fornecedor_movimentos').select('id,fornecedor_id,data,tipo,valor,documento,descricao,vencimento,origem_pagamento').eq('fornecedor_id',id).order('data',{ascending:false}).order('id',{ascending:false});if(error){setEstado(mensagemErro(error));return}setMovimentosFornecedor((data||[]) as MovimentoFornecedor[])}
 useEffect(()=>{if(session&&autorizado)void carregarMovimentosFornecedor(fornecedorSelecionado)},[fornecedorSelecionado,session,autorizado]);
 useEffect(()=>{if(session&&autorizado)void carregarResumoFornecedores()},[session,autorizado]);
 const totais=useMemo(()=>categorias.reduce((a,c)=>{const v=permiteSoma(c)?somarValoresDiario(valores[c.id]||''):Number(valores[c.id]||0);if(v!==null&&Number.isFinite(v))a[c.tipo]+=v;return a},{venda:0,despesa:0}),[categorias,valores]);
 const totalFaturasInternas=faturasInternas.reduce((a,f)=>a+Number(f.valor),0);
  const totalFaturasHabituaisSemana=faturasInternas.filter(f=>f.tipo_fatura==='habitual').reduce((a,f)=>a+Number(f.valor),0);
 const totalCompras=movimentosFornecedor.filter(m=>m.tipo==='compra').reduce((a,m)=>a+Number(m.valor),0);
 const totalPagamentos=movimentosFornecedor.filter(m=>m.tipo==='pagamento').reduce((a,m)=>a+Number(m.valor),0);
 async function entrar(e:FormEvent){e.preventDefault();setBusy(true);setEstado('');const {error}=await supabase.auth.signInWithPassword({email,password});if(error)setEstado('Não foi possível entrar: '+mensagemErro(error));setBusy(false)}
 async function guardar(){if(!session)return;setBusy(true);setEstado('A guardar...');try{
  const {data:existing,error:ee}=await supabase.from('diario_bordo').select('id').eq('data',data).maybeSingle();if(ee)throw ee;
  let diarioId=existing?.id;
  if(!diarioId){if(categorias.every(c=>!(valores[c.id]||'').trim())){setEstado('Não existem valores para guardar.');return}const {data:created,error:ce}=await supabase.from('diario_bordo').insert({data}).select('id').single();if(ce)throw ce;diarioId=created.id}
  const {data:old,error:oe}=await supabase.from('movimentos').select('id,categoria_id').eq('diario_id',diarioId);if(oe)throw oe;
  const existentes=new Map((old||[]).map(x=>[x.categoria_id,x.id]));
  for(const c of categorias){const raw=valores[c.id]?.trim()??'';const id=existentes.get(c.id);
   if(raw===''){if(id){const {error}=await supabase.from('movimentos').delete().eq('id',id);if(error)throw new Error('Ao limpar '+c.nome+': '+mensagemErro(error))}continue}
   const valor=permiteSoma(c)?somarValoresDiario(raw):Number(raw.replace(',','.'));if(valor===null||!Number.isFinite(valor)||valor<0)throw new Error('Valor inválido em '+c.nome+'. Usa números separados por +.');
   const payload={valor,descricao:descricoes[c.id]||null};
   if(id){const {error}=await supabase.from('movimentos').update(payload).eq('id',id);if(error)throw error}
   else {const {error}=await supabase.from('movimentos').insert({diario_id:diarioId,categoria_id:c.id,...payload});if(error)throw error}
  }
  await carregarResumos();await carregarDia();await carregarSemana();await carregarMes();setEstado('Registos guardados com sucesso.');
 }catch(e){setEstado('Erro ao guardar: '+mensagemErro(e))}finally{setBusy(false)}}
 async function guardarFornecedor(e:FormEvent){e.preventDefault();if(!novoFornecedor.nome.trim()){setEstado('Indica o nome do fornecedor.');return}setBusy(true);setEstado('');try{
  const payload={nome:novoFornecedor.nome.trim(),nif:novoFornecedor.nif.trim()||null,telefone:novoFornecedor.telefone.trim()||null,email:novoFornecedor.email.trim()||null,observacoes:novoFornecedor.observacoes.trim()||null};
  if(editandoFornecedor){const {error}=await supabase.from('fornecedores').update(payload).eq('id',editandoFornecedor);if(error)throw error}
  else {const {data,error}=await supabase.from('fornecedores').insert(payload).select('id').single();if(error)throw error;if(data)setFornecedorSelecionado(data.id)}
  setNovoFornecedor(vazioFornecedor);setEditandoFornecedor(null);await carregarFornecedores();setEstado('Fornecedor guardado com sucesso.');
 }catch(e){setEstado('Erro no fornecedor: '+mensagemErro(e))}finally{setBusy(false)}}
 function editarFornecedor(f:Fornecedor){setEditandoFornecedor(f.id);setNovoFornecedor({nome:f.nome,nif:f.nif||'',telefone:f.telefone||'',email:f.email||'',observacoes:f.observacoes||''});setEstado('A editar '+f.nome)}
 async function guardarMovimentoFornecedor(e:FormEvent){e.preventDefault();if(!fornecedorSelecionado){setEstado('Seleciona um fornecedor.');return}const valor=Number(novoMovimento.valor.replace(',','.'));if(!Number.isFinite(valor)||valor<=0){setEstado('O valor deve ser superior a zero.');return}setBusy(true);setEstado('');try{
  const {error}=await supabase.from('fornecedor_movimentos').insert({fornecedor_id:fornecedorSelecionado,data:novoMovimento.data,tipo:novoMovimento.tipo,valor,documento:novoMovimento.documento.trim()||null,descricao:novoMovimento.descricao.trim()||null,...(novoMovimento.tipo==='pagamento'?{origem_pagamento:'banco'}:{})});if(error)throw error;
  setNovoMovimento({data:hoje(),tipo:'compra',valor:'',documento:'',descricao:'',origem_pagamento:'banco'});await carregarMovimentosFornecedor(fornecedorSelecionado);await carregarResumoFornecedores();if(novoMovimento.tipo==='pagamento')await carregarMovimentosCaixa();setEstado('Movimento registado com sucesso.');
 }catch(e){setEstado('Erro no movimento: '+mensagemErro(e))}finally{setBusy(false)}}
 async function guardarFaturaFornecedor(e:FormEvent){
  e.preventDefault();
  const valor=Number(faturaFornecedorNova.valor.replace(',','.'));
  if(!faturaFornecedorNova.fornecedor_id){setEstado('Seleciona o fornecedor da fatura.');return}
  if(!faturaFornecedorNova.data||!faturaFornecedorNova.numero.trim()){setEstado('Preenche a data e o número da fatura.');return}
  if(!Number.isFinite(valor)||valor===0){setEstado('Indica um valor diferente de zero: positivo para fatura ou negativo para nota de crédito.');return}
  setBusy(true);setEstado('');
  try{
   const {error}=await supabase.from('fornecedor_movimentos').insert({fornecedor_id:faturaFornecedorNova.fornecedor_id,data:faturaFornecedorNova.data,tipo:'compra',valor,documento:faturaFornecedorNova.numero.trim(),descricao:faturaFornecedorNova.descricao.trim()||null});
   if(error)throw error;
   const id=faturaFornecedorNova.fornecedor_id;
   setFornecedorSelecionado(id);
   setFaturaFornecedorNova({fornecedor_id:'',data:hoje(),numero:'',valor:'',descricao:''});
   setMostrarAdicionarFatura(false);
   await carregarMovimentosFornecedor(id);
   await carregarResumoFornecedores();
   await carregarMes();
   setEstado(valor<0?'Nota de crédito registada com sucesso; o valor reduz a dívida ao fornecedor.':'Fatura adicionada com sucesso ao fornecedor.');
  }catch(e){setEstado('Erro ao adicionar fatura: '+mensagemErro(e))}finally{setBusy(false)}
 }
 async function eliminarMovimentoFornecedor(m:MovimentoFornecedor){if(!window.confirm('Eliminar este movimento de '+euro(Number(m.valor))+'? A operação ficará no histórico de auditoria.'))return;setBusy(true);setEstado('');try{const {data,error}=await supabase.from('fornecedor_movimentos').delete().eq('id',m.id).select('id');if(error)throw error;if(!data?.length)throw new Error('A eliminação não foi confirmada. Verifica as permissões.');await carregarMovimentosFornecedor(fornecedorSelecionado);await carregarResumoFornecedores();if(m.tipo==='pagamento')await carregarMovimentosCaixa();setEstado('Movimento eliminado.')}catch(e){setEstado('Erro ao eliminar: '+mensagemErro(e))}finally{setBusy(false)}}
 if(!ready)return <main className="center">A carregar...</main>;
 if(!session)return <main className="login"><section className="panel"><div className="brand brand-with-logo"><img className="brand-logo" src="/el-rei-logo.png" alt="El Rei — Padaria Pastelaria Lda."/><span className="brand-label">EL REI <small>GESTÃO · DESDE 1992</small></span></div><h1>Entrar na gestão</h1><form onSubmit={entrar}><label>Email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Palavra-passe<input type="password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><button disabled={busy}>Entrar</button></form><p className="status">{estado}</p></section></main>;
 if(!autorizado)return <main className="center"><section className="panel"><h2>Acesso restrito</h2><p>Esta conta não está autorizada como administrador.</p><p>{estado}</p><button onClick={()=>supabase.auth.signOut()}>Sair</button></section></main>;
 return <><header><div className="brand brand-with-logo"><img className="brand-logo" src="/el-rei-logo.png" alt="El Rei — Padaria Pastelaria Lda."/><span className="brand-label">EL REI <small>GESTÃO · DESDE 1992</small></span></div><div className="user"><span>{session.user.email}</span><button className="ghost" onClick={()=>supabase.auth.signOut()}>Sair</button></div></header>
 <main className="content"><AgendaSemanal/><nav className="toolbar modulos-principais" aria-label="Módulos"><button className={aba==='diario'?'':'ghost'} onClick={()=>{setAba('diario');setEstado('')}}>Diário de Bordo</button><button className={aba==='mensal'?'':'ghost'} onClick={()=>{setAba('mensal');setEstado('')}}>Resumo Mensal</button><button className={aba==='fornecedores'?'':'ghost'} onClick={()=>{setAba('fornecedores');setEstado('');void carregarFornecedores();void carregarResumoFornecedores()}}>Fornecedores</button><button className={aba==='conta'?'':'ghost'} onClick={()=>{setAba('conta');setEstado('');void carregarFornecedores();if(fornecedorSelecionado)void carregarMovimentosFornecedor(fornecedorSelecionado)}}>Conta Corrente</button><button className={aba==='banco_cofre'?'':'ghost'} onClick={()=>{setAba('banco_cofre');setEstado('')}}>Banco e Cofre</button><button className={aba==='mercadorias'?'':'ghost'} onClick={()=>{setAba('mercadorias');setEstado('')}}>Mercadorias</button><button className={aba==='calculo_precos'?'':'ghost'} onClick={()=>{setAba('calculo_precos');setEstado('')}}>Cálculo de Preços</button><button className={aba==='historico'?'':'ghost'} onClick={()=>{setAba('historico');setEstado('')}}>Histórico Mensal</button></nav><p className="status" role="status">{estado}</p>
 {aba==='historico'?<HistoricoMensal/>:aba==='calculo_precos'?<CalculoPrecos/>:aba==='mercadorias'?<Mercadorias/>:aba==='diario'?<><style>{`.compact-section{border:1px solid #e1d5cf;border-radius:12px;margin:12px 0;background:#fff;overflow:hidden}.compact-section>summary{display:flex;align-items:center;gap:12px;cursor:pointer;padding:18px 16px;list-style:none;font-weight:650}.compact-section>summary::-webkit-details-marker{display:none}.compact-section>summary>span:first-child{flex:1}.compact-body{padding:14px 16px}.diario-topo{display:grid;grid-template-columns:minmax(280px,1fr) minmax(0,1.5fr);gap:18px;align-items:stretch;margin-bottom:18px}.diario-totais{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.diario-totais .metric{min-width:0;display:flex;flex-direction:column;justify-content:center}.diario-data-destaque{height:100%;box-sizing:border-box}@media(max-width:760px){.diario-topo{grid-template-columns:1fr}.diario-totais{grid-template-columns:repeat(2,minmax(0,1fr))}}.diario-data-destaque{display:flex!important;flex-direction:column;align-items:stretch;gap:8px;background:#fff4df;border:3px solid #641d32;border-radius:14px;padding:18px 20px;box-shadow:0 3px 12px rgba(100,29,50,.12)}.diario-data-destaque>span{font-size:17px;font-weight:800;color:#641d32;letter-spacing:.02em}.diario-data-destaque>input{font-family:inherit;font-size:26px!important;font-weight:800;color:#641d32;border:2px solid #9b6274;border-radius:9px;padding:12px 14px;width:100%;min-width:240px;background:#fff}.diario-data-destaque>label{display:block;font-size:16px;font-weight:800;letter-spacing:.06em;color:#641d32}.diario-data-destaque>button{width:100%;margin-top:12px}@media(max-width:600px){.diario-data-destaque{width:100%}.diario-data-destaque>input{min-width:0;font-size:22px!important}}`}</style><div className="diario-topo"><div className="diario-data-destaque"><label htmlFor="diario-data-registo">DATA DE REGISTO</label><DataPortugues id="diario-data-registo" aria-label="Data de registo do Diário de Bordo"  value={data} onChange={e=>{setData(e.target.value);setSelecionadosDiario([]);setOcultosDiario([])}}/><button type="button" disabled={busy} onClick={guardar}>{busy?'A guardar...':'Guardar dia'}</button></div><div className="diario-totais"><div className="metric" style={{minWidth:0}}><span>Vendas</span><strong>{euro(totais.venda)}</strong></div><div className="metric" style={{minWidth:0}}><span>Despesas</span><strong>{euro(totais.despesa)}</strong></div></div></div><div className="columns">{(['venda','despesa'] as const).map(tipo=><section className="panel" key={tipo}><h2>{tipo==='venda'?'Vendas':'Despesas'}</h2><div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:16,padding:14,background:'#fff4df',border:'1px solid #d9b6a9',borderRadius:10}}><label style={{fontWeight:750,color:'#641d32'}} htmlFor={'escolher-'+tipo}>{tipo==='venda'?'Escolher venda / cliente':'Escolher despesa'}</label><select id={'escolher-'+tipo} style={{width:'100%',fontSize:16,padding:12,borderRadius:8,border:'1px solid #a87883',background:'#fff'}} value={escolhaDiario[tipo]} onChange={e=>setEscolhaDiario(v=>({...v,[tipo]:e.target.value}))}><option value="">Selecionar da lista...</option>{categorias.filter(c=>c.tipo===tipo&&!clienteFixo(c)&&!selecionadosDiario.includes(c.id)&&(!(valores[c.id]??'').trim()||ocultosDiario.includes(c.id))).sort((a,b)=>ordenarCategorias(a,b,tipo)).map(c=><option key={c.id} value={String(c.id)}>{c.nome}</option>)}</select><button type="button" disabled={!escolhaDiario[tipo]} onClick={()=>{const id=Number(escolhaDiario[tipo]);setSelecionadosDiario(v=>v.includes(id)?v:[...v,id]);setOcultosDiario(v=>v.filter(x=>x!==id));setEscolhaDiario(v=>({...v,[tipo]:''}))}}>Adicionar à lista</button></div>{categorias.filter(c=>c.tipo===tipo&&(clienteFixo(c)||!ocultosDiario.includes(c.id))&&(clienteFixo(c)||selecionadosDiario.includes(c.id)||(valores[c.id]??'').trim()!=='' )).map(c=><div className="field" key={c.id} style={tipo==='venda'&&c.nome.trim().toLocaleLowerCase('pt-PT')==='caixa registada'?{display:'grid',gridTemplateColumns:'minmax(0,1fr) 190px',gap:8,alignItems:'start'}:undefined}><label htmlFor={'v'+c.id} style={tipo==='venda'&&c.nome.trim().toLocaleLowerCase('pt-PT')==='caixa registada'?{alignSelf:'start',paddingTop:13}:undefined}>{c.nome}</label><div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:3,...(tipo==='venda'&&c.nome.trim().toLocaleLowerCase('pt-PT')==='caixa registada'?{width:190,minWidth:0}:{})}}><input id={'v'+c.id} type={permiteSoma(c)?'text':'number'} inputMode={permiteSoma(c)?'decimal':undefined} min={permiteSoma(c)?undefined:'0'} step={permiteSoma(c)?undefined:'0.01'} placeholder={permiteSoma(c)?'Ex.: 2 + 3 + 2,71':'0,00'} value={valores[c.id]??''} onChange={e=>setValores(v=>({...v,[c.id]:e.target.value}))} style={tipo==='venda'&&c.nome.trim().toLocaleLowerCase('pt-PT')==='caixa registada'?{width:'100%',boxSizing:'border-box',minWidth:0}:undefined}/>{tipo==='venda'&&c.nome.trim().toLocaleLowerCase('pt-PT')==='caixa registada'&&<div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:5,marginTop:5,width:'100%'}}><div style={{display:'flex',gap:5,alignItems:'center',justifyContent:'flex-end',flexWrap:'nowrap',width:'100%'}}><input aria-label="Valor acrescentado à caixa" type="text" inputMode="decimal" placeholder="Valor (€)" value={valorCaixaDiario} readOnly={valorCaixaDiarioAdicionado||caixaDiarioAConsultar} onChange={e=>setValorCaixaDiario(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();if(!busy&&!valorCaixaDiarioAdicionado&&!caixaDiarioAConsultar)void guardarValorCaixaDiario()}}} style={{width:80,minWidth:0,flex:'0 0 80px',boxSizing:'border-box',padding:'7px 8px',minHeight:34,fontSize:13}}/><button type="button" disabled={busy||valorCaixaDiarioAdicionado||caixaDiarioAConsultar} onClick={()=>void guardarValorCaixaDiario()} style={{flex:'1 1 auto',backgroundColor:valorCaixaDiarioAdicionado?'#256a43':'#641d32',color:'#ffffff',border:'1px solid #641d32',borderRadius:7,fontWeight:750,padding:'7px 9px',minHeight:34,fontSize:12,opacity:busy?.65:1,whiteSpace:'nowrap',WebkitTextFillColor:'#ffffff'}}>{busy?'A guardar...':caixaDiarioAConsultar?'A consultar...':valorCaixaDiarioAdicionado?'✓ Adicionado':'+ Adicionar'}</button></div><small style={{color:'#746a6a',textAlign:'right'}}>Valores acrescentados à caixa: {totalCaixaDiario===null?'—':euro(totalCaixaDiario)}</small></div>}{permiteSoma(c)&&(valores[c.id]||'').includes('+')&&<small style={{color:somarValoresDiario(valores[c.id])===null?'#a22136':'#196534',fontWeight:700}}>{somarValoresDiario(valores[c.id])===null?'Soma inválida':`Total: ${euro(somarValoresDiario(valores[c.id])!)}`}</small>}</div>{!clienteFixo(c)&&<button type="button" className="ghost" style={{marginLeft:8,padding:'8px 12px',color:'#641d32'}} aria-label={'Remover '+c.nome+' da lista'} onClick={()=>{setValores(v=>({...v,[c.id]:''}));setDescricoes(v=>({...v,[c.id]:''}));setSelecionadosDiario(v=>v.filter(x=>x!==c.id));setOcultosDiario(v=>v.includes(c.id)?v:[...v,c.id]);setEstado('Valor removido do total. Clica em Guardar dia para confirmar a alteração.')}}>Remover</button>}</div>)}<div style={{marginTop:18,paddingTop:14,borderTop:'1px solid #e1d5cf'}}>{!mostrarNovaCategoria[tipo]?<button type="button" className="ghost" style={{display:'inline-block',fontSize:15,fontWeight:700,color:'#641d32',background:'#fff4df',border:'2px solid #641d32',padding:'12px 18px',borderRadius:9,whiteSpace:'normal'}} disabled={busy} onClick={()=>setMostrarNovaCategoria(v=>({...v,[tipo]:true}))}>{tipo==='venda'?'+ Adicionar cliente':'+ Nova despesa'}</button>:<form onSubmit={e=>void adicionarCategoriaDiario(e,tipo)} style={{display:'flex',flexDirection:'column',alignItems:'stretch',gap:12,background:'#fff4df',border:'2px solid #641d32',borderRadius:12,padding:16}}><label style={{display:'flex',flexDirection:'column',alignItems:'stretch',gap:8,fontSize:16,fontWeight:800,color:'#641d32',width:'100%'}}>{tipo==='venda'?'NOME DO NOVO CLIENTE':'NOME DA NOVA DESPESA'}<input required autoFocus style={{display:'block',width:'100%',boxSizing:'border-box',minHeight:48,fontSize:17,color:'#30242a',background:'#fff',border:'1px solid #a77a87',borderRadius:8,padding:'10px 12px'}} placeholder={tipo==='venda'?'Ex.: MBW':'Ex.: Material de limpeza'} value={novaCategoriaNome[tipo]} onChange={e=>setNovaCategoriaNome(v=>({...v,[tipo]:e.target.value}))}/></label><div style={{display:'flex',flexWrap:'wrap',gap:10}}><button type="submit" disabled={busy} style={{fontSize:15,fontWeight:700,padding:'12px 18px',background:'#641d32',color:'#fff',borderRadius:8}}>{busy?'A guardar...':'Adicionar'}</button><button type="button" onClick={()=>{setMostrarNovaCategoria(v=>({...v,[tipo]:false}));setNovaCategoriaNome(v=>({...v,[tipo]:''}))}} style={{fontSize:15,fontWeight:700,padding:'12px 18px',background:'#fff',color:'#641d32',border:'1px solid #641d32',borderRadius:8}}>Cancelar</button></div></form>}</div></section>)}</div><section className="panel"><h2>Resumo semanal</h2><p className="sub">Segunda-feira a domingo. O total da caixa corresponde às vendas classificadas como «Caixa para banco».</p><div className="toolbar"><label>Semana (escolhe um dia) <DataPortugues value={semana} onChange={e=>setSemana(inicioSemana(e.target.value))}/></label><strong>{dataPT(semana)} a {dataPT(somarDias(semana,6))}</strong><button type="button" className="ghost" disabled={semanaLoading} onClick={()=>void carregarSemana()}>{semanaLoading?'A carregar...':'Atualizar semana'}</button></div><div className="cards"><div className="metric"><span>Caixa registada para o banco</span><strong>{euro(resumoSemana.totais.caixa_banco)}</strong><small style={{display:"block",marginTop:5,color:"#641d32"}}>(Acrescentado à caixa: {euro(totalAcrescentadoSemana)})</small></div><div className="metric"><span>Despesas com contribuinte</span><strong>{euro(resumoSemana.totais.despesa_faturada)}</strong></div><div className="metric"><span>Caixa menos despesas faturadas</span><strong>{euro(resumoSemana.totais.caixa_banco-resumoSemana.totais.despesa_faturada)}</strong></div></div><div className="cards"><div className="metric"><span>Outras vendas (sem MBW)</span><strong>{euro(resumoSemana.totais.venda_outra)}</strong></div><div className="metric"><span>MBW da semana</span><strong>{euro(resumoSemana.mbw)}</strong></div><div className="metric"><span>Outras despesas</span><strong>{euro(resumoSemana.totais.despesa_outra)}</strong></div><div className="metric"><span>Saldo dos outros movimentos</span><strong>{euro(resumoSemana.totais.venda_outra+resumoSemana.mbw-resumoSemana.totais.despesa_outra)}</strong></div></div><h3>Total geral semanal</h3><p className="sub">Soma das faturas emitidas registadas abaixo, caixa registada, outras vendas, MBW e fundo fixo de moedas de 200,00 €. As Faturas Habituais já incluídas em Outras Vendas são descontadas desse subtotal para evitar duplicação. As despesas são apresentadas separadamente e não são subtraídas deste total.</p><div className="tablewrap"><table><tbody><tr><th>Faturas emitidas (registo interno)</th><td>{euro(totalFaturasInternas)}</td></tr><tr><th>Caixa registada da semana<br/><small style={{fontWeight:400}}>(Acrescentado à caixa: {euro(totalAcrescentadoSemana)} — informativo)</small></th><td>{euro(resumoSemana.totais.caixa_banco)}</td></tr><tr><th>Outras vendas da semana (sem MBW)</th><td>{euro(resumoSemana.totais.venda_outra)}</td></tr><tr><th>MBW da semana</th><td>{euro(resumoSemana.mbw)}</td></tr><tr><th>Faturas Habituais já incluídas nas outras vendas</th><td>− {euro(totalFaturasHabituaisSemana)}</td></tr><tr><th>Moedas (valor fixo)</th><td>{euro(200)}</td></tr><tr><th>Total geral semanal</th><td><strong>{euro(totalFaturasInternas+resumoSemana.totais.caixa_banco+resumoSemana.totais.venda_outra+resumoSemana.mbw-totalFaturasHabituaisSemana+200)}</strong></td></tr></tbody></table></div><h3>Faturas emitidas — registo interno</h3><p className="sub">Faturas emitidas noutro programa. Este registo não emite documentos fiscais. Escolhe Fatura para uma venda efetiva ainda não contabilizada; Faturas Habituais para vendas já incluídas nas Outras Vendas. Os documentos devem corresponder a operações reais.</p><form onSubmit={guardarFatura}><div className="toolbar"><label>Data<DataPortugues  required value={novaFatura.data} onChange={e=>setNovaFatura(v=>({...v,data:e.target.value}))}/></label><label>Cliente<input required value={novaFatura.cliente} onChange={e=>setNovaFatura(v=>({...v,cliente:e.target.value}))} placeholder="Açougueiros"/></label><label>N.º da fatura<input required value={novaFatura.numero} onChange={e=>setNovaFatura(v=>({...v,numero:e.target.value}))} placeholder="93"/></label><label>Tipo<select value={novaFatura.tipo_fatura} onChange={e=>setNovaFatura(v=>({...v,tipo_fatura:e.target.value as TipoFatura}))}><option value="fatura">Fatura</option><option value="habitual">Faturas Habituais</option></select></label><label>Valor (€)<input type="number" min="0.01" step="0.01" required value={novaFatura.valor} onChange={e=>setNovaFatura(v=>({...v,valor:e.target.value}))}/></label><button type="submit" disabled={busy}>{faturaEditando?'Guardar alteração':'Adicionar fatura'}</button>{faturaEditando&&<button type="button" className="ghost" onClick={()=>{setFaturaEditando(null);setNovaFatura({data:hoje(),cliente:'',numero:'',valor:'',tipo_fatura:'fatura'})}}>Cancelar</button>}</div></form><div className="tablewrap"><table><thead><tr><th>Data</th><th>Cliente</th><th>Fatura</th><th>Tipo</th><th>Valor</th><th>Ações</th></tr></thead><tbody>{faturasInternas.map(f=><tr key={f.id}><td>{dataPT(f.data)}</td><td>{f.cliente}</td><td>{f.numero}</td><td>{f.tipo_fatura==='habitual'?'Faturas Habituais':'Fatura'}</td><td>{euro(Number(f.valor))}</td><td><button type="button" className="link" disabled={busy} onClick={()=>editarFatura(f)}>Editar</button> <button type="button" className="link" disabled={busy} onClick={()=>void eliminarFatura(f)}>Eliminar</button></td></tr>)}</tbody></table></div><p><strong>Total de faturas da semana: {euro(totalFaturasInternas)}</strong>{faturasLoading?' (a carregar...)':''}</p><h3>Despesas com contribuinte — detalhe semanal</h3><div className="tablewrap"><table><thead><tr><th>Categoria</th><th>Total semanal</th></tr></thead><tbody>{categorias.filter(c=>(grupos[c.id]||grupoInicial(c))==='despesa_faturada').map(c=><tr key={c.id}><td>{c.nome}</td><td>{euro(resumoSemana.detalhes[c.id]||0)}</td></tr>)}</tbody></table></div><details className="compact-section"><summary><span>Classificação das categorias</span><span aria-hidden="true">▾</span></summary><div className="compact-body"><p className="sub">Confirma a classificação uma vez. Fica guardada no Supabase e é igual para os dois administradores. As faturas emitidas devem ser registadas no formulário acima. Não voltes a lançá-las nas categorias diárias, para evitar duplicações. As categorias antigas «Vendas faturadas» não entram no novo total de faturas.</p><div className="tablewrap"><table><thead><tr><th>Categoria</th><th>Grupo semanal</th><th>Ações</th></tr></thead><tbody>{categorias.map(c=><tr key={c.id}><td>{c.nome}</td><td><select aria-label={'Grupo de '+c.nome} disabled={configLoading} value={grupos[c.id]||grupoInicial(c)} onChange={e=>void guardarGrupo(c,e.target.value as GrupoSemanal)}>{gruposSemanais.filter(g=>c.tipo==='venda'?g.value==='caixa_banco'||g.value==='venda_faturada'||g.value==='venda_outra':g.value==='despesa_faturada'||g.value==='despesa_outra').map(g=><option key={g.value} value={g.value}>{g.label}</option>)}</select></td><td>{c.tipo==='venda'&&<button type="button" className="link" disabled={busy||configLoading} onClick={()=>void apagarCliente(c)}>Apagar cliente</button>}</td></tr>)}</tbody></table></div></div></details></section><section className="panel"><h2>Últimos 30 dias registados</h2><div className="tablewrap"><table><thead><tr><th>Data</th><th>Vendas</th><th>Despesas</th><th>Saldo</th></tr></thead><tbody>{resumos.map(r=><tr key={dataPT(r.data)}><td><button className="link" onClick={()=>setData(r.data)}>{dataPT(r.data)}</button></td><td>{euro(Number(r.total_vendas))}</td><td>{euro(Number(r.total_despesas))}</td><td>{euro(Number(r.saldo))}</td></tr>)}</tbody></table></div></section></>:aba==='mensal'?<><style>{`.compact-section{border:1px solid #e1d5cf;border-radius:12px;margin:12px 0;background:#fff;overflow:hidden}.compact-section>summary{display:flex;align-items:center;gap:12px;cursor:pointer;padding:18px 16px;list-style:none;font-weight:650}.compact-section>summary::-webkit-details-marker{display:none}.compact-section>summary>span:first-child{flex:1}.compact-section>summary>strong{white-space:nowrap;color:#69253a}.compact-section[open]>summary{border-bottom:1px solid #eee}.compact-body{padding:14px 16px}.compact-body .tablewrap{overflow-x:auto}@media(max-width:600px){.compact-section>summary{padding:14px 10px;font-size:14px}.compact-body{padding:12px 8px}}`}</style><h1>Resumo Mensal</h1><p className="sub">Vendas e despesas por mês. As moedas contam apenas uma vez: 200,00 € por mês.</p><section className="panel"><div className="toolbar"><label>Mês <input type="month" value={mes} onChange={e=>{setMes(e.target.value);setDespesaEditando(null);setNovaDespesaMensal({data:e.target.value+'-01',descricao:'',valor:''});setValorCaixaEditando(null);setNovoValorCaixa({data:e.target.value+'-01',valor:''});setEdicoesFixas({})}}/></label><button type="button" className="ghost" disabled={mesLoading} onClick={()=>void carregarMes()}>{mesLoading?'A carregar...':'Atualizar resumo'}</button></div><details className="compact-section"><summary><span>Total Mensal — Faturação</span><strong>{euro(resumoMes.saldoFaturacao)}</strong><span aria-hidden="true">▾</span></summary><div className="compact-body"><div className="tablewrap"><table><tbody><tr><th>Caixa registada para o banco</th><td>{euro(resumoMes.totais.caixa_banco)}</td></tr><tr><th>Faturas emitidas</th><td>{euro(resumoMes.faturas)}</td></tr><tr><th>Total de vendas faturação</th><td><strong>{euro(resumoMes.vendasFaturacao)}</strong></td></tr><tr><th>Despesas com contribuinte</th><td>{euro(resumoMes.totais.despesa_faturada)}</td></tr><tr><th>Faturas dos fornecedores do mês</th><td>{euro(resumoMes.totalFaturasFornecedores)}</td></tr><tr><th>Despesas fixas mensais</th><td>{euro(resumoMes.totalDespesasFixas)}</td></tr><tr><th>Total de despesas faturação</th><td><strong>{euro(resumoMes.despesasFaturacao)}</strong></td></tr><tr><th>Saldo mensal — Faturação</th><td><strong>{euro(resumoMes.saldoFaturacao)}</strong></td></tr></tbody></table></div></div></details><details className="compact-section"><summary><span>Total Mensal — Global</span><strong>{euro(resumoMes.saldo)}</strong><span aria-hidden="true">▾</span></summary><div className="compact-body"><div className="cards"><div className="metric"><span>Total geral mensal</span><strong>{euro(resumoMes.vendas)}</strong></div><div className="metric"><span>Despesas mensais</span><strong>{euro(resumoMes.despesas)}</strong></div><div className="metric"><span>Saldo mensal</span><strong>{euro(resumoMes.saldo)}</strong></div></div>{erroMes&&<p className="status" role="alert">Erro ao carregar o mês: {erroMes}</p>}{mesLoading&&<p>A carregar os dados do mês...</p>}{erroMes&&<p role="alert">{erroMes}</p>}<div className="tablewrap"><table><tbody><tr><th>Faturas (incluídas no Global)</th><td>{euro(resumoMes.faturasReais)}</td></tr><tr><th>Faturas Habituais (apenas Faturação; não entram no Global)</th><td>{euro(resumoMes.faturasHabituais)}</td></tr><tr><th>Caixa registada para o banco<br/><small style={{fontWeight:400}}>(Acrescentado à caixa: {euro(resumoMes.totalRetirado)} — informativo)</small></th><td>{euro(resumoMes.totais.caixa_banco)}</td></tr><tr><th>Outras vendas (sem MBW)</th><td>{euro(resumoMes.totais.venda_outra)}</td></tr><tr><th>MBW mensal (contabilizado à parte)</th><td>{euro(resumoMes.mbwMensal)}</td></tr><tr><th>Outras vendas (sem MBW e sem ajustes)</th><td><strong>{euro(resumoMes.outrasVendasCorrigidas)}</strong></td></tr><tr><th>Moedas (uma vez por mês)</th><td>{euro(200)}</td></tr><tr><th>Total geral mensal</th><td><strong>{euro(resumoMes.vendas)}</strong></td></tr><tr><th>Despesas com contribuinte</th><td>{euro(resumoMes.totais.despesa_faturada)}</td></tr><tr><th>Outras despesas</th><td>{euro(resumoMes.totais.despesa_outra)}</td></tr><tr><th>Despesas sem contribuinte (registo mensal)</th><td>{euro(resumoMes.totalSemContribuinte)}</td></tr><tr><th>Faturas dos fornecedores do mês</th><td>{euro(resumoMes.totalFaturasFornecedores)}</td></tr><tr><th>Despesas fixas mensais</th><td>{euro(resumoMes.totalDespesasFixas)}</td></tr><tr><th>Despesas totais</th><td><strong>{euro(resumoMes.despesas)}</strong></td></tr><tr><th>Saldo mensal</th><td><strong>{euro(resumoMes.saldo)}</strong></td></tr></tbody></table></div><p className="sub">O saldo é um indicador interno de vendas menos despesas registadas; não representa necessariamente lucro contabilístico. As categorias classificadas como «Vendas faturadas» não são somadas novamente, para evitar duplicações.</p></div></details><details className="compact-section"><summary><span>Faturas dos fornecedores do mês</span><strong>{euro(resumoMes.totalFaturasFornecedores)}</strong><span aria-hidden="true">▾</span></summary><div className="compact-body"><p className="sub">Compras registadas na Conta Corrente com data no mês selecionado, pagas ou por pagar. Os pagamentos não são descontados novamente. Movimentos de compra sem número de documento também entram no total.</p><div className="tablewrap"><table><thead><tr><th>Data</th><th>Fornecedor</th><th>Documento</th><th>Valor</th></tr></thead><tbody>{faturasFornecedoresMes.map(f=><tr key={f.id}><td>{dataPT(f.data)}</td><td>{fornecedores.find(x=>x.id===f.fornecedor_id)?.nome||'Fornecedor não identificado'}</td><td>{f.documento||'Sem documento'}</td><td>{euro(Number(f.valor))}</td></tr>)}</tbody></table></div><p><strong>Total de faturas dos fornecedores: {euro(resumoMes.totalFaturasFornecedores)}</strong></p></div></details><details className="compact-section"><summary><span>Despesas Fixas Mensais</span><strong>{euro(resumoMes.totalDespesasFixas)}</strong><span aria-hidden="true">▾</span></summary><div className="compact-body"><p className="sub">As categorias mantêm-se em todos os meses. Os valores começam a zero em cada novo mês e são preenchidos manualmente. São descontados nos dois saldos mensais. Guarda cada linha depois de a preencher.</p><div className="tablewrap"><table><thead><tr><th>Despesa</th><th>Valor do mês (€)</th><th>Ações</th></tr></thead><tbody>{categoriasFixas.map(c=><tr key={c.id}><td>{c.nome}</td><td><input aria-label={'Valor de '+c.nome} type="number" min="0" step="0.01" value={edicoesFixas[c.id]??''} placeholder="0,00" onChange={e=>setEdicoesFixas(v=>({...v,[c.id]:e.target.value}))}/></td><td><button type="button" className="link" disabled={busy||mesLoading||fixasLoading} onClick={()=>void guardarDespesaFixa(c)}>Guardar</button> <button type="button" className="link" disabled={busy} onClick={()=>void renomearCategoriaFixa(c)}>Renomear</button> <button type="button" className="link" disabled={busy} onClick={()=>void eliminarCategoriaFixa(c)}>Eliminar</button></td></tr>)}</tbody></table></div><p><strong>Total de despesas fixas do mês: {euro(resumoMes.totalDespesasFixas)}</strong></p><form onSubmit={adicionarCategoriaFixa}><div className="toolbar"><label>Nova despesa fixa<input value={nomeCategoriaFixa} required placeholder="Nome da despesa" onChange={e=>setNomeCategoriaFixa(e.target.value)}/></label><button type="submit" disabled={busy||fixasLoading}>Adicionar categoria</button></div></form></div></details><details className="compact-section"><summary><span>Despesas com contribuinte</span><strong>{euro(resumoMes.totais.despesa_faturada)}</strong><span aria-hidden="true">▾</span></summary><div className="compact-body"><div className="tablewrap"><table><thead><tr><th>Categoria</th><th>Total mensal</th></tr></thead><tbody>{categorias.filter(c=>(grupos[c.id]||grupoInicial(c))==='despesa_faturada').map(c=><tr key={c.id}><td>{c.nome}</td><td>{euro(resumoMes.detalhes[c.id]||0)}</td></tr>)}</tbody></table></div></div></details><details className="compact-section"><summary><span>Despesas sem contribuinte — apenas no Resumo Mensal</span><strong>{euro(resumoMes.totalSemContribuinte)}</strong><span aria-hidden="true">▾</span></summary><div className="compact-body"><p className="sub">Registos exclusivos deste mês. Não entram no Diário de Bordo nem no Resumo Semanal.</p><form onSubmit={guardarDespesaMensal}><div className="toolbar"><label>Data<DataPortugues required value={novaDespesaMensal.data} onChange={e=>setNovaDespesaMensal(v=>({...v,data:e.target.value}))}/></label><label>Descrição<input required value={novaDespesaMensal.descricao} onChange={e=>setNovaDespesaMensal(v=>({...v,descricao:e.target.value}))} placeholder="Ex.: compra diversa"/></label><label>Valor (€)<input type="number" required min="0.01" step="0.01" value={novaDespesaMensal.valor} onChange={e=>setNovaDespesaMensal(v=>({...v,valor:e.target.value}))}/></label><button type="submit" disabled={busy||mesLoading}>{despesaEditando?'Guardar alteração':'Adicionar despesa'}</button>{despesaEditando&&<button type="button" className="ghost" onClick={()=>{setDespesaEditando(null);setNovaDespesaMensal({data:mes+'-01',descricao:'',valor:''})}}>Cancelar</button>}</div></form><div className="tablewrap"><table><thead><tr><th>Data</th><th>Descrição</th><th>Valor</th><th>Ações</th></tr></thead><tbody>{despesasSemContribuinte.map(d=><tr key={d.id}><td>{dataPT(d.data)}</td><td>{d.descricao}</td><td>{euro(Number(d.valor))}</td><td><button type="button" className="link" disabled={busy} onClick={()=>editarDespesaMensal(d)}>Editar</button> <button type="button" className="link" disabled={busy} onClick={()=>void eliminarDespesaMensal(d)}>Eliminar</button></td></tr>)}</tbody></table></div><p><strong>Total sem contribuinte: {euro(resumoMes.totalSemContribuinte)}</strong></p></div></details><details className="compact-section"><summary><span>Despesas caixa de gomas</span><strong>{euro(despesasGomas.reduce((n,d)=>n+Number(d.valor),0))}</strong><span aria-hidden="true">▾</span></summary><div className="compact-body"><p className="sub">Registo mensal independente para controlo da caixa de gomas. Não altera automaticamente o Total Mensal — Global nem a Faturação.</p><form onSubmit={guardarDespesaGomas}><div className="toolbar"><label>Data<DataPortugues required value={novaDespesaGomas.data} onChange={e=>setNovaDespesaGomas(v=>({...v,data:e.target.value}))}/></label><label>Despesa<select required value={novaDespesaGomas.categoria} onChange={e=>setNovaDespesaGomas(v=>({...v,categoria:e.target.value}))}>{categoriasGomas.map(c=><option key={c} value={c}>{c}</option>)}</select></label><label>Valor (€)<input type="number" required min="0.01" step="0.01" value={novaDespesaGomas.valor} onChange={e=>setNovaDespesaGomas(v=>({...v,valor:e.target.value}))}/></label><button type="submit" disabled={busy||mesLoading}>{gomasEditando?'Guardar alteração':'Adicionar despesa'}</button>{gomasEditando&&<button type="button" className="ghost" onClick={()=>{setGomasEditando(null);setNovaDespesaGomas({data:mes+'-01',categoria:'Artquel',valor:''})}}>Cancelar</button>}</div></form><div className="tablewrap"><table><thead><tr><th>Data</th><th>Despesa</th><th>Valor</th><th>Ações</th></tr></thead><tbody>{despesasGomas.map(d=><tr key={d.id}><td>{dataPT(d.data)}</td><td>{d.categoria}</td><td>{euro(Number(d.valor))}</td><td><button type="button" className="link" disabled={busy} onClick={()=>editarDespesaGomas(d)}>Editar</button> <button type="button" className="link" disabled={busy} onClick={()=>void eliminarDespesaGomas(d)}>Eliminar</button></td></tr>)}</tbody></table></div><p><strong>Total de despesas da caixa de gomas: {euro(despesasGomas.reduce((n,d)=>n+Number(d.valor),0))}</strong></p></div></details><details id="valores-acrescentados-caixa" className="compact-section" open={atalhoValoresCaixa}><summary><span>Valores Acrescentados à Caixa</span><strong>{euro(resumoMes.totalRetirado)}</strong><span aria-hidden="true">▾</span></summary><div className="compact-body"><p className="sub">Registos apenas do Resumo Mensal. Valor informativo de controlo interno. Não é somado nem subtraído ao Total Mensal — Global, às Outras Vendas ou à Faturação.</p><form onSubmit={guardarValorCaixa}><div className="toolbar"><label>Data<DataPortugues required value={novoValorCaixa.data} onChange={e=>setNovoValorCaixa(v=>({...v,data:e.target.value}))}/></label><label>Valor (€)<input id="valor-caixa-atalho" type="number" required min="0.01" step="0.01" value={novoValorCaixa.valor} onChange={e=>setNovoValorCaixa(v=>({...v,valor:e.target.value}))}/></label><button type="submit" disabled={busy||mesLoading}>{valorCaixaEditando?'Guardar alteração':'Adicionar valor'}</button>{valorCaixaEditando&&<button type="button" className="ghost" onClick={()=>{setValorCaixaEditando(null);setNovoValorCaixa({data:mes+'-01',valor:''})}}>Cancelar</button>}</div></form><div className="tablewrap"><table><thead><tr><th>Data</th><th>Valor</th><th>Ações</th></tr></thead><tbody>{valoresAcrescentados.map(v=><tr key={v.id}><td>{dataPT(v.data)}</td><td>{euro(Number(v.valor))}</td><td><button type="button" className="link" disabled={busy} onClick={()=>editarValorCaixa(v)}>Editar</button> <button type="button" className="link" disabled={busy} onClick={()=>void eliminarValorCaixa(v)}>Eliminar</button></td></tr>)}</tbody></table></div><p><strong>Total de valores acrescentados (informativo): {euro(resumoMes.totalRetirado)}</strong></p><p><strong>Outras Vendas (sem ajustes): {euro(resumoMes.outrasVendasCorrigidas)}</strong></p></div></details><details className="compact-section"><summary><span>Faturas emitidas no mês</span><strong>{euro(resumoMes.faturas)}</strong><span aria-hidden="true">▾</span></summary><div className="compact-body"><div className="tablewrap"><table><thead><tr><th>Data</th><th>Cliente</th><th>Fatura</th><th>Tipo</th><th>Valor</th></tr></thead><tbody>{faturasMes.map(f=><tr key={f.id}><td>{dataPT(f.data)}</td><td>{f.cliente}</td><td>{f.numero}</td><td>{f.tipo_fatura==='habitual'?'Faturas Habituais':'Fatura'}</td><td>{euro(Number(f.valor))}</td></tr>)}</tbody></table></div></div></details><details className="compact-section"><summary><span>Vendas por Cliente</span><strong>{euro(resumoMes.totalVendasClientes)}</strong><span aria-hidden="true">▾</span></summary><div className="compact-body"><p className="sub">Vendas registadas no Diário de Bordo em Outras Vendas, agrupadas por categoria, e faturas classificadas como Fatura, agrupadas por cliente. As Faturas Habituais não entram neste detalhe.</p><div className="tablewrap"><table><thead><tr><th>Cliente / categoria</th><th>Diário de Bordo</th><th>Fatura</th><th>Total</th></tr></thead><tbody>{resumoMes.clientesVendas.map(c=><tr key={c.cliente}><td>{c.cliente}</td><td>{euro(c.diario)}</td><td>{euro(c.fatura)}</td><td><strong>{euro(c.diario+c.fatura)}</strong></td></tr>)}</tbody><tfoot><tr><th>Total</th><th>{euro(resumoMes.clientesVendas.reduce((n,c)=>n+c.diario,0))}</th><th>{euro(resumoMes.faturasReais)}</th><th>{euro(resumoMes.totalVendasClientes)}</th></tr></tfoot></table></div></div></details><details className="compact-section"><summary><span>Evolução por semana</span><strong>Ver detalhes</strong><span aria-hidden="true">▾</span></summary><div className="compact-body"><p className="sub">Cada linha inclui apenas os dias que pertencem ao mês selecionado. Os 200 € em moedas entram apenas no total mensal. Os valores acrescentados à caixa são informativos.</p><div className="tablewrap"><table><thead><tr><th>Semana iniciada em</th><th>Faturas</th><th>Caixa</th><th>Outras vendas</th><th>Despesas</th></tr></thead><tbody>{Object.entries(resumoMes.semanas).sort(([a],[b])=>a.localeCompare(b)).map(([inicio,w])=><tr key={inicio}><td>{dataPT(inicio)}</td><td>{euro(w.faturas)}</td><td>{euro(w.caixa)}</td><td>{euro(w.outras)}</td><td>{euro(w.despesas)}</td></tr>)}</tbody></table></div></div></details></section></>:aba==='banco_cofre'?<><h1>Banco e Cofre</h1><p className="sub">Entradas, saídas e saldos separados. Os movimentos não alteram automaticamente o Diário de Bordo ou o Resumo Mensal.</p>{caixaErro&&<p role="alert" className="status">Erro ao carregar movimentos: {caixaErro}</p>}<div className="toolbar"><button type="button" className="ghost" disabled={caixaLoading} onClick={()=>void carregarMovimentosCaixa()}>{caixaLoading?'A carregar...':'Atualizar movimentos'}</button></div>{(['banco','cofre'] as const).map(conta=>{const t=totaisCaixa[conta];const saldo=t.entradas-t.saidas;const movimentos=movimentosCaixa.filter(m=>m.conta===conta);return <details className="panel" key={conta} style={{marginBottom:18}}><summary style={{cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'space-between',gap:16,fontSize:20,fontWeight:700,color:'#641d32'}}><span>Movimentos {conta==='banco'?'Banco':'Cofre'}</span><strong>{euro(saldo)}</strong></summary><div style={{paddingTop:20}}><div className="cards"><div className="metric"><span>Entradas</span><strong>{euro(t.entradas)}</strong></div><div className="metric"><span>Saídas</span><strong>{euro(t.saidas)}</strong></div><div className="metric"><span>Saldo</span><strong>{euro(saldo)}</strong></div></div><h3>{caixaEditando&&novoMovimentoCaixa.conta===conta?'Editar movimento':'Adicionar movimento'}</h3><form onSubmit={e=>void guardarMovimentoCaixa(e,conta)}><div className="toolbar" style={{flexWrap:'wrap',justifyContent:'flex-start'}}><label>Tipo<select aria-label={'Tipo de movimento '+conta} style={{border:'1px solid #d7c6bc',borderRadius:7,padding:'12px 14px',fontSize:17,fontFamily:'inherit',background:'#fff',color:'#392d2c',minWidth:150,cursor:'pointer'}} value={novoMovimentoCaixa.conta===conta?novoMovimentoCaixa.tipo:'entrada'} onChange={e=>setNovoMovimentoCaixa(v=>({...v,conta,tipo:e.target.value as 'entrada'|'saida'}))}><option value="entrada">Entrada</option><option value="saida">Saída</option></select></label><label>Data<DataPortugues required value={novoMovimentoCaixa.conta===conta?novoMovimentoCaixa.data:hoje()} onChange={e=>setNovoMovimentoCaixa(v=>({...v,conta,data:e.target.value}))}/></label><label>Descrição<input required value={novoMovimentoCaixa.conta===conta?novoMovimentoCaixa.descricao:''} onChange={e=>setNovoMovimentoCaixa(v=>({...v,conta,descricao:e.target.value}))} placeholder="Ex.: depósito, levantamento"/></label><label>Valor (€)<input required type="number" min="0.01" step="0.01" value={novoMovimentoCaixa.conta===conta?novoMovimentoCaixa.valor:''} onChange={e=>setNovoMovimentoCaixa(v=>({...v,conta,valor:e.target.value}))}/></label><button disabled={busy} type="submit" onClick={()=>{if(novoMovimentoCaixa.conta!==conta){setCaixaEditando(null);setNovoMovimentoCaixa({conta,data:hoje(),tipo:'entrada',descricao:'',valor:''})}}}>{caixaEditando&&novoMovimentoCaixa.conta===conta?'Guardar alteração':'Adicionar movimento'}</button>{caixaEditando&&novoMovimentoCaixa.conta===conta&&<button type="button" className="ghost" onClick={()=>{setCaixaEditando(null);setNovoMovimentoCaixa({conta,data:hoje(),tipo:'entrada',descricao:'',valor:''})}}>Cancelar</button>}</div></form><h3>Histórico de movimentos</h3><div className="tablewrap"><table><thead><tr><th>Data</th><th>Descrição</th><th>Entrada</th><th>Saída</th><th>Ações</th></tr></thead><tbody>{movimentos.map(m=><tr key={m.id}><td>{dataPT(m.data)}</td><td>{m.descricao}</td><td>{m.tipo==='entrada'?euro(Number(m.valor)):'—'}</td><td>{m.tipo==='saida'?euro(Number(m.valor)):'—'}</td><td><button type="button" className="link" disabled={busy} onClick={()=>editarMovimentoCaixa(m)}>Editar</button> <button type="button" className="link" disabled={busy} onClick={()=>void eliminarMovimentoCaixa(m)}>Eliminar</button></td></tr>)}</tbody></table></div>{movimentos.length===0&&<p>Ainda não existem movimentos nesta conta.</p>}</div></details>})}</>:aba==='fornecedores'?
  <><h1>Fornecedores</h1><p className="sub">Cadastro, compras, pagamentos e saldos</p><section className="panel" style={{marginBottom:18,border:'2px solid #641d32',background:'#fffaf2'}}><button type="button" onClick={()=>setMostrarAdicionarFatura(v=>!v)} style={{fontSize:18,fontWeight:800,padding:'13px 20px'}} aria-expanded={mostrarAdicionarFatura}>{mostrarAdicionarFatura?'− Fechar formulário':'+ Adicionar fatura'}</button>{mostrarAdicionarFatura&&<form onSubmit={guardarFaturaFornecedor} style={{marginTop:18}}><h2>Adicionar fatura de fornecedor</h2><div className="toolbar" style={{alignItems:'end',flexWrap:'wrap'}}><label>Fornecedor *<select required value={faturaFornecedorNova.fornecedor_id} onChange={e=>setFaturaFornecedorNova(v=>({...v,fornecedor_id:e.target.value}))}><option value="">Escolher fornecedor...</option>{fornecedores.map(f=><option key={f.id} value={f.id}>{f.nome}</option>)}</select></label><label>Data da fatura *<DataPortugues required value={faturaFornecedorNova.data} onChange={e=>setFaturaFornecedorNova(v=>({...v,data:e.target.value}))}/></label><label>N.º da fatura *<input required value={faturaFornecedorNova.numero} onChange={e=>setFaturaFornecedorNova(v=>({...v,numero:e.target.value}))} placeholder="Ex.: FT 2026/123"/></label><label>Valor (€) *<input required type="number" step="0.01" value={faturaFornecedorNova.valor} onChange={e=>setFaturaFornecedorNova(v=>({...v,valor:e.target.value}))} placeholder="Ex.: 250 ou -50"/></label></div><p className="sub" style={{marginTop:8}}>Para notas de crédito, introduz um valor negativo (ex.: -50,00 €) e identifica o documento como NC. O valor reduz a dívida ao fornecedor sem gerar um pagamento.</p><label>Descrição (opcional)<input value={faturaFornecedorNova.descricao} onChange={e=>setFaturaFornecedorNova(v=>({...v,descricao:e.target.value}))} placeholder="Ex.: Produtos de pastelaria"/></label><div className="toolbar"><button type="submit" disabled={busy}>{busy?'A guardar...':'Guardar fatura'}</button><button type="button" className="ghost" onClick={()=>setMostrarAdicionarFatura(false)}>Cancelar</button></div><p className="sub">A fatura é registada como compra e fica disponível nos movimentos e na conta corrente do fornecedor.</p></form>}</section><section className="panel"><h2>Lista de fornecedores</h2><p className="sub">Valores das faturas do mês anterior e do mês atual. Os pagamentos são considerados por ordem das dívidas mais antigas.</p>{resumoFornecedoresCarregando&&<p className="sub">A atualizar valores mensais...</p>}<div className="tablewrap"><table><thead><tr><th>Nome</th><th>{periodoFornecedores.rotuloAnterior}</th><th>{periodoFornecedores.rotuloAtual}</th><th>Ações</th></tr></thead><tbody>{fornecedores.map(f=>{const r=resumoPorFornecedor.get(f.id);const anterior=r?.anterior||0;const atual=r?.atual||0;const pago=anterior>0&&(r?.pagamentos||0)+0.005>=(r?.comprasAteAnterior||0);return <tr key={f.id} style={fornecedorSelecionado===f.id?{background:"#fff4df"}:undefined}><td>{f.nome}</td><td><strong>{euro(anterior)}</strong>{anterior>0&&<small style={{display:"block",fontWeight:750,color:pago?"#217346":"#8a4b29"}}>{pago?"Pago":"Por pagar"}</small>}</td><td><strong>{euro(atual)}</strong></td><td><button className="link" onClick={()=>{setFornecedorSelecionado(f.id);setTimeout(()=>document.getElementById("movimentos-do-fornecedor")?.scrollIntoView({behavior:"smooth",block:"start"}),50)}}>Ver movimentos</button> <button className="link" onClick={()=>editarFornecedor(f)}>Editar</button></td></tr>})}</tbody></table></div>{fornecedores.length===0&&<p>Ainda não existem fornecedores.</p>}</section><section className="panel" id="movimentos-do-fornecedor"><h2>Movimentos do fornecedor</h2><label>Fornecedor <select value={fornecedorSelecionado} onChange={e=>setFornecedorSelecionado(e.target.value)}><option value="">Selecionar fornecedor</option>{fornecedores.map(f=><option key={f.id} value={f.id}>{f.nome}</option>)}</select></label>{fornecedorSelecionado&&<><div className="cards"><div className="metric"><span>Compras</span><strong>{euro(totalCompras)}</strong></div><div className="metric"><span>Pagamentos</span><strong>{euro(totalPagamentos)}</strong></div><div className="metric"><span>Saldo em dívida</span><strong>{euro(totalCompras-totalPagamentos)}</strong></div></div><h3>Novo movimento</h3><form onSubmit={guardarMovimentoFornecedor}><div className="toolbar"><label>Data<DataPortugues required  value={novoMovimento.data} onChange={e=>setNovoMovimento(v=>({...v,data:e.target.value}))}/></label><label>Tipo<select value={novoMovimento.tipo} onChange={e=>setNovoMovimento(v=>({...v,tipo:e.target.value as 'compra'|'pagamento'}))}><option value="compra">Compra</option><option value="pagamento">Pagamento</option></select></label>{novoMovimento.tipo==='pagamento'&&<p className="sub" style={{fontWeight:700,color:'#641d32'}}>Pagamento por Banco — será criada automaticamente uma saída nos movimentos bancários.</p>}<label>Valor (€)<input required type="number" min="0.01" step="0.01" value={novoMovimento.valor} onChange={e=>setNovoMovimento(v=>({...v,valor:e.target.value}))}/></label></div><div className="toolbar"><label>Documento<input value={novoMovimento.documento} onChange={e=>setNovoMovimento(v=>({...v,documento:e.target.value}))}/></label><label>Descrição<input value={novoMovimento.descricao} onChange={e=>setNovoMovimento(v=>({...v,descricao:e.target.value}))}/></label><button type="submit" disabled={busy}>Registar movimento</button></div></form><h3>Histórico de movimentos</h3><div className="tablewrap"><table><thead><tr><th>Data</th><th>Tipo</th><th>Valor</th><th>Documento</th><th>Origem</th><th>Descrição</th><th>Ação</th></tr></thead><tbody>{movimentosFornecedor.map(m=><tr key={m.id}><td>{dataPT(m.data)}</td><td>{m.tipo==='compra'?'Compra':'Pagamento'}</td><td>{euro(Number(m.valor))}</td><td>{m.documento||'—'}</td><td>{m.tipo==='pagamento'?(m.origem_pagamento==='banco'?'Banco':'Anterior à ligação'):'—'}</td><td>{m.descricao||'—'}</td><td><button className="link" disabled={busy} onClick={()=>void eliminarMovimentoFornecedor(m)}>Eliminar</button></td></tr>)}</tbody></table></div>{movimentosFornecedor.length===0&&<p>Ainda não existem movimentos registados para este fornecedor.</p>}</>}</section><section className="panel" id="adicionar-fornecedor"><h2>{editandoFornecedor?'Editar fornecedor':'Novo fornecedor'}</h2><form onSubmit={guardarFornecedor}><label>Nome *<input required value={novoFornecedor.nome} onChange={e=>setNovoFornecedor(v=>({...v,nome:e.target.value}))}/></label><label>NIF<input value={novoFornecedor.nif} onChange={e=>setNovoFornecedor(v=>({...v,nif:e.target.value}))}/></label><label>Telefone<input value={novoFornecedor.telefone} onChange={e=>setNovoFornecedor(v=>({...v,telefone:e.target.value}))}/></label><label>Email<input type="email" value={novoFornecedor.email} onChange={e=>setNovoFornecedor(v=>({...v,email:e.target.value}))}/></label><label>Observações<input value={novoFornecedor.observacoes} onChange={e=>setNovoFornecedor(v=>({...v,observacoes:e.target.value}))}/></label><div className="toolbar"><button disabled={busy} type="submit">{editandoFornecedor?'Guardar alterações':'Adicionar fornecedor'}</button>{editandoFornecedor&&<button type="button" className="ghost" onClick={()=>{setEditandoFornecedor(null);setNovoFornecedor(vazioFornecedor)}}>Cancelar</button>}</div></form></section></>:<><h1>Conta Corrente</h1><p className="sub">Faturas e pagamentos abatidos ao saldo global de cada fornecedor</p><section className="panel"><label>Fornecedor <select value={fornecedorSelecionado} onChange={e=>setFornecedorSelecionado(e.target.value)}><option value="">Selecionar fornecedor</option>{fornecedores.map(f=><option key={f.id} value={f.id}>{f.nome}</option>)}</select></label>{fornecedorSelecionado&&<><div className="cards"><div className="metric"><span>Total de compras / faturas</span><strong>{euro(totalCompras)}</strong></div><div className="metric"><span>Total de pagamentos</span><strong>{euro(totalPagamentos)}</strong></div><div className="metric"><span>Saldo global em dívida</span><strong>{euro(totalCompras-totalPagamentos)}</strong></div></div><p className="sub">Cada pagamento reduz o saldo total do fornecedor, sem estar associado a uma fatura específica. Os pagamentos registados pelo Banco aparecem também nos movimentos bancários.</p><h2>Extrato da conta corrente</h2><div className="tablewrap"><table><thead><tr><th>Data</th><th>Tipo</th><th>Documento</th><th>Descrição</th><th>Compra / Fatura</th><th>Pagamento</th><th>Saldo acumulado</th></tr></thead><tbody>{movimentosFornecedor.length===0?<tr><td colSpan={7}>Não existem movimentos para este fornecedor.</td></tr>:[...movimentosFornecedor].sort((a,b)=>a.data.localeCompare(b.data)||a.id.localeCompare(b.id)).map((m,i,ordenados)=>{const saldo=ordenados.slice(0,i+1).reduce((total,mov)=>total+(mov.tipo==='compra'?Number(mov.valor):-Number(mov.valor)),0);return <tr key={m.id} style={{background:m.tipo==='pagamento'?'#e9f5eb':undefined}}><td>{dataPT(m.data)}</td><td>{m.tipo==='compra'?'Fatura / Compra':'Pagamento'}</td><td>{m.documento||'—'}</td><td>{m.descricao||'—'}</td><td>{m.tipo==='compra'?euro(Number(m.valor)):'—'}</td><td>{m.tipo==='pagamento'?euro(Number(m.valor)):'—'}</td><td><strong>{euro(saldo)}</strong></td></tr>})}</tbody></table></div></>}</section></>}
</main></>;
}