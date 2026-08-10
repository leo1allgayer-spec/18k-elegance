(function(){
  const title=document.querySelector('#payment-title'),text=document.querySelector('#payment-text'),statusEl=document.querySelector('#payment-status'),orderEl=document.querySelector('#payment-order');
  const params=new URLSearchParams(location.search),order=params.get('pedido')||sessionStorage.getItem('elegance-last-order')||'',returnStatus=params.get('status');
  orderEl.textContent=order||'—';
  const labels={paid:['Pagamento confirmado!','Seu pedido foi recebido e já aparece no painel da Elegance.'],pending_payment:['Pagamento em processamento','Estamos aguardando a confirmação do Mercado Pago.'],cancelled:['Pagamento não concluído','Você pode voltar à sacola e tentar novamente.'],refunded:['Pagamento devolvido','O pagamento foi estornado pelo Mercado Pago.']};
  async function check(attempt=0){
    if(!order){title.textContent='Pedido não localizado';text.textContent='Volte à loja e confira sua sacola.';return}
    try{const response=await fetch(`/api/payments/status?pedido=${encodeURIComponent(order)}`),result=await response.json();if(!response.ok)throw new Error();const status=result.order.status,[heading,copy]=labels[status]||labels.pending_payment;title.textContent=heading;text.textContent=copy;statusEl.textContent=heading;statusEl.dataset.status=status;if(status==='paid'){localStorage.removeItem('elegance-cart');return}if(attempt<5&&returnStatus==='success')setTimeout(()=>check(attempt+1),3000)}catch{title.textContent='Consultando pagamento';text.textContent='A confirmação pode levar alguns instantes. Atualize esta página em breve.'}}
  check();
})();
