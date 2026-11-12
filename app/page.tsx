'use client';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

type Categoria = { id:number; tipo:'venda'|'despesa'; nome:string; ordem:number };
type Movimento = { id:string; categoria_id:number; valor:number; descricao:string|null };
type Resumo = { data:string; total_vendas:number; total_despesas:number; saldo:number };
type Fornecedor = { id:string; nome:string; nif:string|null; telefone:string|null; email:string|null; observacoes:string|null; ativo:boolean };
type MovimentoFornecedor = { id:string; fornecedor_id:string; data:string; tipo:'compra'|'pagamento'; valor:number; documento:string|null; descricao:string|null; vencimento?:string|null };
type GrupoSemanal = 'caixa_banco'|'venda_faturada'|'venda_outra'|'despesa_faturada'|'despesa_outra';
type DespesaSemContribuinte = {id:string;data:string;descricao:string;valor:number};
type ValorAcrescentadoCaixa = {id:string;data:string;valor:number};
type CategoriaFixa = {id:string;nome:string;ordem:number};
type ValorFixoMes = {categoria_id:string;mes:string;valor:number};
type FaturaFornecedorMes = {id:string;fornecedor_id:string;data:string;documento:string|null;valor:number};
type FaturaInterna = {id:string; data:string; cliente:string; numero:string; valor:number};
type LinhaSemanal = { data:string; categoria_id:number; valor:number };
type SemanaMensal = { faturas:number; caixa:number; outras:number; despesas:number };
type TotaisMensais = Record<GrupoSemanal,number>;
const totaisVazios = ():TotaisMensais => ({caixa_banco:0,venda_faturada:0,venda_outra:0,despesa_faturada:0,despesa_outra:0});
type AssociacaoPagamento = { id:string; pagamento_id:string; fatura_id:string; valor:number };
const hoje = () => new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
const euro = (n:number) => new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR'}).format(n);
function mensagemErro(e:unknown):string {
 if (e && typeof e === 'object') {const v=e as {message?:unknown;details?:unknown;hint?:unknown;code?:unknown}; return [v.message,v.details,v.hint,v.code].filter(x=>typeof x==='string'&&x).join(' | ')||JSON.stringify(e);}
 return String(e);
}
const inicioSemana = (iso:string) => {const d=new Date(iso+'T12:00:00');const dia=(d.getDay()+6)%7;d.setDate(d.getDate()-dia);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
const somarDias = (iso:string, dias:number) => {const d=new Date(iso+'T12:00:00');d.setDate(d.getDate()+dias);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
const gruposSemanais:{value:GrupoSemanal;label:string}[]=[{value:'caixa_banco',label:'Caixa para banco'},{value:'venda_faturada',label:'Vendas faturadas'},{value:'venda_outra',label:'Outras vendas'},{value:'despesa_faturada',label:'Despesa com contribuinte'},{value:'despesa_outra',label:'Outras despesas'}];
const grupoInicial = (c:Categoria):GrupoSemanal => {if(c.tipo==='venda')return 'caixa_banco';return /panik|lays|lay.s|g[aá]s|h[eé]lder|helder|outro faturado/i.test(c.nome)?'despesa_faturada':'despesa_outra'};
const vazioFornecedor = {nome:'',nif:'',telefone:'',email:'',observacoes:''};
export default function Home(){
 const [session,setSession]=useState<Session|null>(null);
 const [ready,setReady]=useState(false),[autorizado,setAutorizado]=useState(false);
 const [email,setEmail]=useState(''),[password,setPassword]=useState('');
 const [aba,setAba]=useState<'diario'|'mensal'|'fornecedores'|'conta'>('diario');
 const [data,setData]=useState(hoje()),[categorias,setCategorias]=useState<Categoria[]>([]);
 const [valores,setValores]=useState<Record<number,string>>({}),[descricoes,setDescricoes]=useState<Record<number,string>>({});
 const [resumos,setResumos]=useState<Resumo[]>([]),[estado,setEstado]=useState(''),[busy,setBusy]=useState(false);
 const [fornecedores,setFornecedores]=useState<Fornecedor[]>([]),[movimentosFornecedor,setMovimentosFornecedor]=useState<MovimentoFornecedor[]>([]);
 const [fornecedorSelecionado,setFornecedorSelecionado]=useState('');
 const [associacoes,setAssociacoes]=useState<AssociacaoPagamento[]>([]);
 const [faturasInternas,setFaturasInternas]=useState<FaturaInterna[]>([]);
 const [faturaEditando,setFaturaEditando]=useState<string|null>(null);
 const [novaFatura,setNovaFatura]=useState({data:hoje(),cliente:'',numero:'',valor:''});
 const [faturasLoading,setFaturasLoading]=useState(false);
 const [semana,setSemana]=useState(inicioSemana(hoje()));
 const [mes,setMes]=useState(hoje().slice(0,7));
 const [mesLoading,setMesLoading]=useState(false);
  const [linhasMes,setLinhasMes]=useState<LinhaSemanal[]>([]);
  const [faturasMes,setFaturasMes]=useState<FaturaInterna[]>([]);
  const [faturasFornecedoresMes,setFaturasFornecedoresMes]=useState<FaturaFornecedorMes[]>([]);
  const [despesasSemContribuinte,setDespesasSemContribuinte]=useState<DespesaSemContribuinte[]>([]);
  const [valoresAcrescentados,setValoresAcrescentados]=useState<ValorAcrescentadoCaixa[]>([]);
  const [novoValorCaixa,setNovoValorCaixa]=useState({data:hoje(),valor:''});
  const [valorCaixaEditando,setValorCaixaEditando]=useState<string|null>(null);
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
 const [novoMovimento,setNovoMovimento]=useState({data:hoje(),tipo:'compra' as 'compra'|'pagamento',valor:'',documento:'',descricao:''});
 useEffect(()=>{void supabase.auth.getSession().then(({data})=>{setSession(data.session);setReady(true)});const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,s)=>setSession(s));return ()=>subscription.unsubscribe()},[]);
 useEffect(()=>{if(!session){setAutorizado(false);return}let active=true;void supabase.from('administradores').select('user_id').eq('user_id',session.user.id).maybeSingle().then(({data,error})=>{if(active){setAutorizado(!!data&&!error);if(error)setEstado(mensagemErro(error))}});return ()=>{active=false}},[session]);
 useEffect(()=>{if(!session||!autorizado)return;void carregarCategorias();void carregarDia();void carregarResumos();void carregarFornecedores()},[session,autorizado]);
 useEffect(()=>{if(session&&autorizado)void carregarDia()},[data]);
 useEffect(()=>{if(session&&autorizado){void carregarSemana();void carregarFaturas()}},[semana,session,autorizado]);
 useEffect(()=>{if(session&&autorizado&&categorias.length){void carregarGrupos()}},[categorias,session,autorizado]);
 useEffect(()=>{if(session&&autorizado&&aba==='mensal')void carregarMes()},[mes,aba,session,autorizado]);
 useEffect(()=>{if(session&&autorizado&&aba==='mensal')void carregarCategoriasFixas()},[aba,session,autorizado]);
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
    const {data:rows,error}=await supabase.from('faturas_emitidas_internas').select('id,data,cliente,numero,valor').gte('data',primeiro).lte('data',ultimo).order('data',{ascending:false}).range(offset,offset+499);
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
   setLinhasMes([]);setFaturasMes([]);setFaturasFornecedoresMes([]);setDespesasSemContribuinte([]);setValoresAcrescentados([]);setValoresFixos([]);setEdicoesFixas({});
   const mensagem='Erro no resumo mensal: '+mensagemErro(e);
   setErroMes(mensagem);setEstado(mensagem);
  }finally{setMesLoading(false)}
 }
 const resumoMes=useMemo(()=>{
  const totais=totaisVazios();
  const detalhes:Record<number,number>={};
  const semanas:Record<string,SemanaMensal>={};
  const semanaDe=(data:string)=>{const chave=inicioSemana(data);if(!semanas[chave])semanas[chave]={faturas:0,caixa:0,outras:0,despesas:0};return semanas[chave]};
  for(const m of linhasMes){
   const categoria=categorias.find(c=>c.id===m.categoria_id);
   if(!categoria)continue;
   const grupo=grupos[categoria.id]||grupoInicial(categoria);
   totais[grupo]+=m.valor;
   detalhes[categoria.id]=(detalhes[categoria.id]||0)+m.valor;
   const w=semanaDe(m.data);
   if(grupo==='caixa_banco')w.caixa+=m.valor;
   if(grupo==='venda_outra')w.outras+=m.valor;
   if(grupo==='despesa_faturada'||grupo==='despesa_outra')w.despesas+=m.valor;
  }
  const faturas=faturasMes.reduce((n,f)=>{semanaDe(f.data).faturas+=Number(f.valor);return n+Number(f.valor)},0);
  const totalRetirado=valoresAcrescentados.reduce((n,v)=>n+Number(v.valor),0);
   const outrasVendasCorrigidas=totais.venda_outra-totalRetirado;
   const vendas=faturas+totais.caixa_banco+outrasVendasCorrigidas+200;
  const totalSemContribuinte=despesasSemContribuinte.reduce((n,d)=>n+Number(d.valor),0);
  const totalFaturasFornecedores=faturasFornecedoresMes.reduce((n,f)=>n+Number(f.valor),0);
   const totalDespesasFixas=valoresFixos.reduce((n,v)=>n+Number(v.valor),0);
   const despesas=totais.despesa_faturada+totais.despesa_outra+totalSemContribuinte+totalFaturasFornecedores+totalDespesasFixas;
  const vendasFaturacao=faturas+totais.caixa_banco;
  const despesasFaturacao=totais.despesa_faturada+totalFaturasFornecedores+totalDespesasFixas;
  return {totais,detalhes,semanas,faturas,vendas,despesas,totalSemContribuinte,totalRetirado,outrasVendasCorrigidas,totalFaturasFornecedores,totalDespesasFixas,vendasFaturacao,despesasFaturacao,saldoFaturacao:vendasFaturacao-despesasFaturacao,saldo:vendas-despesas};
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
async function carregarFaturas(){setFaturasLoading(true);const {data:rows,error}=await supabase.from('faturas_emitidas_internas').select('id,data,cliente,numero,valor').gte('data',semana).lte('data',somarDias(semana,6)).order('data',{ascending:false});if(error)setEstado('Faturas emitidas: '+mensagemErro(error));else setFaturasInternas((rows||[]) as FaturaInterna[]);setFaturasLoading(false)}
 async function guardarFatura(e:FormEvent){e.preventDefault();const valor=Number(novaFatura.valor.replace(',','.'));if(!novaFatura.cliente.trim()||!novaFatura.numero.trim()||!Number.isFinite(valor)||valor<=0){setEstado('Preenche cliente, número e valor positivo.');return}setBusy(true);try{const payload={data:novaFatura.data,cliente:novaFatura.cliente.trim(),numero:novaFatura.numero.trim(),valor};const {error}=faturaEditando?await supabase.from('faturas_emitidas_internas').update(payload).eq('id',faturaEditando):await supabase.from('faturas_emitidas_internas').insert(payload);if(error)throw error;setFaturaEditando(null);setNovaFatura({data:hoje(),cliente:'',numero:'',valor:''});await carregarFaturas();await carregarMes();setEstado('Fatura registada para controlo interno.')}catch(e){setEstado('Erro na fatura: '+mensagemErro(e))}finally{setBusy(false)}}
 function editarFatura(f:FaturaInterna){setFaturaEditando(f.id);setNovaFatura({data:f.data,cliente:f.cliente,numero:f.numero,valor:String(f.valor)});setEstado('A editar fatura '+f.numero)}
 async function eliminarFatura(f:FaturaInterna){if(!window.confirm('Eliminar o registo interno da fatura '+f.numero+'?'))return;setBusy(true);try{const {error}=await supabase.from('faturas_emitidas_internas').delete().eq('id',f.id);if(error)throw error;await carregarFaturas();await carregarMes();setEstado('Registo interno eliminado.')}catch(e){setEstado('Erro ao eliminar fatura: '+mensagemErro(e))}finally{setBusy(false)}}
 async function carregarGrupos(){setConfigLoading(true);const {data,error}=await supabase.from('categoria_grupo_semanal').select('categoria_id,grupo');if(error){setEstado('Configuração semanal: '+mensagemErro(error));setConfigLoading(false);return}const next:Record<number,GrupoSemanal>={};for(const c of categorias)next[c.id]=grupoInicial(c);for(const x of data||[])next[x.categoria_id]=x.grupo as GrupoSemanal;setGrupos(next);setConfigLoading(false)}
 async function guardarGrupo(c:Categoria,grupo:GrupoSemanal){setConfigLoading(true);const {error}=await supabase.from('categoria_grupo_semanal').upsert({categoria_id:c.id,grupo},{onConflict:'categoria_id'});if(error)setEstado('Erro na classificação: '+mensagemErro(error));else{setGrupos(prev=>({...prev,[c.id]:grupo}));setEstado('Classificação guardada para os dois administradores.')}setConfigLoading(false)}
 async function carregarSemana(){setSemanaLoading(true);try{const fim=somarDias(semana,6);const {data:dias,error:de}=await supabase.from('diario_bordo').select('id,data').gte('data',semana).lte('data',fim).order('data');if(de)throw de;if(!dias?.length){setLinhasSemana([]);return}const datas=new Map(dias.map(d=>[d.id,d.data]));const {data:movs,error:me}=await supabase.from('movimentos').select('diario_id,categoria_id,valor').in('diario_id',dias.map(d=>d.id));if(me)throw me;setLinhasSemana((movs||[]).map(m=>({data:datas.get(m.diario_id)||semana,categoria_id:m.categoria_id,valor:Number(m.valor)})))}catch(e){setEstado('Erro no resumo semanal: '+mensagemErro(e))}finally{setSemanaLoading(false)}}
 const resumoSemana=useMemo(()=>{const totais:{caixa_banco:number;venda_faturada:number;venda_outra:number;despesa_faturada:number;despesa_outra:number}={caixa_banco:0,venda_faturada:0,venda_outra:0,despesa_faturada:0,despesa_outra:0};const detalhes:Record<number,number>={};for(const m of linhasSemana){const c=categorias.find(c=>c.id===m.categoria_id);if(!c)continue;const grupo=grupos[c.id]||grupoInicial(c);totais[grupo]+=m.valor;detalhes[c.id]=(detalhes[c.id]||0)+m.valor}return {totais,detalhes}},[linhasSemana,categorias,grupos]);
 async function carregarCategorias(){const {data,error}=await supabase.from('categorias').select('id,tipo,nome,ordem').eq('ativa',true).order('tipo',{ascending:false}).order('ordem');if(error)setEstado(mensagemErro(error));else setCategorias(data as Categoria[])}
 async function carregarDia(){const {data:diario,error}=await supabase.from('diario_bordo').select('id').eq('data',data).maybeSingle();if(error){setEstado(mensagemErro(error));return}if(!diario){setValores({});setDescricoes({});return}const {data:movs,error:me}=await supabase.from('movimentos').select('id,categoria_id,valor,descricao').eq('diario_id',diario.id);if(me){setEstado(mensagemErro(me));return}const next:Record<number,string>={},notas:Record<number,string>={};for(const m of (movs||[]) as Movimento[]){next[m.categoria_id]=String(m.valor);notas[m.categoria_id]=m.descricao||''}setValores(next);setDescricoes(notas)}
 async function carregarResumos(){const {data,error}=await supabase.from('resumo_diario').select('data,total_vendas,total_despesas,saldo').order('data',{ascending:false}).limit(30);if(error)setEstado(mensagemErro(error));else setResumos(data as Resumo[])}
 async function carregarFornecedores(){const {data,error}=await supabase.from('fornecedores').select('id,nome,nif,telefone,email,observacoes,ativo').order('nome');if(error){setEstado('Fornecedores: '+mensagemErro(error));return}setFornecedores((data||[]) as Fornecedor[])}
 async function carregarMovimentosFornecedor(id:string){if(!id){setMovimentosFornecedor([]);return}const {data,error}=await supabase.from('fornecedor_movimentos').select('id,fornecedor_id,data,tipo,valor,documento,descricao,vencimento').eq('fornecedor_id',id).order('data',{ascending:false}).order('id',{ascending:false});if(error){setEstado(mensagemErro(error));return}setMovimentosFornecedor((data||[]) as MovimentoFornecedor[])}
 useEffect(()=>{if(session&&autorizado)void carregarMovimentosFornecedor(fornecedorSelecionado)},[fornecedorSelecionado,session,autorizado]);
 useEffect(()=>{if(!session||!autorizado||!fornecedorSelecionado){setAssociacoes([]);return}let ativo=true;void supabase.from('fornecedor_pagamento_faturas').select('id,pagamento_id,fatura_id,valor').then(({data,error})=>{if(!ativo)return;if(error){setEstado('Conta Corrente: '+mensagemErro(error));setAssociacoes([])}else setAssociacoes((data||[]) as AssociacaoPagamento[])});return()=>{ativo=false}},[fornecedorSelecionado,session,autorizado,aba]);
 const totais=useMemo(()=>categorias.reduce((a,c)=>{const v=Number(valores[c.id]||0);if(Number.isFinite(v))a[c.tipo]+=v;return a},{venda:0,despesa:0}),[categorias,valores]);
 const totalFaturasInternas=faturasInternas.reduce((a,f)=>a+Number(f.valor),0);
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
   const valor=Number(raw.replace(',','.'));if(!Number.isFinite(valor)||valor<0)throw new Error('Valor inválido em '+c.nome);
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
  const {error}=await supabase.from('fornecedor_movimentos').insert({fornecedor_id:fornecedorSelecionado,data:novoMovimento.data,tipo:novoMovimento.tipo,valor,documento:novoMovimento.documento.trim()||null,descricao:novoMovimento.descricao.trim()||null});if(error)throw error;
  setNovoMovimento({data:hoje(),tipo:'compra',valor:'',documento:'',descricao:''});await carregarMovimentosFornecedor(fornecedorSelecionado);setEstado('Movimento registado com sucesso.');
 }catch(e){setEstado('Erro no movimento: '+mensagemErro(e))}finally{setBusy(false)}}
 async function eliminarMovimentoFornecedor(m:MovimentoFornecedor){if(!window.confirm('Eliminar este movimento de '+euro(Number(m.valor))+'? A operação ficará no histórico de auditoria.'))return;setBusy(true);setEstado('');try{const {data,error}=await supabase.from('fornecedor_movimentos').delete().eq('id',m.id).select('id');if(error)throw error;if(!data?.length)throw new Error('A eliminação não foi confirmada. Verifica as permissões.');await carregarMovimentosFornecedor(fornecedorSelecionado);setEstado('Movimento eliminado.')}catch(e){setEstado('Erro ao eliminar: '+mensagemErro(e))}finally{setBusy(false)}}
 if(!ready)return <main className="center">A carregar...</main>;
 if(!session)return <main className="login"><section className="panel"><div className="brand">EL REI <small>GESTÃO · DESDE 1992</small></div><h1>Entrar na gestão</h1><form onSubmit={entrar}><label>Email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Palavra-passe<input type="password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><button disabled={busy}>Entrar</button></form><p className="status">{estado}</p></section></main>;
 if(!autorizado)return <main className="center"><section className="panel"><h2>Acesso restrito</h2><p>Esta conta não está autorizada como administrador.</p><p>{estado}</p><button onClick={()=>supabase.auth.signOut()}>Sair</button></section></main>;
 return <><header><div className="brand">EL REI <small>GESTÃO · DESDE 1992</small></div><div className="user"><span>{session.user.email}</span><button className="ghost" onClick={()=>supabase.auth.signOut()}>Sair</button></div></header>
 <main className="content"><nav className="toolbar" aria-label="Módulos"><button className={aba==='diario'?'':'ghost'} onClick={()=>{setAba('diario');setEstado('')}}>Diário de Bordo</button><button className={aba==='mensal'?'':'ghost'} onClick={()=>{setAba('mensal');setEstado('')}}>Resumo Mensal</button><button className={aba==='fornecedores'?'':'ghost'} onClick={()=>{setAba('fornecedores');setEstado('');void carregarFornecedores()}}>Fornecedores</button><button className={aba==='conta'?'':'ghost'} onClick={()=>{setAba('conta');setEstado('');void carregarFornecedores();if(fornecedorSelecionado)void carregarMovimentosFornecedor(fornecedorSelecionado)}}>Conta Corrente</button></nav><p className="status" role="status">{estado}</p>
 {aba==='diario'?<><h1>Diário de Bordo</h1><p className="sub">Registo diário de vendas e despesas</p><div className="toolbar"><label>Data <input type="date" value={data} onChange={e=>setData(e.target.value)}/></label><button disabled={busy} onClick={guardar}>{busy?'A guardar...':'Guardar dia'}</button></div><div className="cards"><div className="metric"><span>Vendas</span><strong>{euro(totais.venda)}</strong></div><div className="metric"><span>Despesas</span><strong>{euro(totais.despesa)}</strong></div><div className="metric"><span>Saldo</span><strong>{euro(totais.venda-totais.despesa)}</strong></div></div><div className="columns">{(['venda','despesa'] as const).map(tipo=><section className="panel" key={tipo}><h2>{tipo==='venda'?'Vendas':'Despesas'}</h2>{categorias.filter(c=>c.tipo===tipo).map(c=><div className="field" key={c.id}><label htmlFor={'v'+c.id}>{c.nome}</label><input id={'v'+c.id} type="number" min="0" step="0.01" placeholder="0,00" value={valores[c.id]??''} onChange={e=>setValores(v=>({...v,[c.id]:e.target.value}))}/></div>)}</section>)}</div><section className="panel"><h2>Resumo semanal</h2><p className="sub">Segunda-feira a domingo. O total da caixa corresponde às vendas classificadas como «Caixa para banco».</p><div className="toolbar"><label>Semana (escolhe um dia) <input type="date" value={semana} onChange={e=>setSemana(inicioSemana(e.target.value))}/></label><strong>{semana} a {somarDias(semana,6)}</strong><button type="button" className="ghost" disabled={semanaLoading} onClick={()=>void carregarSemana()}>{semanaLoading?'A carregar...':'Atualizar semana'}</button></div><div className="cards"><div className="metric"><span>Caixa registada para o banco</span><strong>{euro(resumoSemana.totais.caixa_banco)}</strong></div><div className="metric"><span>Despesas com contribuinte</span><strong>{euro(resumoSemana.totais.despesa_faturada)}</strong></div><div className="metric"><span>Caixa menos despesas faturadas</span><strong>{euro(resumoSemana.totais.caixa_banco-resumoSemana.totais.despesa_faturada)}</strong></div></div><div className="cards"><div className="metric"><span>Outras vendas</span><strong>{euro(resumoSemana.totais.venda_outra)}</strong></div><div className="metric"><span>Outras despesas</span><strong>{euro(resumoSemana.totais.despesa_outra)}</strong></div><div className="metric"><span>Saldo dos outros movimentos</span><strong>{euro(resumoSemana.totais.venda_outra-resumoSemana.totais.despesa_outra)}</strong></div></div><h3>Total geral semanal</h3><p className="sub">Soma das faturas emitidas registadas abaixo, caixa registada, outras vendas e fundo fixo de moedas de 200,00 €. Não somes novamente as mesmas faturas numa categoria de vendas. As despesas são apresentadas separadamente e não são subtraídas deste total.</p><div className="tablewrap"><table><tbody><tr><th>Faturas emitidas (registo interno)</th><td>{euro(totalFaturasInternas)}</td></tr><tr><th>Caixa registada da semana</th><td>{euro(resumoSemana.totais.caixa_banco)}</td></tr><tr><th>Outras vendas da semana</th><td>{euro(resumoSemana.totais.venda_outra)}</td></tr><tr><th>Moedas (valor fixo)</th><td>{euro(200)}</td></tr><tr><th>Total geral semanal</th><td><strong>{euro(totalFaturasInternas+resumoSemana.totais.caixa_banco+resumoSemana.totais.venda_outra+200)}</strong></td></tr></tbody></table></div><h3>Faturas emitidas — registo interno</h3><p className="sub">Faturas emitidas noutro programa. Este registo não emite documentos fiscais. As faturas são somadas ao total semanal conforme a data de emissão.</p><form onSubmit={guardarFatura}><div className="toolbar"><label>Data<input type="date" required value={novaFatura.data} onChange={e=>setNovaFatura(v=>({...v,data:e.target.value}))}/></label><label>Cliente<input required value={novaFatura.cliente} onChange={e=>setNovaFatura(v=>({...v,cliente:e.target.value}))} placeholder="Açougueiros"/></label><label>N.º da fatura<input required value={novaFatura.numero} onChange={e=>setNovaFatura(v=>({...v,numero:e.target.value}))} placeholder="93"/></label><label>Valor (€)<input type="number" min="0.01" step="0.01" required value={novaFatura.valor} onChange={e=>setNovaFatura(v=>({...v,valor:e.target.value}))}/></label><button type="submit" disabled={busy}>{faturaEditando?'Guardar alteração':'Adicionar fatura'}</button>{faturaEditando&&<button type="button" className="ghost" onClick={()=>{setFaturaEditando(null);setNovaFatura({data:hoje(),cliente:'',numero:'',valor:''})}}>Cancelar</button>}</div></form><div className="tablewrap"><table><thead><tr><th>Data</th><th>Cliente</th><th>Fatura</th><th>Valor</th><th>Ações</th></tr></thead><tbody>{faturasInternas.map(f=><tr key={f.id}><td>{f.data}</td><td>{f.cliente}</td><td>{f.numero}</td><td>{euro(Number(f.valor))}</td><td><button type="button" className="link" disabled={busy} onClick={()=>editarFatura(f)}>Editar</button> <button type="button" className="link" disabled={busy} onClick={()=>void eliminarFatura(f)}>Eliminar</button></td></tr>)}</tbody></table></div><p><strong>Total de faturas da semana: {euro(totalFaturasInternas)}</strong>{faturasLoading?' (a carregar...)':''}</p><h3>Despesas com contribuinte — detalhe semanal</h3><div className="tablewrap"><table><thead><tr><th>Categoria</th><th>Total semanal</th></tr></thead><tbody>{categorias.filter(c=>(grupos[c.id]||grupoInicial(c))==='despesa_faturada').map(c=><tr key={c.id}><td>{c.nome}</td><td>{euro(resumoSemana.detalhes[c.id]||0)}</td></tr>)}</tbody></table></div><h3>Classificação das categorias</h3><p className="sub">Confirma a classificação uma vez. Fica guardada no Supabase e é igual para os dois administradores. As faturas emitidas devem ser registadas no formulário acima. Não voltes a lançá-las nas categorias diárias, para evitar duplicações. As categorias antigas «Vendas faturadas» não entram no novo total de faturas.</p><div className="tablewrap"><table><thead><tr><th>Categoria</th><th>Grupo semanal</th></tr></thead><tbody>{categorias.map(c=><tr key={c.id}><td>{c.nome}</td><td><select aria-label={'Grupo de '+c.nome} disabled={configLoading} value={grupos[c.id]||grupoInicial(c)} onChange={e=>void guardarGrupo(c,e.target.value as GrupoSemanal)}>{gruposSemanais.filter(g=>c.tipo==='venda'?g.value==='caixa_banco'||g.value==='venda_faturada'||g.value==='venda_outra':g.value==='despesa_faturada'||g.value==='despesa_outra').map(g=><option key={g.value} value={g.value}>{g.label}</option>)}</select></td></tr>)}</tbody></table></div></section><section className="panel"><h2>Últimos 30 dias registados</h2><div className="tablewrap"><table><thead><tr><th>Data</th><th>Vendas</th><th>Despesas</th><th>Saldo</th></tr></thead><tbody>{resumos.map(r=><tr key={r.data}><td><button className="link" onClick={()=>setData(r.data)}>{r.data}</button></td><td>{euro(Number(r.total_vendas))}</td><td>{euro(Number(r.total_despesas))}</td><td>{euro(Number(r.saldo))}</td></tr>)}</tbody></table></div></section></>:aba==='mensal'?<><h1>Resumo Mensal</h1><style>{`.compact-section{border:1px solid #e1d5cf;border-radius:12px;margin:14px 0;background:#fff;overflow:hidden}.compact-section>summary{display:flex;align-items:center;gap:12px;cursor:pointer;padding:17px 16px;list-style:none;font-weight:650}.compact-section>summary::-webkit-details-marker{display:none}.compact-section>summary>span:first-child{flex:1}.compact-section>summary>strong{white-space:nowrap;color:#69253a}.compact-section>summary>span:last-child{font-size:18px}.compact-section[open]>summary{border-bottom:1px solid #eee}.compact-body{padding:14px 16px}.compact-body .tablewrap{overflow-x:auto}@media(max-width:600px){.compact-section>summary{padding:14px 10px;font-size:14px}.compact-body{padding:12px 8px}}`}</style><p className="sub">Vendas e despesas por mês. As moedas contam apenas uma vez: 200,00 € por mês.</p><section className="panel"><div className="toolbar"><label>Mês <input type="month" value={mes} onChange={e=>{setMes(e.target.value);setDespesaEditando(null);setNovaDespesaMensal({data:e.target.value+'-01',descricao:'',valor:''});setValorCaixaEditando(null);setNovoValorCaixa({data:e.target.value+'-01',valor:''});setEdicoesFixas({})}}/></label><button type="button" className="ghost" disabled={mesLoading} onClick={()=>void carregarMes()}>{mesLoading?'A carregar...':'Atualizar resumo'}</button></div><details className="compact-section"><summary><span>Total Mensal — Faturação</span><strong>{euro(resumoMes.saldoFaturacao)}</strong><span aria-hidden="true">▾</span></summary><div className="compact-body"><div className="tablewrap"><table><tbody><tr><th>Caixa registada para o banco</th><td>{euro(resumoMes.totais.caixa_banco)}</td></tr><tr><th>Faturas emitidas</th><td>{euro(resumoMes.faturas)}</td></tr><tr><th>Total de vendas faturação</th><td><strong>{euro(resumoMes.vendasFaturacao)}</strong></td></tr><tr><th>Despesas com contribuinte</th><td>{euro(resumoMes.totais.despesa_faturada)}</td></tr><tr><th>Faturas dos fornecedores do mês</th><td>{euro(resumoMes.totalFaturasFornecedores)}</td></tr><tr><th>Despesas fixas mensais</th><td>{euro(resumoMes.totalDespesasFixas)}</td></tr><tr><th>Total de despesas faturação</th><td><strong>{euro(resumoMes.despesasFaturacao)}</strong></td></tr><tr><th>Saldo mensal — Faturação</th><td><strong>{euro(resumoMes.saldoFaturacao)}</strong></td></tr></tbody></table></div></div></details><h2>Total Mensal — Global</h2><div className="cards"><div className="metric"><span>Total geral mensal</span><strong>{euro(resumoMes.vendas)}</strong></div><div className="metric"><span>Despesas mensais</span><strong>{euro(resumoMes.despesas)}</strong></div><div className="metric"><span>Saldo mensal</span><strong>{euro(resumoMes.saldo)}</strong></div></div>{erroMes&&<p className="status" role="alert">Erro ao carregar o mês: {erroMes}</p>}{mesLoading&&<p>A carregar os dados do mês...</p>}{erroMes&&<p role="alert">{erroMes}</p>}<details className="compact-section"><summary><span>Discriminação do mês</span><strong>{euro(resumoMes.saldo)}</strong><span aria-hidden="true">▾</span></summary><div className="compact-body"><div className="tablewrap"><table><tbody><tr><th>Faturas emitidas (registo interno)</th><td>{euro(resumoMes.faturas)}</td></tr><tr><th>Caixa registada para o banco</th><td>{euro(resumoMes.totais.caixa_banco)}</td></tr><tr><th>Outras vendas (originais)</th><td>{euro(resumoMes.totais.venda_outra)}</td></tr><tr><th>Valores acrescentados à caixa — retirados das outras vendas</th><td>− {euro(resumoMes.totalRetirado)}</td></tr><tr><th>Outras vendas corrigidas</th><td><strong>{euro(resumoMes.outrasVendasCorrigidas)}</strong></td></tr><tr><th>Moedas (uma vez por mês)</th><td>{euro(200)}</td></tr><tr><th>Total geral mensal</th><td><strong>{euro(resumoMes.vendas)}</strong></td></tr><tr><th>Despesas com contribuinte</th><td>{euro(resumoMes.totais.despesa_faturada)}</td></tr><tr><th>Outras despesas</th><td>{euro(resumoMes.totais.despesa_outra)}</td></tr><tr><th>Despesas sem contribuinte (registo mensal)</th><td>{euro(resumoMes.totalSemContribuinte)}</td></tr><tr><th>Faturas dos fornecedores do mês</th><td>{euro(resumoMes.totalFaturasFornecedores)}</td></tr><tr><th>Despesas fixas mensais</th><td>{euro(resumoMes.totalDespesasFixas)}</td></tr><tr><th>Despesas totais</th><td><strong>{euro(resumoMes.despesas)}</strong></td></tr><tr><th>Saldo mensal</th><td><strong>{euro(resumoMes.saldo)}</strong></td></tr></tbody></table></div><p className="sub">O saldo é um indicador interno de vendas menos despesas registadas; não representa necessariamente lucro contabilístico. As categorias classificadas como «Vendas faturadas» não são somadas novamente, para evitar duplicações.</p><details className="compact-section"><summary><span>Faturas dos fornecedores do mês</span><strong>{euro(resumoMes.totalFaturasFornecedores)}</strong><span aria-hidden="true">▾</span></summary><div className="compact-body"><p className="sub">Compras registadas na Conta Corrente com data no mês selecionado, pagas ou por pagar. Os pagamentos não são descontados novamente. Movimentos de compra sem número de documento também entram no total.</p><div className="tablewrap"><table><thead><tr><th>Data</th><th>Fornecedor</th><th>Documento</th><th>Valor</th></tr></thead><tbody>{faturasFornecedoresMes.map(f=><tr key={f.id}><td>{f.data}</td><td>{fornecedores.find(x=>x.id===f.fornecedor_id)?.nome||'Fornecedor não identificado'}</td><td>{f.documento||'Sem documento'}</td><td>{euro(Number(f.valor))}</td></tr>)}</tbody></table></div><p><strong>Total de faturas dos fornecedores: {euro(resumoMes.totalFaturasFornecedores)}</strong></p><details className="compact-section"><summary><span>Despesas Fixas Mensais</span><strong>{euro(resumoMes.totalDespesasFixas)}</strong><span aria-hidden="true">▾</span></summary><div className="compact-body"><p className="sub">As categorias mantêm-se em todos os meses. Os valores começam a zero em cada novo mês e são preenchidos manualmente. São descontados nos dois saldos mensais. Guarda cada linha depois de a preencher.</p><div className="tablewrap"><table><thead><tr><th>Despesa</th><th>Valor do mês (€)</th><th>Ações</th></tr></thead><tbody>{categoriasFixas.map(c=><tr key={c.id}><td>{c.nome}</td><td><input aria-label={'Valor de '+c.nome} type="number" min="0" step="0.01" value={edicoesFixas[c.id]??''} placeholder="0,00" onChange={e=>setEdicoesFixas(v=>({...v,[c.id]:e.target.value}))}/></td><td><button type="button" className="link" disabled={busy||mesLoading||fixasLoading} onClick={()=>void guardarDespesaFixa(c)}>Guardar</button> <button type="button" className="link" disabled={busy} onClick={()=>void renomearCategoriaFixa(c)}>Renomear</button> <button type="button" className="link" disabled={busy} onClick={()=>void eliminarCategoriaFixa(c)}>Eliminar</button></td></tr>)}</tbody></table></div><p><strong>Total de despesas fixas do mês: {euro(resumoMes.totalDespesasFixas)}</strong></p><form onSubmit={adicionarCategoriaFixa}><div className="toolbar"><label>Nova despesa fixa<input value={nomeCategoriaFixa} required placeholder="Nome da despesa" onChange={e=>setNomeCategoriaFixa(e.target.value)}/></label><button type="submit" disabled={busy||fixasLoading}>Adicionar categoria</button></div></form><details className="compact-section"><summary><span>Despesas com contribuinte</span><strong>{euro(resumoMes.totais.despesa_faturada)}</strong><span aria-hidden="true">▾</span></summary><div className="compact-body"><div className="tablewrap"><table><thead><tr><th>Categoria</th><th>Total mensal</th></tr></thead><tbody>{categorias.filter(c=>(grupos[c.id]||grupoInicial(c))==='despesa_faturada').map(c=><tr key={c.id}><td>{c.nome}</td><td>{euro(resumoMes.detalhes[c.id]||0)}</td></tr>)}</tbody></table></div><details className="compact-section"><summary><span>Despesas sem contribuinte — apenas no Resumo Mensal</span><strong>{euro(resumoMes.totalSemContribuinte)}</strong><span aria-hidden="true">▾</span></summary><div className="compact-body"><p className="sub">Registos exclusivos deste mês. Não entram no Diário de Bordo nem no Resumo Semanal.</p><form onSubmit={guardarDespesaMensal}><div className="toolbar"><label>Data<input type="date" required value={novaDespesaMensal.data} onChange={e=>setNovaDespesaMensal(v=>({...v,data:e.target.value}))}/></label><label>Descrição<input required value={novaDespesaMensal.descricao} onChange={e=>setNovaDespesaMensal(v=>({...v,descricao:e.target.value}))} placeholder="Ex.: compra diversa"/></label><label>Valor (€)<input type="number" required min="0.01" step="0.01" value={novaDespesaMensal.valor} onChange={e=>setNovaDespesaMensal(v=>({...v,valor:e.target.value}))}/></label><button type="submit" disabled={busy||mesLoading}>{despesaEditando?'Guardar alteração':'Adicionar despesa'}</button>{despesaEditando&&<button type="button" className="ghost" onClick={()=>{setDespesaEditando(null);setNovaDespesaMensal({data:mes+'-01',descricao:'',valor:''})}}>Cancelar</button>}</div></form><div className="tablewrap"><table><thead><tr><th>Data</th><th>Descrição</th><th>Valor</th><th>Ações</th></tr></thead><tbody>{despesasSemContribuinte.map(d=><tr key={d.id}><td>{d.data}</td><td>{d.descricao}</td><td>{euro(Number(d.valor))}</td><td><button type="button" className="link" disabled={busy} onClick={()=>editarDespesaMensal(d)}>Editar</button> <button type="button" className="link" disabled={busy} onClick={()=>void eliminarDespesaMensal(d)}>Eliminar</button></td></tr>)}</tbody></table></div><p><strong>Total sem contribuinte: {euro(resumoMes.totalSemContribuinte)}</strong></p><details className="compact-section"><summary><span>Valores Acrescentados à Caixa</span><strong>{euro(resumoMes.totalRetirado)}</strong><span aria-hidden="true">▾</span></summary><div className="compact-body"><p className="sub">Registos apenas do Resumo Mensal. O total é retirado das Outras Vendas mensais, sem alterar o Diário de Bordo nem o Resumo Semanal. Não é contado como despesa.</p><form onSubmit={guardarValorCaixa}><div className="toolbar"><label>Data<input type="date" required value={novoValorCaixa.data} onChange={e=>setNovoValorCaixa(v=>({...v,data:e.target.value}))}/></label><label>Valor (€)<input type="number" required min="0.01" step="0.01" value={novoValorCaixa.valor} onChange={e=>setNovoValorCaixa(v=>({...v,valor:e.target.value}))}/></label><button type="submit" disabled={busy||mesLoading}>{valorCaixaEditando?'Guardar alteração':'Adicionar valor'}</button>{valorCaixaEditando&&<button type="button" className="ghost" onClick={()=>{setValorCaixaEditando(null);setNovoValorCaixa({data:mes+'-01',valor:''})}}>Cancelar</button>}</div></form><div className="tablewrap"><table><thead><tr><th>Data</th><th>Valor</th><th>Ações</th></tr></thead><tbody>{valoresAcrescentados.map(v=><tr key={v.id}><td>{v.data}</td><td>{euro(Number(v.valor))}</td><td><button type="button" className="link" disabled={busy} onClick={()=>editarValorCaixa(v)}>Editar</button> <button type="button" className="link" disabled={busy} onClick={()=>void eliminarValorCaixa(v)}>Eliminar</button></td></tr>)}</tbody></table></div><p><strong>Total retirado das Outras Vendas: {euro(resumoMes.totalRetirado)}</strong></p><p><strong>Outras Vendas corrigidas: {euro(resumoMes.outrasVendasCorrigidas)}</strong></p><details className="compact-section"><summary><span>Evolução por semana</span><span>Ver evolução</span><span aria-hidden="true">▾</span></summary><div className="compact-body"><p className="sub">Cada linha inclui apenas os dias que pertencem ao mês selecionado. Os 200 € em moedas e os valores acrescentados à caixa são ajustados apenas no total mensal, não nas semanas desta tabela.</p><div className="tablewrap"><table><thead><tr><th>Semana iniciada em</th><th>Faturas</th><th>Caixa</th><th>Outras vendas</th><th>Despesas</th></tr></thead><tbody>{Object.entries(resumoMes.semanas).sort(([a],[b])=>a.localeCompare(b)).map(([inicio,w])=><tr key={inicio}><td>{inicio}</td><td>{euro(w.faturas)}</td><td>{euro(w.caixa)}</td><td>{euro(w.outras)}</td><td>{euro(w.despesas)}</td></tr>)}</tbody></table></div><details className="compact-section"><summary><span>Faturas emitidas no mês</span><strong>{euro(resumoMes.faturas)}</strong><span aria-hidden="true">▾</span></summary><div className="compact-body"><div className="tablewrap"><table><thead><tr><th>Data</th><th>Cliente</th><th>Fatura</th><th>Valor</th></tr></thead><tbody>{faturasMes.map(f=><tr key={f.id}><td>{f.data}</td><td>{f.cliente}</td><td>{f.numero}</td><td>{euro(Number(f.valor))}</td></tr>)}</tbody></table></div></div></details></div></details></div></details></div></details></div></details></div></details></div></details></div></details></section></>:aba==='fornecedores'?
  <><h1>Fornecedores</h1><p className="sub">Cadastro, compras, pagamentos e saldos</p><div className="columns"><section className="panel"><h2>{editandoFornecedor?'Editar fornecedor':'Novo fornecedor'}</h2><form onSubmit={guardarFornecedor}><label>Nome *<input required value={novoFornecedor.nome} onChange={e=>setNovoFornecedor(v=>({...v,nome:e.target.value}))}/></label><label>NIF<input value={novoFornecedor.nif} onChange={e=>setNovoFornecedor(v=>({...v,nif:e.target.value}))}/></label><label>Telefone<input value={novoFornecedor.telefone} onChange={e=>setNovoFornecedor(v=>({...v,telefone:e.target.value}))}/></label><label>Email<input type="email" value={novoFornecedor.email} onChange={e=>setNovoFornecedor(v=>({...v,email:e.target.value}))}/></label><label>Observações<input value={novoFornecedor.observacoes} onChange={e=>setNovoFornecedor(v=>({...v,observacoes:e.target.value}))}/></label><div className="toolbar"><button disabled={busy} type="submit">{editandoFornecedor?'Guardar alterações':'Adicionar fornecedor'}</button>{editandoFornecedor&&<button type="button" className="ghost" onClick={()=>{setEditandoFornecedor(null);setNovoFornecedor(vazioFornecedor)}}>Cancelar</button>}</div></form></section><section className="panel"><h2>Lista de fornecedores</h2><div className="tablewrap"><table><thead><tr><th>Nome</th><th>NIF</th><th>Ações</th></tr></thead><tbody>{fornecedores.map(f=><tr key={f.id}><td>{f.nome}</td><td>{f.nif||'—'}</td><td><button className="link" onClick={()=>setFornecedorSelecionado(f.id)}>Movimentos</button> <button className="link" onClick={()=>editarFornecedor(f)}>Editar</button></td></tr>)}</tbody></table></div>{fornecedores.length===0&&<p>Ainda não existem fornecedores.</p>}</section></div>
 <section className="panel"><h2>Conta do fornecedor</h2><label>Fornecedor <select value={fornecedorSelecionado} onChange={e=>setFornecedorSelecionado(e.target.value)}><option value="">Selecionar fornecedor</option>{fornecedores.map(f=><option key={f.id} value={f.id}>{f.nome}</option>)}</select></label>{fornecedorSelecionado&&<><div className="cards"><div className="metric"><span>Compras</span><strong>{euro(totalCompras)}</strong></div><div className="metric"><span>Pagamentos</span><strong>{euro(totalPagamentos)}</strong></div><div className="metric"><span>Saldo em dívida</span><strong>{euro(totalCompras-totalPagamentos)}</strong></div></div><h3>Novo movimento</h3><form onSubmit={guardarMovimentoFornecedor}><div className="toolbar"><label>Data<input required type="date" value={novoMovimento.data} onChange={e=>setNovoMovimento(v=>({...v,data:e.target.value}))}/></label><label>Tipo<select value={novoMovimento.tipo} onChange={e=>setNovoMovimento(v=>({...v,tipo:e.target.value as 'compra'|'pagamento'}))}><option value="compra">Compra</option><option value="pagamento">Pagamento</option></select></label><label>Valor (€)<input required type="number" min="0.01" step="0.01" value={novoMovimento.valor} onChange={e=>setNovoMovimento(v=>({...v,valor:e.target.value}))}/></label></div><div className="toolbar"><label>Documento<input value={novoMovimento.documento} onChange={e=>setNovoMovimento(v=>({...v,documento:e.target.value}))}/></label><label>Descrição<input value={novoMovimento.descricao} onChange={e=>setNovoMovimento(v=>({...v,descricao:e.target.value}))}/></label><button type="submit" disabled={busy}>Registar movimento</button></div></form><h3>Histórico de movimentos</h3><div className="tablewrap"><table><thead><tr><th>Data</th><th>Tipo</th><th>Valor</th><th>Documento</th><th>Descrição</th><th>Ação</th></tr></thead><tbody>{movimentosFornecedor.map(m=><tr key={m.id}><td>{m.data}</td><td>{m.tipo==='compra'?'Compra':'Pagamento'}</td><td>{euro(Number(m.valor))}</td><td>{m.documento||'—'}</td><td>{m.descricao||'—'}</td><td><button className="link" disabled={busy} onClick={()=>void eliminarMovimentoFornecedor(m)}>Eliminar</button></td></tr>)}</tbody></table></div></>}</section></>:<><h1>Conta Corrente</h1><p className="sub">Faturas e pagamentos a fornecedores — consulta</p><section className="panel"><label>Fornecedor <select value={fornecedorSelecionado} onChange={e=>setFornecedorSelecionado(e.target.value)}><option value="">Selecionar fornecedor</option>{fornecedores.map(f=><option key={f.id} value={f.id}>{f.nome}</option>)}</select></label>{fornecedorSelecionado&&<><div className="cards"><div className="metric"><span>Compras</span><strong>{euro(totalCompras)}</strong></div><div className="metric"><span>Pagamentos</span><strong>{euro(totalPagamentos)}</strong></div><div className="metric"><span>Saldo global</span><strong>{euro(totalCompras-totalPagamentos)}</strong></div></div><p className="sub">O saldo global considera todos os movimentos. Os saldos por fatura consideram apenas pagamentos associados.</p><h2>Faturas / Compras</h2><div className="tablewrap"><table><thead><tr><th>Data</th><th>Documento</th><th>Vencimento</th><th>Valor</th><th>Associado</th><th>Por associar</th></tr></thead><tbody>{movimentosFornecedor.filter(m=>m.tipo==='compra').map(m=>{const pago=associacoes.filter(a=>a.fatura_id===m.id).reduce((n,a)=>n+Number(a.valor),0);return <tr key={m.id}><td>{m.data}</td><td>{m.documento||'—'}</td><td>{m.vencimento||'—'}</td><td>{euro(Number(m.valor))}</td><td>{euro(pago)}</td><td>{euro(Number(m.valor)-pago)}</td></tr>})}</tbody></table></div><h2>Pagamentos</h2><div className="tablewrap"><table><thead><tr><th>Data</th><th>Documento</th><th>Valor</th><th>Associado</th><th>Por associar</th></tr></thead><tbody>{movimentosFornecedor.filter(m=>m.tipo==='pagamento').map(m=>{const usado=associacoes.filter(a=>a.pagamento_id===m.id).reduce((n,a)=>n+Number(a.valor),0);return <tr key={m.id}><td>{m.data}</td><td>{m.documento||'—'}</td><td>{euro(Number(m.valor))}</td><td>{euro(usado)}</td><td>{euro(Number(m.valor)-usado)}</td></tr>})}</tbody></table></div></>}</section></>}
</main></>;
}
