document.addEventListener('DOMContentLoaded', () => {
    const welcomeMessage = document.getElementById('welcome-message');
    const cuentasContainer = document.getElementById('cuentas-container');
    const creditosContainer = document.getElementById('creditos-container');
    const tarjetasContainer = document.getElementById('tarjetas-container');
    const cdtsContainer = document.getElementById('cdts-container');
    const modalForm = document.getElementById('form-modal');
    const modalTrans = document.getElementById('modal-transacciones');
    const modalAmort = document.getElementById('modal-amortizacion');
    const modalRetiro = document.getElementById('modal-retiro');
    let misCuentas = [], misTarjetas = [];

    async function cargarData() {
        const res = await fetch(`/cliente/perfil?t=${new Date().getTime()}`);
        if (res.status === 401) return window.location.href = '/login';
        const data = await res.json();
        welcomeMessage.textContent = `Hola, ${data.nombre}`;
        misCuentas = data.cuentas_ahorros; misTarjetas = data.tarjetas_credito;
        renderCuentas(data.cuentas_ahorros);
        renderCreditos(data.creditos);
        renderTarjetas(data.tarjetas_credito);
        renderCDTs(data.cdts);
        if(data.tipo_cliente === 'Afiliado') {
             document.getElementById('afiliacion-section').style.display = 'none';
             document.getElementById('status-display').textContent = 'AFILIADO';
             document.getElementById('status-display').className = 'status-badge afiliado';
        } else {
             document.getElementById('status-display').textContent = 'NO AFILIADO';
             document.getElementById('status-display').className = 'status-badge no-afiliado';
             document.getElementById('afiliacion-section').style.display = 'block';
        }
    }

    function formatCurrency(v) { return new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0 }).format(v); }

    function renderCuentas(list) {
        cuentasContainer.innerHTML = '';
        if(list.length === 0) cuentasContainer.innerHTML = '<p>No tienes cuentas.</p>';
        list.forEach(c => {
            cuentasContainer.innerHTML += `
            <div class="card producto-card">
                <div class="saldo">$${formatCurrency(c.saldo)}</div>
                <div class="numero-cuenta">Cuenta ${c.numero_cuenta} ${c.exenta_4x1000 ? '<span class="exenta-badge">Exenta</span>' : ''}</div>
                <div class="operacion-item">
                    <input type="number" id="monto-c-${c.id}" class="form-control" placeholder="Monto">
                    <button class="btn btn-verde btn-small" onclick="consignarDirecto(${c.id})">Meter</button>
                </div>
                <div class="card-acciones">
                    <button class="btn btn-info btn-small" onclick="verMovimientos(${c.id}, '${c.numero_cuenta}')">Ver Movimientos</button>
                    ${!c.exenta_4x1000 ? `<button class="btn btn-secondary btn-small" onclick="marcarExenta(${c.id})">Marcar Exenta</button>` : ''}
                    <button class="btn btn-cancelar btn-small" onclick="eliminarCuenta(${c.id})">Eliminar</button>
                </div>
            </div>`;
        });
    }

    function renderCreditos(list) {
        creditosContainer.innerHTML = '';
        if(list.length === 0) creditosContainer.innerHTML = '<p>No tienes créditos.</p>';
        list.forEach(c => {
            creditosContainer.innerHTML += `
            <div class="card producto-card">
                <h4>${c.tipo_credito}</h4>
                <p>Deuda: $${formatCurrency(c.saldo_pendiente)}</p>
                <div class="card-acciones">
                    <button class="btn btn-verde btn-small" onclick="abrirModalPagarCredito(${c.id}, ${c.saldo_pendiente})">Abonar</button>
                    <button class="btn btn-secondary btn-small" onclick="verAmortizacion(${c.id})">Amortización</button>
                </div>
            </div>`;
        });
    }

    function renderTarjetas(list) {
        tarjetasContainer.innerHTML = '';
        if(list.length === 0) tarjetasContainer.innerHTML = '<p>No tienes tarjetas.</p>';
        list.forEach(t => {
            const disp = t.cupo_total - t.cupo_usado;
            const usadoReal = t.cupo_usado < 0 ? 0 : t.cupo_usado;
            let btnPagar = usadoReal > 0 
                ? `<button class="btn btn-verde btn-small" onclick="abrirModalPagarTarjeta(${t.id}, ${usadoReal})">Pagar Tarjeta</button>`
                : `<span style="color:green; font-weight:bold; font-size:0.9rem;">¡Estás al día!</span> <button class="btn btn-cancelar btn-small" onclick="eliminarTarjeta(${t.id})">Eliminar</button>`;
            tarjetasContainer.innerHTML += `
            <div class="card producto-card">
                <h4>Tarjeta ${t.numero_tarjeta}</h4>
                <p>Usado: $${formatCurrency(usadoReal)} / $${formatCurrency(t.cupo_total)}</p>
                <div class="card-acciones">
                    ${btnPagar}
                    <button class="btn btn-info btn-small" onclick="abrirModalAvance(${t.id}, ${disp})">Avance</button>
                </div>
            </div>`;
        });
    }
    
    function renderCDTs(list) {
        cdtsContainer.innerHTML = '';
        if(list.length === 0) cdtsContainer.innerHTML = '<p>No tienes CDTs.</p>';
        list.forEach(c => {
            cdtsContainer.innerHTML += `<div class="card producto-card"><h4>CDT</h4><p>Inversión: $${formatCurrency(c.monto_inversion)}</p></div>`;
        });
    }

    window.consignarDirecto = async (id) => {
        const monto = document.getElementById(`monto-c-${id}`).value;
        if(!monto) return alert("Monto requerido");
        const res = await fetch('/cliente/consignar', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id_cuenta: id, monto: parseFloat(monto)})});
        const data = await res.json(); alert(data.mensaje || data.error); if(res.ok) cargarData();
    }
    window.abrirModalRetiro = () => {
        const sel = document.getElementById('retiro-cuenta-origen'); sel.innerHTML = '';
        if(misCuentas.length === 0) return alert("No tienes cuentas.");
        misCuentas.forEach(c => sel.innerHTML += `<option value="${c.id}">${c.numero_cuenta} ($${formatCurrency(c.saldo)})</option>`);
        document.getElementById('retiro-monto').value = ''; document.getElementById('retiro-error-msg').style.display = 'none'; modalRetiro.style.display = 'block';
    }
    document.getElementById('btn-confirmar-retiro').onclick = async () => {
        const id = document.getElementById('retiro-cuenta-origen').value; const monto = document.getElementById('retiro-monto').value;
        if(!monto || parseFloat(monto)<=0) { document.getElementById('retiro-error-msg').textContent = "Monto inválido"; document.getElementById('retiro-error-msg').style.display = 'block'; return; }
        const res = await fetch('/cliente/retirar', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id_cuenta: id, monto: parseFloat(monto)})});
        const data = await res.json(); if(res.ok) { alert(data.mensaje); modalRetiro.style.display='none'; cargarData(); } else { document.getElementById('retiro-error-msg').textContent = data.error; document.getElementById('retiro-error-msg').style.display = 'block'; }
    }
    window.eliminarCuenta = async (id) => { if(confirm("¿Seguro?")) { const res = await fetch('/cliente/eliminar_cuenta', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id_cuenta: id})}); const data = await res.json(); alert(data.mensaje || data.error); if(res.ok) cargarData(); } };
    window.eliminarTarjeta = async (id) => { if(confirm("¿Seguro?")) { const res = await fetch('/cliente/eliminar_tarjeta', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id_tarjeta: id})}); const data = await res.json(); alert(data.mensaje || data.error); if(res.ok) cargarData(); } };
    window.marcarExenta = async (id) => { const res = await fetch('/cliente/marcar_exenta', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id_cuenta: id})}); if(res.ok) { alert("Cuenta marcada exenta"); cargarData(); } };
    window.verMovimientos = async (id, num) => {
        const res = await fetch(`/cliente/cuenta/${id}/transacciones`);
        const data = await res.json();
        const lista = document.getElementById('transaccion-lista');
        document.getElementById('transacciones-title').textContent = `Movimientos ${num}`;
        lista.innerHTML = '';
        if(data.length===0) lista.innerHTML = '<li>Sin movimientos</li>';
        data.forEach(t => {
            const esDebito = (t.tipo === 'Retiro' || t.tipo === 'Pago'); const tipoTexto = t.tipo === 'Pago' ? 'Impuesto 4x1000' : t.tipo;
            const color = esDebito ? '#e53935' : '#43a047'; const signo = esDebito ? '-' : '+';
            lista.innerHTML += `<li><div><strong>${tipoTexto}</strong><br><small>${t.fecha}</small></div><span style="color:${color};font-weight:bold">${signo}$${formatCurrency(t.monto)}</span></li>`;
        });
        modalTrans.style.display = 'block';
    };
    window.verAmortizacion = async (id) => {
        const res = await fetch(`/cliente/credito/${id}/amortizacion`);
        const data = await res.json();
        document.getElementById('cuota-fija-display').textContent = `Cuota: $${formatCurrency(data.cuota_fija_mensual)}`;
        const tbody = document.getElementById('tabla-amortizacion-body'); tbody.innerHTML = '';
        data.tabla_amortizacion.forEach(f => { tbody.innerHTML += `<tr><td>${f.mes}</td><td>$${formatCurrency(f.cuota)}</td><td>$${formatCurrency(f.interes)}</td><td>$${formatCurrency(f.capital)}</td><td>$${formatCurrency(f.saldo_restante)}</td></tr>`; });
        modalAmort.style.display = 'block';
    };

    window.abrirModal = (tipo) => {
        document.querySelectorAll('#form-modal-body form').forEach(f => f.style.display='none');
        const modal = document.getElementById('form-modal');
        modal.style.display = 'block';
        const poblar = (id) => { const s=document.getElementById(id); s.innerHTML=''; misCuentas.forEach(c=>s.innerHTML+=`<option value="${c.id}">${c.numero_cuenta} ($${formatCurrency(c.saldo)})</option>`); return misCuentas.length>0; };
        const btn = document.getElementById('modal-submit-btn');

        if(tipo === 'cuenta') { modal.style.display = 'none'; if(confirm("Crear cuenta nueva?")) fetch('/cliente/crear_cuenta_ahorros', {method:'POST'}).then(()=>cargarData()); }
        else if (tipo === 'transferir') { if(!poblar('transfer-cuenta-origen') || !poblar('transfer-cuenta-destino')) return alert("Necesitas cuentas"); document.getElementById('form-transferir').style.display='block'; btn.onclick = async () => { const res = await fetch('/cliente/transferir', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id_cuenta_origen: document.getElementById('transfer-cuenta-origen').value, id_cuenta_destino: document.getElementById('transfer-cuenta-destino').value, monto: parseFloat(document.getElementById('transfer-monto').value)})}); const d = await res.json(); alert(d.mensaje||d.error); if(res.ok){modal.style.display='none'; cargarData();} }; }
        else if(tipo==='credito') { if(!poblar('credito-cuenta-destino')) return alert("Necesitas una cuenta para el desembolso"); document.getElementById('form-credito').style.display='block'; btn.onclick = async () => { const res = await fetch('/cliente/solicitar_credito', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({monto: parseFloat(document.getElementById('credito-monto').value), plazo: parseInt(document.getElementById('credito-plazo').value), tipo: document.getElementById('credito-tipo').value, id_cuenta_destino: document.getElementById('credito-cuenta-destino').value})}); if(res.ok){modal.style.display='none'; cargarData(); alert("Solicitado");} }; }
        else if(tipo==='tarjeta') { document.getElementById('form-tarjeta').style.display='block'; btn.onclick = async () => { await fetch('/cliente/solicitar_tarjeta', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({cupo_solicitado: parseFloat(document.getElementById('tarjeta-cupo').value)})}); modal.style.display='none'; cargarData(); }; }
        else if(tipo==='cdt') { if(!poblar('cdt-cuenta-origen')) return alert("Necesitas una cuenta"); document.getElementById('form-cdt').style.display='block'; btn.onclick = async () => { const res = await fetch('/cliente/abrir_cdt', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({monto: parseFloat(document.getElementById('cdt-monto').value), plazo_dias: parseInt(document.getElementById('cdt-plazo').value), id_cuenta_origen: document.getElementById('cdt-cuenta-origen').value})}); const d = await res.json(); alert(d.mensaje||d.error); if(res.ok){modal.style.display='none'; cargarData();} }; }
    };

    window.abrirModalPagarCredito = (id, deuda) => {
        const poblar = (ids) => { const s=document.getElementById(ids); s.innerHTML=''; misCuentas.forEach(c=>s.innerHTML+=`<option value="${c.id}">${c.numero_cuenta} ($${formatCurrency(c.saldo)})</option>`); return misCuentas.length>0; };
        if(!poblar('pagar-credito-cuenta-origen')) return alert("Necesitas una cuenta para pagar");
        document.querySelectorAll('#form-modal-body form').forEach(f => f.style.display='none');
        modalForm.style.display='block';
        document.getElementById('form-pagar-credito').style.display='block';
        document.getElementById('pagar-credito-info').textContent = `Deuda Total: $${formatCurrency(deuda)}`;
        document.getElementById('pagar-credito-monto').value = deuda;
        document.getElementById('modal-submit-btn').onclick = async () => { const res = await fetch('/cliente/pagar_credito', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id_credito: id, id_cuenta_origen: document.getElementById('pagar-credito-cuenta-origen').value, monto: parseFloat(document.getElementById('pagar-credito-monto').value)})}); const d = await res.json(); alert(d.mensaje||d.error); if(res.ok){modalForm.style.display='none'; cargarData();} };
    }
    window.abrirModalPagarTarjeta = (id, cupo) => {
        if(cupo <= 0) return alert("Nada que pagar");
        const poblar = (ids) => { const s=document.getElementById(ids); s.innerHTML=''; misCuentas.forEach(c=>s.innerHTML+=`<option value="${c.id}">${c.numero_cuenta} ($${formatCurrency(c.saldo)})</option>`); return misCuentas.length>0; };
        if(!poblar('pagar-tarjeta-cuenta-origen')) return alert("Necesitas una cuenta para pagar");
        document.querySelectorAll('#form-modal-body form').forEach(f => f.style.display='none');
        modalForm.style.display='block';
        document.getElementById('form-pagar-tarjeta').style.display='block';
        document.getElementById('pagar-tarjeta-info').textContent = `Deuda: $${formatCurrency(cupo)}`;
        document.getElementById('pagar-tarjeta-monto').value = cupo;
        document.getElementById('modal-submit-btn').onclick = async () => { const res = await fetch('/cliente/pagar_tarjeta', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id_tarjeta: id, id_cuenta_origen: document.getElementById('pagar-tarjeta-cuenta-origen').value, monto: parseFloat(document.getElementById('pagar-tarjeta-monto').value)})}); const d = await res.json(); alert(d.mensaje||d.error); if(res.ok){document.getElementById('form-modal').style.display='none'; cargarData();} };
    };
    window.abrirModalAvance = (id, disp) => {
        const poblar = (ids) => { const s=document.getElementById(ids); s.innerHTML=''; misCuentas.forEach(c=>s.innerHTML+=`<option value="${c.id}">${c.numero_cuenta} ($${formatCurrency(c.saldo)})</option>`); return misCuentas.length>0; };
        if(!poblar('avance-cuenta-destino')) return alert("Necesitas una cuenta para recibir el avance");
        document.querySelectorAll('#form-modal-body form').forEach(f => f.style.display='none');
        modalForm.style.display='block';
        document.getElementById('form-avance').style.display='block';
        document.getElementById('avance-info').textContent = `Disponible: $${formatCurrency(disp)}`;
        document.getElementById('modal-submit-btn').onclick = async () => { const res = await fetch('/cliente/realizar_avance', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id_tarjeta: id, id_cuenta_destino: document.getElementById('avance-cuenta-destino').value, monto: parseFloat(document.getElementById('avance-monto').value)})}); const d = await res.json(); alert(d.mensaje||d.error); if(res.ok){document.getElementById('form-modal').style.display='none'; cargarData();} };
    };

    document.querySelectorAll('.close-modal').forEach(b => b.onclick = () => { modalForm.style.display = 'none'; modalTrans.style.display = 'none'; modalAmort.style.display = 'none'; modalRetiro.style.display = 'none'; });
    document.getElementById('logout-button').onclick = async (e) => { e.preventDefault(); await fetch('/cliente/logout', {method:'POST'}); window.location.href='/'; };
    document.getElementById('btn-afiliarme').onclick = async () => { if(confirm("Afiliarme?")) await fetch('/cliente/afiliarme', {method:'POST'}); cargarData(); };
    cargarData();
});