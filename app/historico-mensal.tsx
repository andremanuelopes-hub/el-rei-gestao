'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {supabase} from '../lib/supabase';

type Linha={data:string;categoria:string;tipo:'venda'|'despesa';valor:number;descricao:string};
type Arquivo={mes:string;fechado_em:string;dados:Linha[]};
const eur=(n:number)=>new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR'}).format(n);
const dataPt=(s:string)=>s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4);
const mesAtual=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`};
const erroTexto=(e:unknown)=>e instanceof Error?e.message:String(e);
export default function HistoricoMensal(){
 const [mes,setMes]=useState(mesAtual());
 const [linhas,setLinhas]=useState<Linha[]>([]);
 const [arquivo,setArquivo]=useState<Arquivo|null>(null);
 const [dia,setDia]=useState('');
 const [loading,setLoading]=useState(false);
 const [fechando,setFechando]=useState(false);
 const [mensagem,setMensagem]=useState('');
 const carregar=useCallback(async()=>{
  setLoading(true);setMensagem('');
  try{
   const primeiro=mes+'-01';const ultimo=new Date(Number(mes.slice(0,4)),Number(mes.slice(5,7)),0).toISOString().slice(0,10);
   const {data:fechado,error:erroArquivo}=await supabase.from('arquivo_mensal').select('mes,fechado_em,dados').eq('mes',mes).maybeSingle();
   if(erroArquivo)throw new Error('Não foi possível consultar o arquivo. Executa primeiro o SQL de instalação: '+erroArquivo.message);
   if(fechado){const reg=fechado as Arquivo;setArquivo(reg);setLinhas(reg.dados||[]);setDia('');return}
   setArquivo(null);
   const dias:{id:string;data:string}[]=[];
   for(let offset=0;;offset+=500){const {data,error}=await supabase.from('diario_bordo').select('id,data').gte('data',primeiro).lte('data',ultimo).order('data').range(offset,offset+499);if(error)throw error;dias.push(...(data||[]));if(!data||data.length<500)break}
   const {data:cats,error:erroCats}=await supabase.from('categorias').select('id,nome,tipo');if(erroCats)throw erroCats;
   const categorias=new Map((cats||[]).map(c=>[Number(c.id),{nome:String(c.nome),tipo:c.tipo as 'venda'|'despesa'}]));
   const resultado:Linha[]=[];
   for(let i=0;i<dias.length;i+=75){const lote=dias.slice(i,i+75);const datas=new Map(lote.map(d=>[d.id,d.data]));
    for(let offset=0;;offset+=500){const {data,error}=await supabase.from('movimentos').select('diario_id,categoria_id,valor,descricao').in('diario_id',lote.map(d=>d.id)).range(offset,offset+499);if(error)throw error;
     for(const m of data||[]){const c=categorias.get(Number(m.categoria_id));if(c)resultado.push({data:datas.get(m.diario_id)||primeiro,categoria:c.nome,tipo:c.tipo,valor:Number(m.valor),descricao:m.descricao||''})}
     if(!data||data.length<500)break;
    }
   }
   setLinhas(resultado);setDia('');
  }catch(e){setMensagem('Erro ao carregar histórico: '+erroTexto(e));setLinhas([])}finally{setLoading(false)}
 },[mes]);
 useEffect(()=>{void carregar()},[carregar]);
 const diarios=useMemo(()=>{const mapa=new Map<string,{vendas:number;despesas:number}>();for(const l of linhas){const v=mapa.get(l.data)||{vendas:0,despesas:0};if(l.tipo==='venda')v.vendas+=l.valor;else v.despesas+=l.valor;mapa.set(l.data,v)}return [...mapa.entries()].sort(([a],[b])=>a.localeCompare(b))},[linhas]);
 const vendas=diarios.reduce((n,[,v])=>n+v.vendas,0),despesas=diarios.reduce((n,[,v])=>n+v.despesas,0);
 async function fechar(){
  if(arquivo||fechando||mes>=mesAtual())return;
  if(!window.confirm(`Fechar ${mes}? Será guardada uma cópia definitiva dos movimentos diários. Não será possível alterar este arquivo.`))return;
  setFechando(true);setMensagem('');
  try{
   // Atualizar os dados antes do fecho, para evitar guardar uma visualização desatualizada.
   // O fecho é bloqueado enquanto se confirma a atualização; é necessário clicar novamente.
   const {data:jaFechado,error:check}=await supabase.from('arquivo_mensal').select('mes').eq('mes',mes).maybeSingle();if(check)throw check;
   if(jaFechado)throw new Error('Este mês já foi fechado por outro administrador. Atualiza o histórico.');
   const {error}=await supabase.from('arquivo_mensal').insert({mes,dados:linhas});if(error)throw error;
   await carregar();setMensagem('Mês fechado e arquivado com sucesso.');
  }catch(e){setMensagem('Não foi possível fechar o mês: '+erroTexto(e))}finally{setFechando(false)}
 }
 return <section className="panel" style={{marginTop:16}}>
  <h1>Histórico Mensal</h1><p className="sub">Consulta automática das vendas e despesas do Diário de Bordo. O fecho cria uma cópia histórica permanente do mês.</p>
  <div className="toolbar" style={{alignItems:'end',flexWrap:'wrap'}}><label>Mês<input type="month" value={mes} onChange={e=>setMes(e.target.value)}/></label><button type="button" className="ghost" disabled={loading||fechando} onClick={()=>void carregar()}>Atualizar</button><button type="button" disabled={loading||fechando||!!arquivo||mes>=mesAtual()} onClick={()=>void fechar()}>{arquivo?'Mês fechado':fechando?'A fechar...':'Fechar e guardar mês'}</button></div>
  <p className="sub">{arquivo?`Arquivo fechado em ${new Date(arquivo.fechado_em).toLocaleString('pt-PT')}. Valores históricos protegidos.`:mes>=mesAtual()?'Mês em curso: dados atualizados automaticamente. O fecho estará disponível após terminar o mês.':'Mês aberto: os valores refletem os registos atuais do Diário de Bordo.'}</p>
  {mensagem&&<p role="status" className="status">{mensagem}</p>}
  {loading?<p>A carregar...</p>:<><div className="cards"><div className="metric"><span>Vendas do Diário</span><strong>{eur(vendas)}</strong></div><div className="metric"><span>Despesas do Diário</span><strong>{eur(despesas)}</strong></div><div className="metric"><span>Saldo do Diário</span><strong>{eur(vendas-despesas)}</strong></div></div>
  <p className="sub">Estes totais incluem apenas movimentos do Diário de Bordo. Não incluem automaticamente faturas de fornecedores, despesas exclusivamente mensais nem outros ajustes do Resumo Mensal.</p>
  <h2>Valores diários</h2><div className="tablewrap"><table><thead><tr><th>Dia</th><th>Vendas</th><th>Despesas</th><th>Saldo</th><th>Detalhe</th></tr></thead><tbody>{diarios.map(([d,v])=><tr key={d}><td>{dataPt(d)}</td><td>{eur(v.vendas)}</td><td>{eur(v.despesas)}</td><td>{eur(v.vendas-v.despesas)}</td><td><button type="button" className="link" onClick={()=>setDia(dia===d?'':d)}>{dia===d?'Ocultar':'Ver movimentos'}</button></td></tr>)}</tbody></table></div>
  {diarios.length===0&&<p>Não existem movimentos do Diário de Bordo para este mês.</p>}
  {dia&&<div className="panel" style={{marginTop:16}}><h3>Movimentos de {dataPt(dia)}</h3><div className="tablewrap"><table><thead><tr><th>Tipo</th><th>Categoria</th><th>Descrição</th><th>Valor</th></tr></thead><tbody>{linhas.filter(l=>l.data===dia).map((l,i)=><tr key={i}><td>{l.tipo==='venda'?'Venda':'Despesa'}</td><td>{l.categoria}</td><td>{l.descricao||'—'}</td><td>{eur(l.valor)}</td></tr>)}</tbody></table></div></div>}
  </>}
 </section>
}
