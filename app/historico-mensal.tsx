'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {supabase} from '../lib/supabase';

type Grupo='diario'|'faturas'|'despesas_mensais'|'despesas_caixa'|'acrescimos'|'fornecedores'|'pagamentos'|'banco';
type Linha={data:string;categoria:string;tipo:'venda'|'despesa'|'informativo';valor:number;descricao:string;grupo?:Grupo;id?:string};
type Arquivo={mes:string;fechado_em:string;dados:Linha[]};
const eur=(n:number)=>new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR'}).format(n);
const dataPt=(s:string)=>s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4);
const mesAtual=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`};
const msg=(e:unknown)=>e instanceof Error?e.message:String(e);
const nomes:Record<Grupo,string>={diario:'Diário de Bordo',faturas:'Faturas emitidas',despesas_mensais:'Despesas mensais',despesas_caixa:'Despesas de caixa',acrescimos:'Valores acrescentados à caixa',fornecedores:'Faturas de fornecedores',pagamentos:'Pagamentos a fornecedores',banco:'Banco e Cofre'};
export default function HistoricoMensal(){
 const [mes,setMes]=useState(mesAtual());const [linhas,setLinhas]=useState<Linha[]>([]);
 const [arquivo,setArquivo]=useState<Arquivo|null>(null);const [dia,setDia]=useState('');
 const [filtro,setFiltro]=useState<'todos'|Grupo>('todos');const [loading,setLoading]=useState(false);
 const [fechando,setFechando]=useState(false);const [mensagem,setMensagem]=useState('');
 const buscar=useCallback(async():Promise<Linha[]>=>{
  const primeiro=mes+'-01',ultimo=new Date(Number(mes.slice(0,4)),Number(mes.slice(5,7)),0).toISOString().slice(0,10);
  const ler=async(tabela:string,colunas:string,extra?:(q:any)=>any)=>{
   const todos:any[]=[];
   for(let offset=0;;offset+=500){let q=supabase.from(tabela).select(colunas).gte('data',primeiro).lte('data',ultimo).range(offset,offset+499);if(extra)q=extra(q);
    const {data,error}=await q;if(error)throw new Error(`${tabela}: ${error.message}`);todos.push(...(data||[]));if(!data||data.length<500)break}
   return todos;
  };
  const out:Linha[]=[];
  const dias=await ler('diario_bordo','id,data');
  const {data:cats,error:catError}=await supabase.from('categorias').select('id,nome,tipo');if(catError)throw catError;
  const categorias=new Map((cats||[]).map(c=>[Number(c.id),{nome:String(c.nome),tipo:c.tipo as 'venda'|'despesa'}]));
  for(let i=0;i<dias.length;i+=75){const lote=dias.slice(i,i+75);const datas=new Map(lote.map(d=>[d.id,d.data]));
   for(let offset=0;;offset+=500){const {data,error}=await supabase.from('movimentos').select('id,diario_id,categoria_id,valor,descricao').in('diario_id',lote.map(d=>d.id)).range(offset,offset+499);if(error)throw error;
    for(const m of data||[]){const c=categorias.get(Number(m.categoria_id));if(c)out.push({data:datas.get(m.diario_id)||primeiro,categoria:c.nome,tipo:c.tipo,valor:Number(m.valor),descricao:m.descricao||'',grupo:'diario',id:String(m.id)})}
    if(!data||data.length<500)break;
   }
  }
  const faturas=await ler('faturas_emitidas_internas','id,data,cliente,numero,valor,tipo_fatura');
  for(const f of faturas)out.push({data:f.data,categoria:'Fatura emitida',tipo:'informativo',valor:Number(f.valor),descricao:`${f.cliente||'Cliente'} · ${f.numero||'Sem número'}${f.tipo_fatura?' · '+f.tipo_fatura:''}`,grupo:'faturas',id:String(f.id)});
  const despesas=await ler('despesas_mensais_sem_contribuinte','id,data,descricao,valor');
  for(const d of despesas)out.push({data:d.data,categoria:'Despesa mensal',tipo:'despesa',valor:Number(d.valor),descricao:d.descricao||'',grupo:'despesas_mensais',id:String(d.id)});
  const caixa=await ler('despesas_caixa_gomas','id,data,categoria,valor');
  for(const d of caixa)out.push({data:d.data,categoria:d.categoria||'Despesa de caixa',tipo:'informativo',valor:Number(d.valor),descricao:'Valor de caixa — ver classificação no Resumo Mensal',grupo:'despesas_caixa',id:String(d.id)});
  const acrescimos=await ler('valores_acrescentados_caixa','id,data,valor');
  for(const d of acrescimos)out.push({data:d.data,categoria:'Acrescentado à caixa',tipo:'informativo',valor:Number(d.valor),descricao:'Ajuste interno de caixa',grupo:'acrescimos',id:String(d.id)});
  const fornecedores=await ler('fornecedor_movimentos','id,fornecedor_id,data,tipo,valor,documento,descricao');
  const ids=[...new Set(fornecedores.map(f=>f.fornecedor_id).filter(Boolean))];const nomesFornecedores=new Map<string,string>();
  for(let i=0;i<ids.length;i+=100){const {data,error}=await supabase.from('fornecedores').select('id,nome').in('id',ids.slice(i,i+100));if(error)throw error;for(const f of data||[])nomesFornecedores.set(String(f.id),String(f.nome))}
  for(const f of fornecedores){const compra=f.tipo==='compra';out.push({data:f.data,categoria:compra?'Fatura de fornecedor':'Pagamento a fornecedor',tipo:'informativo',valor:Number(f.valor),descricao:[nomesFornecedores.get(String(f.fornecedor_id))||'Fornecedor',f.documento,f.descricao].filter(Boolean).join(' · '),grupo:compra?'fornecedores':'pagamentos',id:String(f.id)})}
  const banco=await ler('movimentos_banco_cofre','id,conta,data,tipo,descricao,valor');
  for(const b of banco)out.push({data:b.data,categoria:`${b.conta==='banco'?'Banco':'Cofre'} · ${b.tipo==='entrada'?'Entrada':'Saída'}`,tipo:'informativo',valor:Number(b.valor),descricao:b.descricao||'',grupo:'banco',id:String(b.id)});
  return out.sort((a,b)=>a.data.localeCompare(b.data)||String(a.grupo).localeCompare(String(b.grupo)));
 },[mes]);
 const carregar=useCallback(async()=>{setLoading(true);setMensagem('');try{
  const {data:fechado,error}=await supabase.from('arquivo_mensal').select('mes,fechado_em,dados').eq('mes',mes).maybeSingle();if(error)throw new Error('Consulta do arquivo: '+error.message);
  if(fechado){const reg=fechado as Arquivo;setArquivo(reg);setLinhas(reg.dados||[])}else{setArquivo(null);setLinhas(await buscar())}setDia('');
 }catch(e){setMensagem('Erro ao carregar histórico: '+msg(e));setLinhas([])}finally{setLoading(false)}},[mes,buscar]);
 useEffect(()=>{void carregar()},[carregar]);
 const filtradas=useMemo(()=>linhas.filter(l=>filtro==='todos'||(l.grupo||'diario')===filtro),[linhas,filtro]);
 const diarios=useMemo(()=>{const mapa=new Map<string,{vendas:number;despesas:number;movimentos:number}>();for(const l of filtradas){const v=mapa.get(l.data)||{vendas:0,despesas:0,movimentos:0};v.movimentos++;if(l.tipo==='venda')v.vendas+=l.valor;else if(l.tipo==='despesa')v.despesas+=l.valor;mapa.set(l.data,v)}return [...mapa.entries()].sort(([a],[b])=>a.localeCompare(b))},[filtradas]);
 const vendas=linhas.filter(l=>l.tipo==='venda').reduce((n,l)=>n+l.valor,0);
 const despesas=linhas.filter(l=>l.tipo==='despesa').reduce((n,l)=>n+l.valor,0);
 const totalGrupo=(g:Grupo)=>linhas.filter(l=>(l.grupo||'diario')===g).reduce((n,l)=>n+l.valor,0);
 function exportarPDF(){
  if(loading||!linhas.length)return;
  const janela=window.open('','_blank');
  if(!janela){setMensagem('O navegador bloqueou a janela do PDF. Autoriza pop-ups para este site e tenta novamente.');return}
  const escapar=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));
  const tituloMes=new Date(Number(mes.slice(0,4)),Number(mes.slice(5,7))-1,1).toLocaleDateString('pt-PT',{month:'long',year:'numeric'});
  const total=(tipo:Linha['tipo'])=>linhas.filter(l=>l.tipo===tipo).reduce((s,l)=>s+l.valor,0);
  const linhasOrdenadas=[...linhas].sort((a,b)=>a.data.localeCompare(b.data)||String(a.grupo).localeCompare(String(b.grupo)));
  const tabela=linhasOrdenadas.map(l=>`<tr><td>${escapar(dataPt(l.data))}</td><td>${escapar(nomes[l.grupo||'diario'])}</td><td>${escapar(l.categoria)}</td><td>${escapar(l.descricao||'—')}</td><td class="valor">${escapar(eur(l.valor))}</td></tr>`).join('');
  const grupos=(Object.keys(nomes) as Grupo[]).map(g=>`<tr><td>${escapar(nomes[g])}</td><td class="valor">${escapar(eur(totalGrupo(g)))}</td></tr>`).join('');
  const html=`<!doctype html><html lang="pt"><head><meta charset="utf-8"/><title>El Rei - Histórico ${escapar(mes)}</title><style>
   @page{size:A4 landscape;margin:14mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#292326;font-size:10px;margin:0}
   h1{color:#641d32;font-size:22px;margin:0 0 5px}h2{font-size:13px;color:#641d32;margin:18px 0 7px}p{margin:3px 0 9px}.sub{color:#666}
   table{width:100%;border-collapse:collapse}th{text-align:left;background:#641d32;color:#fff;padding:7px 6px}td{border-bottom:1px solid #ddd;padding:6px;vertical-align:top;overflow-wrap:anywhere}
   .valor{text-align:right;white-space:nowrap}tbody tr:nth-child(even){background:#f8f4f5}thead{display:table-header-group}tr{break-inside:avoid}
   .resumo{max-width:500px}.resumo td{padding:5px}.rodape{margin-top:15px;font-size:9px;color:#777}
   @media screen{body{padding:20px;max-width:1200px;margin:auto}}
   </style></head><body><h1>Pastelaria El Rei · Histórico Mensal</h1><p><strong>${escapar(tituloMes)}</strong> · ${arquivo?'Mês fechado e arquivado':'Mês aberto (dados atuais)'}</p>
   <p class="sub">Emitido em ${escapar(new Date().toLocaleString('pt-PT'))} · Todos os movimentos, sem Mercadorias</p>
   <h2>Resumo financeiro</h2><table class="resumo"><tbody><tr><td>Vendas operacionais</td><td class="valor">${escapar(eur(total('venda')))}</td></tr><tr><td>Despesas operacionais</td><td class="valor">${escapar(eur(total('despesa')))}</td></tr><tr><td><strong>Diferença operacional indicativa</strong></td><td class="valor"><strong>${escapar(eur(total('venda')-total('despesa')))}</strong></td></tr>${grupos}</tbody></table>
   <p class="sub">Faturas, pagamentos, Banco e Cofre e ajustes são apresentados separadamente, sem dupla contagem no saldo operacional.</p>
   <h2>Todos os movimentos (${linhasOrdenadas.length})</h2><table><thead><tr><th>Data</th><th>Origem</th><th>Categoria</th><th>Descrição</th><th style="text-align:right">Valor</th></tr></thead><tbody>${tabela}</tbody></table>
   <p class="rodape">El Rei Gestão · Documento de consulta interna. Os valores refletem ${arquivo?'o arquivo fechado':'os registos disponíveis no momento da exportação'}.</p></body></html>`;
  janela.document.open();janela.document.write(html);janela.document.close();
  janela.addEventListener('load',()=>{janela.focus();janela.print()},{once:true});
 }
 async function fechar(){if(arquivo||fechando||loading||mes>=mesAtual())return;
  if(!window.confirm(`Fechar ${mes}? O arquivo ficará protegido contra alterações. Confirma primeiro que todos os movimentos estão corretos.`))return;
  setFechando(true);setMensagem('');try{
   const {data:ja,error:check}=await supabase.from('arquivo_mensal').select('mes').eq('mes',mes).maybeSingle();if(check)throw check;if(ja)throw new Error('O mês já foi fechado por outro administrador.');
   const atualizadas=await buscar();const {error}=await supabase.from('arquivo_mensal').insert({mes,dados:atualizadas});if(error)throw error;
   await carregar();setMensagem('Mês fechado e arquivado com sucesso.');
  }catch(e){setMensagem('Não foi possível fechar o mês: '+msg(e))}finally{setFechando(false)}
 }
 return <section className="panel" style={{marginTop:16}}>
  <h1>Histórico Mensal</h1><p className="sub">Consulta diária de movimentos financeiros. Mercadorias não incluídas. Os totais distinguem movimentos operacionais e informativos para evitar duplicações.</p>
  <div className="toolbar" style={{alignItems:'end',flexWrap:'wrap'}}><label>Mês<input type="month" value={mes} onChange={e=>setMes(e.target.value)}/></label><button type="button" className="ghost" disabled={loading||fechando} onClick={()=>void carregar()}>Atualizar</button><button type="button" className="ghost" disabled={loading||fechando||linhas.length===0} onClick={exportarPDF}>Exportar PDF</button><button type="button" disabled={loading||fechando||!!arquivo||mes>=mesAtual()} onClick={()=>void fechar()}>{arquivo?'Mês fechado':fechando?'A fechar...':'Fechar e guardar mês'}</button></div>
  <p className="sub">{arquivo?`Arquivo fechado em ${new Date(arquivo.fechado_em).toLocaleString('pt-PT')}.`:'Mês aberto: os dados são consultados diretamente nos registos existentes.'}</p>
  {mensagem&&<p role="status" className="status">{mensagem}</p>}
  {loading?<p>A carregar...</p>:<>
   <div className="cards"><div className="metric"><span>Vendas do Diário</span><strong>{eur(vendas)}</strong></div><div className="metric"><span>Despesas do Diário + despesas mensais</span><strong>{eur(despesas)}</strong></div><div className="metric"><span>Diferença operacional indicativa</span><strong>{eur(vendas-despesas)}</strong></div></div>
   <div className="cards">{(['faturas','fornecedores','pagamentos','banco','acrescimos','despesas_caixa'] as Grupo[]).map(g=><div className="metric" key={g}><span>{nomes[g]}</span><strong>{eur(totalGrupo(g))}</strong></div>)}</div>
   <p className="sub">Faturas emitidas, faturas e pagamentos de fornecedores, Banco e Cofre e ajustes de caixa aparecem separadamente: não são somados novamente ao saldo operacional. Movimentos de Banco e Cofre podem incluir transferências internas. As despesas de caixa são mostradas separadamente para evitar dupla contagem.</p>
   <div className="toolbar"><label>Filtrar movimentos<select value={filtro} onChange={e=>{setFiltro(e.target.value as 'todos'|Grupo);setDia('')}}><option value="todos">Todos os movimentos</option>{(Object.keys(nomes) as Grupo[]).map(g=><option key={g} value={g}>{nomes[g]}</option>)}</select></label></div>
   <h2>Movimentos por dia</h2><div className="tablewrap"><table><thead><tr><th>Dia</th><th>Vendas</th><th>Despesas</th><th>Movimentos</th><th>Detalhe</th></tr></thead><tbody>{diarios.map(([d,v])=><tr key={d}><td>{dataPt(d)}</td><td>{eur(v.vendas)}</td><td>{eur(v.despesas)}</td><td>{v.movimentos}</td><td><button type="button" className="link" onClick={()=>setDia(dia===d?'':d)}>{dia===d?'Ocultar':'Ver movimentos'}</button></td></tr>)}</tbody></table></div>
   {diarios.length===0&&<p>Não existem movimentos para este mês e filtro.</p>}
   {dia&&<div className="panel" style={{marginTop:16}}><h3>Movimentos de {dataPt(dia)}</h3><div className="tablewrap"><table><thead><tr><th>Origem</th><th>Categoria</th><th>Descrição</th><th>Valor</th></tr></thead><tbody>{filtradas.filter(l=>l.data===dia).map((l,i)=><tr key={l.id?`${l.grupo}-${l.id}`:i}><td>{nomes[l.grupo||'diario']}</td><td>{l.categoria}</td><td>{l.descricao||'—'}</td><td>{eur(l.valor)}</td></tr>)}</tbody></table></div></div>}
  </>}
 </section>
}
