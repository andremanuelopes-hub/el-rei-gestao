'use client';

import type ExcelJS from 'exceljs';

type Grupo='diario'|'faturas'|'despesas_mensais'|'despesas_caixa'|'acrescimos'|'fornecedores'|'pagamentos'|'banco';
type Linha={data:string;categoria:string;tipo:'venda'|'despesa'|'informativo';valor:number;descricao:string;grupo?:Grupo;id?:string;fornecedor?:string;documento?:string;vencimento?:string;origemPagamento?:string;cliente?:string;tipoFatura?:string;conta?:string;direcao?:string};
type Dados={mes:string;linhas:Linha[];fechado:boolean;fechadoEm:string};
const titulos:Record<Grupo,string>={diario:'Diário de Bordo',faturas:'Faturas Emitidas',despesas_mensais:'Despesas Mensais',despesas_caixa:'Despesas de Caixa',acrescimos:'Acréscimos à Caixa',fornecedores:'Faturas Fornecedores',pagamentos:'Pagamentos Fornecedores',banco:'Banco e Cofre'};
const moeda='#,##0.00 "€";[Red](#,##0.00 "€");–';
const vinho='641D32',creme='F9F3EA',branco='FFFFFF';
const seguro=(v:unknown):string=>{const s=String(v??'');return /^[=+@\-\t\r]/.test(s)?"'"+s:s};
const dataExcel=(s?:string):Date|string=>s&&/^\d{4}-\d{2}-\d{2}$/.test(s)?new Date(`${s}T12:00:00`):s||'';

export async function criarExcelHistorico({mes,linhas,fechado,fechadoEm}:Dados){
 const Excel=(await import('exceljs')).default;
 const livro=new Excel.Workbook();livro.creator='El Rei Gestão';livro.subject='Histórico financeiro mensal';livro.created=new Date();
 const tituloMes=new Date(Number(mes.slice(0,4)),Number(mes.slice(5,7))-1,1).toLocaleDateString('pt-PT',{month:'long',year:'numeric'});
 const ordenadas=[...linhas].sort((a,b)=>a.data.localeCompare(b.data)||String(a.grupo).localeCompare(String(b.grupo)));
 type Coluna={header:string;key:string;width:number;money?:boolean;date?:boolean};
 function folha(nome:string,cols:Coluna[],rows:Record<string,unknown>[]){
  const sh=livro.addWorksheet(nome,{views:[{state:'frozen',ySplit:4,showGridLines:false}],pageSetup:{paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0}});
  sh.columns=cols.map(c=>({key:c.key,width:c.width}));
  sh.mergeCells(1,1,1,cols.length);const h=sh.getCell(1,1);h.value=`PASTELARIA EL REI  |  ${nome.toUpperCase()}`;h.font={bold:true,color:{argb:branco},size:15};h.fill={type:'pattern',pattern:'solid',fgColor:{argb:vinho}};h.alignment={vertical:'middle'};sh.getRow(1).height=32;
  sh.mergeCells(2,1,2,cols.length);const sub=sh.getCell(2,1);sub.value=`${tituloMes}  ·  ${fechado?'Mês fechado':'Mês aberto'}${fechado&&fechadoEm?' · Fechado em '+new Date(fechadoEm).toLocaleString('pt-PT'):''}  ·  Exportado em ${new Date().toLocaleString('pt-PT')}`;sub.font={italic:true,color:{argb:'65545B'},size:10};sh.getRow(2).height=23;
  sh.getRow(4).values=[...cols.map(c=>c.header)];const hr=sh.getRow(4);hr.height=26;hr.eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:vinho}};c.font={bold:true,color:{argb:branco}};c.alignment={vertical:'middle',wrapText:true}});
  rows.forEach((r,i)=>{const row=sh.getRow(i+5);cols.forEach((c,j)=>{const cell=row.getCell(j+1);const val=r[c.key];cell.value=c.date?dataExcel(val as string):typeof val==='number'?val:seguro(val);if(c.money)cell.numFmt=moeda;if(c.date)cell.numFmt='dd/mm/yyyy';cell.alignment={vertical:'top',wrapText:c.width>=25};});if(i%2===0)row.eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:creme}}});});
  sh.autoFilter={from:{row:4,column:1},to:{row:4,column:cols.length}};
  sh.pageSetup.printTitlesRow = '1:4';
return sh;
 }
 const total=(f:(l:Linha)=>boolean)=>ordenadas.filter(f).reduce((s,l)=>s+(Number.isFinite(l.valor)?l.valor:0),0);
 const resumo=[
  ['Vendas operacionais',total(l=>l.tipo==='venda'),'Inclui vendas classificadas no Diário de Bordo'],
  ['Despesas operacionais',total(l=>l.tipo==='despesa'),'Inclui despesas do Diário e despesas mensais'],
  ['Diferença operacional indicativa',total(l=>l.tipo==='venda')-total(l=>l.tipo==='despesa'),'Não equivale ao saldo bancário ou resultado contabilístico'],
  ...Object.entries(titulos).map(([g,t])=>[t,total(l=>(l.grupo||'diario')===g),'Total informativo por origem; não somar novamente à diferença operacional']),
 ];
 folha('Resumo Mensal',[{header:'Indicador',key:'indicador',width:39},{header:'Valor (€)',key:'valor',width:21,money:true},{header:'Notas',key:'notas',width:85}],resumo.map(r=>({indicador:r[0],valor:r[1],notas:r[2]})));
 const comuns:Coluna[]=[{header:'Data',key:'data',width:16,date:true},{header:'Categoria',key:'categoria',width:30},{header:'Descrição',key:'descricao',width:66},{header:'Valor (€)',key:'valor',width:20,money:true}];
 const padrao=(l:Linha)=>({data:l.data,categoria:l.categoria,descricao:l.descricao,valor:l.valor});
 folha('Diário de Bordo',comuns,ordenadas.filter(l=>(l.grupo||'diario')==='diario').map(l=>({...padrao(l),tipo:l.tipo})));
 folha('Faturas Emitidas',[{header:'Data',key:'data',width:16,date:true},{header:'Cliente',key:'cliente',width:34},{header:'N.º fatura',key:'documento',width:24},{header:'Tipo',key:'tipoFatura',width:20},{header:'Descrição',key:'descricao',width:55},{header:'Valor (€)',key:'valor',width:20,money:true}],ordenadas.filter(l=>l.grupo==='faturas').map(l=>({...l})));
 folha('Faturas Fornecedores',[{header:'Data',key:'data',width:16,date:true},{header:'Fornecedor',key:'fornecedor',width:35},{header:'N.º documento',key:'documento',width:26},{header:'Vencimento',key:'vencimento',width:18,date:true},{header:'Descrição',key:'descricao',width:55},{header:'Valor (€)',key:'valor',width:20,money:true}],ordenadas.filter(l=>l.grupo==='fornecedores').map(l=>({...l})));
 folha('Pagamentos Fornecedores',[{header:'Data',key:'data',width:16,date:true},{header:'Fornecedor',key:'fornecedor',width:35},{header:'Documento associado',key:'documento',width:26},{header:'Origem do pagamento',key:'origemPagamento',width:25},{header:'Descrição',key:'descricao',width:55},{header:'Valor pago (€)',key:'valor',width:20,money:true}],ordenadas.filter(l=>l.grupo==='pagamentos').map(l=>({...l})));
 folha('Conta Corrente',[{header:'Data',key:'data',width:16,date:true},{header:'Fornecedor',key:'fornecedor',width:34},{header:'Movimento',key:'categoria',width:27},{header:'Documento',key:'documento',width:24},{header:'Descrição',key:'descricao',width:55},{header:'Fatura / compra (€)',key:'compra',width:23,money:true},{header:'Pagamento (€)',key:'pagamento',width:23,money:true}],ordenadas.filter(l=>l.grupo==='fornecedores'||l.grupo==='pagamentos').map(l=>({...l,compra:l.grupo==='fornecedores'?l.valor:0,pagamento:l.grupo==='pagamentos'?l.valor:0})));
 folha('Banco e Cofre',[{header:'Data',key:'data',width:16,date:true},{header:'Conta',key:'conta',width:22},{header:'Movimento',key:'direcao',width:22},{header:'Descrição',key:'descricao',width:68},{header:'Valor (€)',key:'valor',width:20,money:true}],ordenadas.filter(l=>l.grupo==='banco').map(l=>({...l})));
 folha('Outros Movimentos',[{header:'Data',key:'data',width:16,date:true},{header:'Origem',key:'origem',width:33},{header:'Categoria',key:'categoria',width:32},{header:'Descrição',key:'descricao',width:65},{header:'Valor (€)',key:'valor',width:20,money:true}],ordenadas.filter(l=>['despesas_mensais','despesas_caixa','acrescimos'].includes(l.grupo||'')).map(l=>({...l,origem:titulos[l.grupo!]})));
 folha('Todos os Movimentos',[{header:'Data',key:'data',width:16,date:true},{header:'Origem',key:'origem',width:30},{header:'Categoria',key:'categoria',width:32},{header:'Descrição',key:'descricao',width:64},{header:'Fornecedor / Cliente',key:'entidade',width:32},{header:'Documento',key:'documento',width:25},{header:'Valor (€)',key:'valor',width:20,money:true},{header:'Classificação',key:'tipo',width:21}],ordenadas.map(l=>({...l,origem:titulos[l.grupo||'diario'],entidade:l.fornecedor||l.cliente||''})));
 const bytes=await livro.xlsx.writeBuffer();const blob=new Blob([bytes as BlobPart],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`El_Rei_Historico_Completo_${mes}.xlsx`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
}
